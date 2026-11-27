import type { Server as HttpServer } from "http";
import { Server, type Socket } from "socket.io";
import {
  NOTE_LIMITS,
  cleanRelockMinutes,
  isValidNoteId,
  type LockStateEvent,
  type LockedEvent,
  type JoinResult,
  type SetPasswordResult,
  type UnlockResult,
  type UpdateResult,
  type YUpdatePayload,
  type YUpdateRequest,
} from "../src/lib/note-types";
import {
  NoteInputError,
  accessExpiry,
  applyNoteUpdate,
  openNote,
  setNotePassword,
  unlockNote,
  noteLabel,
  validatePassword,
} from "./note-store";
import {
  addSubscription,
  cleanSubscription,
  clearSubscriptions,
  countSubscriptions,
  pushPublicKey,
  removeSubscription,
  sendPush,
} from "./push";
import type { PushPayload } from "../src/lib/push-types";
import { cleanGif } from "../src/lib/gifs";
import { FileError, deleteFile, fileEvents, listFiles, renameFile } from "./file-store";
import { isValidFileId, type FileEvent } from "../src/lib/files";
import {
  CHAT_LIMITS,
  cleanUser,
  type ChatAttachment,
  type ChatMessage,
  type ChatUser,
  type PresenceList,
  type TypingEvent,
} from "../src/lib/chat";
import { ChatError, addMessage, deleteForEveryone, editMessage, recentMessages, toggleReaction } from "./chat-store";

type SocketData = {
  access: Set<string>;
  /** When each note's access was granted (token issue time); null = note has no password. */
  grants: Map<string, number | null>;
  /** "Lock again after" timers per note. */
  timers: Map<string, NodeJS.Timeout>;
  /** Notes this connection is looking at right now (page visible and focused). */
  looking: Set<string>;
};

/** setTimeout can't wait longer than ~24.8 days; longer waits re-check when they fire. */
const MAX_TIMER_MS = 2 ** 31 - 1;
type AppSocket = Socket & { data: SocketData };
type Ack<T> = (result: T) => void;

function roomName(noteId: string) {
  return `note:${noteId}`;
}

// ---- unlock brute-force guard ---------------------------------------------

const UNLOCK_WINDOW_MS = 5 * 60 * 1000;
const UNLOCK_MAX_ATTEMPTS = 10;
const unlockAttempts = new Map<string, { count: number; resetAt: number }>();

function allowUnlockAttempt(key: string) {
  const now = Date.now();
  const entry = unlockAttempts.get(key);
  if (!entry || entry.resetAt < now) {
    unlockAttempts.set(key, { count: 1, resetAt: now + UNLOCK_WINDOW_MS });
    return true;
  }
  entry.count += 1;
  return entry.count <= UNLOCK_MAX_ATTEMPTS;
}

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of unlockAttempts) {
    if (entry.resetAt < now) unlockAttempts.delete(key);
  }
}, UNLOCK_WINDOW_MS).unref();

// ---------------------------------------------------------------------------

function safeAck<T>(ack: unknown): Ack<T> {
  return typeof ack === "function" ? (ack as Ack<T>) : () => {};
}

function toBytes(value: unknown): Uint8Array | null {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  return null;
}

export function attachSocketServer(httpServer: HttpServer) {
  const io = new Server(httpServer, {
    // Same origin as the web app; only allow an extra origin when explicitly configured.
    cors: process.env.SOCKET_CORS_ORIGIN
      ? { origin: process.env.SOCKET_CORS_ORIGIN.split(",") }
      : undefined,
    // Notes are text (media is uploaded over HTTP); leave headroom over the doc cap.
    maxHttpBufferSize: NOTE_LIMITS.docMaxBytes + 256 * 1024,
    // Don't kill upgrade requests that belong to Next.js (dev HMR).
    destroyUpgrade: false,
  });

  // ---- presence: who is viewing each note (in memory, per connection) ----
  const presence = new Map<string, Map<string, ChatUser>>();

  function presenceList(noteId: string): ChatUser[] {
    // One entry per person, even with the note open in several tabs.
    const unique = new Map<string, ChatUser>();
    for (const user of presence.get(noteId)?.values() ?? []) unique.set(user.id, user);
    return [...unique.values()];
  }

  function broadcastPresence(noteId: string) {
    io.to(roomName(noteId)).emit("note:presence", {
      noteId,
      users: presenceList(noteId),
    } satisfies PresenceList);
  }

  function setPresence(socketId: string, noteId: string, user: ChatUser | null) {
    let entries = presence.get(noteId);
    if (user) {
      if (!entries) presence.set(noteId, (entries = new Map()));
      entries.set(socketId, user);
    } else if (entries) {
      entries.delete(socketId);
      if (!entries.size) presence.delete(noteId);
    }
    broadcastPresence(noteId);
  }

  // ---- push notifications (people who aren't looking at the note) ----
  /** People with the note open and in front of them: they see it live, so no push. */
  async function lookingUserIds(noteId: string) {
    const ids = new Set<string>();
    const entries = presence.get(noteId);
    if (!entries) return ids;
    for (const other of (await io.in(roomName(noteId)).fetchSockets()) as unknown as AppSocket[]) {
      const user = entries.get(other.id);
      if (user && other.data.looking?.has(noteId)) ids.add(user.id);
    }
    return ids;
  }

  async function notifyNote(
    noteId: string,
    actorId: string | undefined,
    kind: "chat" | "files",
    body: string,
    audience: { only?: Set<string>; skip?: Set<string> } = {},
  ) {
    try {
      const skip = await lookingUserIds(noteId);
      if (actorId) skip.add(actorId);
      for (const id of audience.skip ?? []) skip.add(id);
      const label = await noteLabel(noteId);
      const base = (process.env.PUBLIC_URL ?? "").replace(/\/+$/, "");
      const payload: PushPayload = {
        title: kind === "chat" ? `New message · ${label}` : `New file · ${label}`,
        body,
        tag: `${kind}:${noteId}`,
        url: `${base}/${noteId}#${kind}`,
        topic: `${kind}-${noteId}`.slice(0, 32),
      };
      await sendPush(noteId, skip, payload, audience.only);
    } catch (error) {
      console.warn("push notify failed", (error as Error).message);
    }
  }

  // Reactions: 30 per 10 seconds per connection.
  const reactLog = new Map<string, number[]>();
  function allowReact(socketId: string) {
    const now = Date.now();
    const recent = (reactLog.get(socketId) ?? []).filter((at) => now - at < 10_000);
    if (recent.length >= 30) return false;
    recent.push(now);
    reactLog.set(socketId, recent);
    return true;
  }

  // Chat send limit: 12 messages per 10 seconds per connection.
  const sendLog = new Map<string, number[]>();
  function allowSend(socketId: string) {
    const now = Date.now();
    const recent = (sendLog.get(socketId) ?? []).filter((at) => now - at < 10_000);
    if (recent.length >= 12) {
      sendLog.set(socketId, recent);
      return false;
    }
    recent.push(now);
    sendLog.set(socketId, recent);
    return true;
  }

  /** The real socket object (fetchSockets returns lightweight copies). */
  function realSocket(id: string) {
    return io.sockets.sockets.get(id) as AppSocket | undefined;
  }

  function clearTimer(socket: AppSocket, noteId: string) {
    const timer = socket.data.timers.get(noteId);
    if (timer) clearTimeout(timer);
    socket.data.timers.delete(noteId);
  }

  /** Takes away a viewer's access to a note; their page shows the lock screen. */
  function revoke(socket: AppSocket, noteId: string, reason: LockedEvent["reason"]) {
    clearTimer(socket, noteId);
    socket.data.access.delete(noteId);
    socket.data.grants.delete(noteId);
    void socket.leave(roomName(noteId));
    setPresence(socket.id, noteId, null);
    socket.emit("note:locked", { noteId, reason } satisfies LockedEvent);
  }

  /** Locks the viewer out again when their unlock expires ("lock again after"). */
  async function scheduleExpiry(socket: AppSocket, noteId: string) {
    clearTimer(socket, noteId);
    const issuedAt = socket.data.grants.get(noteId);
    if (issuedAt === null || issuedAt === undefined) return;
    const expiry = await accessExpiry(noteId, issuedAt);
    if (expiry === null || !socket.data.access.has(noteId)) return;
    const delay = expiry - Date.now();
    if (delay <= 0) return revoke(socket, noteId, "expired");
    socket.data.timers.set(
      noteId,
      setTimeout(() => void scheduleExpiry(socket, noteId), Math.min(delay, MAX_TIMER_MS)),
    );
  }

  async function grantAccess(socket: AppSocket, noteId: string, issuedAt: number | null) {
    socket.data.access.add(noteId);
    socket.data.grants.set(noteId, issuedAt);
    await socket.join(roomName(noteId));
    await scheduleExpiry(socket, noteId);
  }

  function hasAccess(socket: AppSocket, noteId: unknown): noteId is string {
    return isValidNoteId(noteId) && socket.data.access.has(noteId);
  }

  /** Everyone else viewing a note (real sockets). */
  async function othersInRoom(noteId: string, except: AppSocket) {
    const sockets = await io.in(roomName(noteId)).fetchSockets();
    return sockets
      .filter((remote) => remote.id !== except.id)
      .map((remote) => realSocket(remote.id))
      .filter((socket): socket is AppSocket => Boolean(socket));
  }

  io.on("connection", (rawSocket) => {
    const socket = rawSocket as AppSocket;
    socket.data.access = new Set();
    socket.data.grants = new Map();
    socket.data.timers = new Map();
    socket.data.looking = new Set();
    // Only trust X-Forwarded-For behind your own reverse proxy (TRUST_PROXY=1); otherwise
    // anyone could send a fake one to dodge the unlock rate limit.
    const forwarded =
      process.env.TRUST_PROXY === "1"
        ? (socket.handshake.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim()
        : undefined;
    const clientKey = forwarded || socket.handshake.address;

    socket.on("note:join", async (input: { noteId?: unknown; token?: unknown }, ack: unknown) => {
      const reply = safeAck<JoinResult>(ack);
      const noteId = input?.noteId;
      if (!isValidNoteId(noteId)) return reply({ ok: false, error: "Invalid note id" });
      try {
        const result = await openNote(noteId, input.token);
        if (result.status === "locked") {
          clearTimer(socket, noteId);
          socket.data.access.delete(noteId);
          socket.data.grants.delete(noteId);
          await socket.leave(roomName(noteId));
          return reply({ ok: true, status: "locked" });
        }
        await grantAccess(socket, noteId, result.issuedAt);
        reply({ ok: true, status: "open", note: result.note });
      } catch (error) {
        console.error("note:join failed", error);
        reply({ ok: false, error: "Failed to open note" });
      }
    });

    socket.on("note:unlock", async (input: { noteId?: unknown; password?: unknown }, ack: unknown) => {
      const reply = safeAck<UnlockResult>(ack);
      const noteId = input?.noteId;
      const password = validatePassword(input?.password);
      if (!isValidNoteId(noteId) || !password) {
        return reply({ ok: false, error: "That password doesn’t match." });
      }
      if (!allowUnlockAttempt(`${clientKey}:${noteId}`)) {
        return reply({ ok: false, error: "Too many attempts. Try again in a few minutes." });
      }
      try {
        const result = await unlockNote(noteId, password);
        if (!result) return reply({ ok: false, error: "That password doesn’t match." });
        await grantAccess(socket, noteId, result.issuedAt);
        reply({ ok: true, token: result.token, note: result.note });
      } catch (error) {
        console.error("note:unlock failed", error);
        reply({ ok: false, error: "Failed to unlock note" });
      }
    });

    socket.on("note:yupdate", async (input: YUpdateRequest, ack: unknown) => {
      const reply = safeAck<UpdateResult>(ack);
      if (!hasAccess(socket, input?.noteId)) return reply({ ok: false, error: "No access", resync: true });
      const update = toBytes(input.update);
      if (!update) return reply({ ok: false, error: "Invalid change", resync: true });
      try {
        await applyNoteUpdate(input.noteId, update);
        socket.to(roomName(input.noteId)).emit("note:yupdate", {
          noteId: input.noteId,
          update,
        } satisfies YUpdatePayload);
        reply({ ok: true });
      } catch (error) {
        if (error instanceof NoteInputError) {
          return reply({ ok: false, error: error.message, resync: true });
        }
        console.error("note:yupdate failed", error);
        reply({ ok: false, error: "Failed to save note" });
      }
    });

    socket.on(
      "note:set-password",
      async (input: { noteId?: unknown; password?: unknown; relockMinutes?: unknown }, ack: unknown) => {
        const reply = safeAck<SetPasswordResult>(ack);
        if (!hasAccess(socket, input?.noteId)) return reply({ ok: false, error: "No access" });
        const noteId = input.noteId;
        // password: string = set new, null = remove, missing = keep (only change the re-lock time).
        const keep = input.password === undefined;
        const clearing = input.password === null;
        const password = keep ? undefined : clearing ? null : validatePassword(input.password);
        if (!keep && !clearing && !password) {
          return reply({ ok: false, error: `Use 1–${NOTE_LIMITS.passwordMax} characters.` });
        }
        const relockMinutes = input.relockMinutes === undefined ? null : cleanRelockMinutes(input.relockMinutes);
        if (relockMinutes === undefined) {
          return reply({ ok: false, error: "Choose a time between 1 minute and 30 days." });
        }
        try {
          const result = await setNotePassword(noteId, password, relockMinutes);
          // A new password: others must unlock (and opt in to notifications) again.
          if (result.passwordChanged) {
            const me = presence.get(noteId)?.get(socket.id);
            await clearSubscriptions(noteId, me?.id);
          }
          // The person changing it stays in, with a fresh unlock.
          socket.data.grants.set(noteId, clearing ? null : result.issuedAt);
          await scheduleExpiry(socket, noteId);
          for (const other of await othersInRoom(noteId, socket)) {
            if (clearing) {
              clearTimer(other, noteId);
              other.data.grants.set(noteId, null);
            } else if (result.passwordChanged) {
              revoke(other, noteId, "password-set"); // new password: everyone else unlocks again
            } else {
              await scheduleExpiry(other, noteId); // same password, new re-lock time
            }
          }
          socket.to(roomName(noteId)).emit("note:lock-state", {
            noteId,
            locked: !clearing,
            relockMinutes: clearing ? null : relockMinutes,
          } satisfies LockStateEvent);
          reply({ ok: true, token: clearing ? "" : result.token });
        } catch (error) {
          if (error instanceof NoteInputError) return reply({ ok: false, error: error.message });
          console.error("note:set-password failed", error);
          reply({ ok: false, error: "Failed to update password" });
        }
      },
    );

    // ---- media manager ----
    socket.on("note:files", async (input: { noteId?: unknown }, ack: unknown) => {
      const reply = safeAck<object>(ack);
      if (!hasAccess(socket, input?.noteId)) return reply({ ok: false, error: "No access" });
      try {
        reply({ ok: true, ...(await listFiles(input.noteId)) });
      } catch (error) {
        console.error("note:files failed", error);
        reply({ ok: false, error: "Couldn’t load files" });
      }
    });

    socket.on(
      "note:file-delete",
      async (input: { noteId?: unknown; fileId?: unknown }, ack: unknown) => {
        const reply = safeAck<object>(ack);
        if (!hasAccess(socket, input?.noteId)) return reply({ ok: false, error: "No access" });
        if (!isValidFileId(input.fileId)) return reply({ ok: false, error: "File not found" });
        try {
          await deleteFile(input.noteId, input.fileId);
          reply({ ok: true });
        } catch (error) {
          if (!(error instanceof FileError)) console.error("note:file-delete failed", error);
          reply({ ok: false, error: error instanceof FileError ? error.message : "Couldn’t delete file" });
        }
      },
    );

    socket.on(
      "note:file-rename",
      async (input: { noteId?: unknown; fileId?: unknown; name?: unknown }, ack: unknown) => {
        const reply = safeAck<object>(ack);
        if (!hasAccess(socket, input?.noteId)) return reply({ ok: false, error: "No access" });
        if (!isValidFileId(input.fileId) || typeof input.name !== "string" || !input.name.trim()) {
          return reply({ ok: false, error: "Invalid name" });
        }
        try {
          const file = await renameFile(input.noteId, input.fileId, input.name);
          reply({ ok: true, file });
        } catch (error) {
          if (!(error instanceof FileError)) console.error("note:file-rename failed", error);
          reply({ ok: false, error: error instanceof FileError ? error.message : "Couldn’t rename file" });
        }
      },
    );

    // ---- chat, presence, typing ----
    socket.on("note:presence", (input: { noteId?: unknown; user?: unknown }) => {
      if (!hasAccess(socket, input?.noteId)) return;
      const user = cleanUser(input.user);
      if (user) setPresence(socket.id, input.noteId, user);
    });

    socket.on("note:chat-history", async (input: { noteId?: unknown }, ack: unknown) => {
      const reply = safeAck<object>(ack);
      if (!hasAccess(socket, input?.noteId)) return reply({ ok: false, error: "No access" });
      try {
        reply({ ok: true, messages: await recentMessages(input.noteId) });
      } catch (error) {
        console.error("note:chat-history failed", error);
        reply({ ok: false, error: "Couldn’t load messages" });
      }
    });

    socket.on(
      "note:chat-send",
      async (
        input: {
          noteId?: unknown;
          user?: unknown;
          text?: unknown;
          attachments?: unknown;
          mentions?: unknown;
          replyTo?: unknown;
          secret?: unknown;
          gif?: unknown;
        },
        ack: unknown,
      ) => {
        const reply = safeAck<object>(ack);
        if (!hasAccess(socket, input?.noteId)) return reply({ ok: false, error: "No access" });
        const author = cleanUser(input.user);
        if (!author) return reply({ ok: false, error: "Set your name first" });
        if (!allowSend(socket.id)) return reply({ ok: false, error: "You’re sending messages too fast" });

        // Attachments must be files already in this note's Files.
        let attachments: ChatAttachment[] = [];
        if (input.attachments !== undefined) {
          const ids = input.attachments;
          if (!Array.isArray(ids) || ids.length > CHAT_LIMITS.attachmentsMax || !ids.every(isValidFileId)) {
            return reply({ ok: false, error: "Invalid attachments" });
          }
          const { files } = await listFiles(input.noteId);
          const byId = new Map(files.map((file) => [file.id, file]));
          if (!ids.every((id) => byId.has(id))) return reply({ ok: false, error: "A file is no longer available" });
          attachments = [...new Set(ids)].map((id) => {
            const file = byId.get(id)!;
            return { id: file.id, name: file.name, kind: file.kind, size: file.size, mime: file.mime };
          });
        }

        try {
          const message = await addMessage(
            input.noteId,
            author,
            input.text ?? "",
            attachments,
            input.mentions,
            input.replyTo,
            input.secret,
            input.gif === undefined ? null : cleanGif(input.gif),
          );
          io.to(roomName(input.noteId)).emit("note:chat-message", {
            noteId: input.noteId,
            message,
          } satisfies { noteId: string; message: ChatMessage });
          reply({ ok: true, message });
          // Never the text — only who sent something. People who were @mentioned are told so.
          const fileCount = attachments.length;
          const mentioned = new Set((message.mentions ?? []).map((user) => user.id));
          if (mentioned.size) {
            void notifyNote(input.noteId, author.id, "chat", `${author.name} mentioned you`, { only: mentioned });
          }
          // Whoever was replied to hears "replied to you" (unless they were @mentioned already).
          const repliedTo = message.replyTo?.author.id;
          if (repliedTo && repliedTo !== author.id && !mentioned.has(repliedTo)) {
            void notifyNote(input.noteId, author.id, "chat", `${author.name} replied to you`, { only: new Set([repliedTo]) });
            mentioned.add(repliedTo);
          }
          void notifyNote(
            input.noteId,
            author.id,
            "chat",
            message.gif && !message.text
              ? `${author.name} sent a GIF`
              : fileCount
              ? `${author.name} sent ${fileCount === 1 ? "a file" : `${fileCount} files`}`
              : `${author.name} sent a message`,
            { skip: mentioned },
          );
        } catch (error) {
          if (error instanceof ChatError) return reply({ ok: false, error: error.message });
          console.error("note:chat-send failed", error);
          reply({ ok: false, error: "Couldn’t send message" });
        }
      },
    );

    socket.on(
      "note:chat-react",
      async (input: { noteId?: unknown; messageId?: unknown; emoji?: unknown; user?: unknown }, ack: unknown) => {
        const reply = safeAck<object>(ack);
        if (!hasAccess(socket, input?.noteId)) return reply({ ok: false, error: "No access" });
        const user = cleanUser(input.user);
        if (!user) return reply({ ok: false, error: "Set your name first" });
        if (!allowReact(socket.id)) return reply({ ok: false, error: "Slow down a little" });
        try {
          const message = await toggleReaction(input.noteId, input.messageId, input.emoji, user);
          io.to(roomName(input.noteId)).emit("note:chat-update", { noteId: input.noteId, message });
          reply({ ok: true, message });
        } catch (error) {
          if (error instanceof ChatError) return reply({ ok: false, error: error.message });
          console.error("note:chat-react failed", error);
          reply({ ok: false, error: "Couldn’t react" });
        }
      },
    );

    socket.on(
      "note:chat-edit",
      async (
        input: { noteId?: unknown; messageId?: unknown; secret?: unknown; text?: unknown; mentions?: unknown },
        ack: unknown,
      ) => {
        const reply = safeAck<object>(ack);
        if (!hasAccess(socket, input?.noteId)) return reply({ ok: false, error: "No access" });
        if (!allowSend(socket.id)) return reply({ ok: false, error: "You’re sending messages too fast" });
        try {
          const changed = await editMessage(input.noteId, input.messageId, input.secret, input.text, input.mentions);
          for (const message of changed) io.to(roomName(input.noteId)).emit("note:chat-update", { noteId: input.noteId, message });
          reply({ ok: true, message: changed[0] });
        } catch (error) {
          if (error instanceof ChatError) return reply({ ok: false, error: error.message });
          console.error("note:chat-edit failed", error);
          reply({ ok: false, error: "Couldn’t edit the message" });
        }
      },
    );

    socket.on(
      "note:chat-delete",
      async (input: { noteId?: unknown; messageId?: unknown; secret?: unknown }, ack: unknown) => {
        const reply = safeAck<object>(ack);
        if (!hasAccess(socket, input?.noteId)) return reply({ ok: false, error: "No access" });
        if (!allowSend(socket.id)) return reply({ ok: false, error: "Slow down a little" });
        try {
          const changed = await deleteForEveryone(input.noteId, input.messageId, input.secret);
          for (const message of changed) io.to(roomName(input.noteId)).emit("note:chat-update", { noteId: input.noteId, message });
          reply({ ok: true, message: changed[0] });
        } catch (error) {
          if (error instanceof ChatError) return reply({ ok: false, error: error.message });
          console.error("note:chat-delete failed", error);
          reply({ ok: false, error: "Couldn’t delete the message" });
        }
      },
    );

    socket.on("note:typing", (input: { noteId?: unknown; user?: unknown }) => {
      if (!hasAccess(socket, input?.noteId)) return;
      const user = cleanUser(input.user);
      if (!user) return;
      socket.to(roomName(input.noteId)).emit("note:typing", { noteId: input.noteId, user } satisfies TypingEvent);
    });

    socket.on("note:looking", (input: { noteId?: unknown; looking?: unknown }) => {
      if (!hasAccess(socket, input?.noteId)) return;
      if (input.looking === true) socket.data.looking.add(input.noteId);
      else socket.data.looking.delete(input.noteId);
    });

    socket.on("push:key", async (_input: unknown, ack: unknown) => {
      const reply = safeAck<object>(ack);
      try {
        reply({ ok: true, key: await pushPublicKey() });
      } catch (error) {
        console.error("push:key failed", error);
        reply({ ok: false, error: "Push isn’t available" });
      }
    });

    socket.on(
      "note:push-subscribe",
      async (input: { noteId?: unknown; userId?: unknown; subscription?: unknown }, ack: unknown) => {
        const reply = safeAck<object>(ack);
        if (!hasAccess(socket, input?.noteId)) return reply({ ok: false, error: "No access" });
        const subscription = cleanSubscription(input.subscription);
        const userId = input.userId;
        if (!subscription || typeof userId !== "string" || !/^[A-Za-z0-9_-]{8,64}$/.test(userId)) {
          return reply({ ok: false, error: "Invalid subscription" });
        }
        try {
          await addSubscription(input.noteId, userId, subscription);
          reply({ ok: true });
        } catch (error) {
          console.error("note:push-subscribe failed", error);
          reply({ ok: false, error: "Couldn’t turn on notifications" });
        }
      },
    );

    // "Send test notification": a real push to this person's devices in a few seconds,
    // so they can switch away and check that notifications actually arrive.
    const lastTest = { at: 0 };
    socket.on("push:test", async (input: { noteId?: unknown; userId?: unknown }, ack: unknown) => {
      const reply = safeAck<object>(ack);
      if (!hasAccess(socket, input?.noteId)) return reply({ ok: false, error: "No access" });
      const userId = input.userId;
      if (typeof userId !== "string" || !/^[A-Za-z0-9_-]{8,64}$/.test(userId)) return reply({ ok: false, error: "Invalid user" });
      if (Date.now() - lastTest.at < 15_000) return reply({ ok: false, error: "Wait a few seconds before sending another test." });
      lastTest.at = Date.now();
      const noteId = input.noteId;
      const devices = await countSubscriptions(noteId, userId);
      reply({ ok: true, devices });
      if (!devices) return;
      setTimeout(() => {
        const base = (process.env.PUBLIC_URL ?? "").replace(/\/+$/, "");
        void sendPush(
          noteId,
          new Set(),
          {
            title: "ShareAnything test",
            body: "Notifications work on this device 🎉",
            tag: `test:${noteId}`,
            url: `${base}/${noteId}#chat`,
            topic: `test-${noteId}`.slice(0, 32),
          },
          new Set([userId]),
        );
      }, 3000);
    });

    socket.on("note:push-unsubscribe", async (input: { noteId?: unknown; endpoint?: unknown }, ack: unknown) => {
      const reply = safeAck<object>(ack);
      if (!isValidNoteId(input?.noteId) || typeof input.endpoint !== "string") return reply({ ok: false });
      try {
        await removeSubscription(input.noteId, input.endpoint);
        reply({ ok: true });
      } catch {
        reply({ ok: false });
      }
    });

    socket.on("note:leave", async (noteId: unknown) => {
      if (!isValidNoteId(noteId)) return;
      clearTimer(socket, noteId);
      socket.data.access.delete(noteId);
      socket.data.grants.delete(noteId);
      socket.data.looking.delete(noteId);
      await socket.leave(roomName(noteId));
      setPresence(socket.id, noteId, null);
    });

    socket.on("disconnect", () => {
      sendLog.delete(socket.id);
      reactLog.delete(socket.id);
      for (const timer of socket.data.timers.values()) clearTimeout(timer);
      socket.data.timers.clear();
      for (const [noteId, entries] of presence) {
        if (entries.has(socket.id)) setPresence(socket.id, noteId, null);
      }
    });
  });

  // Uploads arrive over HTTP; tell everyone viewing the note.
  fileEvents.on("event", (event: FileEvent) => {
    io.to(roomName(event.noteId)).emit("note:file-event", event);
    // Files sent in chat are announced by the chat message instead.
    if (event.type === "added" && !event.viaChat) {
      void notifyNote(event.noteId, event.uploaderId, "files", `${event.file.uploadedBy ?? "Someone"} shared a file`);
    }
  });

  return io;
}
