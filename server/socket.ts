import type { Server as HttpServer } from "http";
import { Server, type Socket } from "socket.io";
import {
  NOTE_LIMITS,
  isValidNoteId,
  type JoinResult,
  type SetPasswordResult,
  type UnlockResult,
  type UpdateResult,
  type YUpdatePayload,
  type YUpdateRequest,
} from "../src/lib/note-types";
import {
  NoteInputError,
  applyNoteUpdate,
  openNote,
  setNotePassword,
  unlockNote,
  validatePassword,
} from "./note-store";
import { FileError, deleteFile, fileEvents, listFiles, renameFile } from "./file-store";
import { isValidFileId, type FileEvent } from "../src/lib/files";

type SocketData = { access: Set<string> };
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

  async function grantAccess(socket: AppSocket, noteId: string) {
    socket.data.access.add(noteId);
    await socket.join(roomName(noteId));
  }

  function hasAccess(socket: AppSocket, noteId: unknown): noteId is string {
    return isValidNoteId(noteId) && socket.data.access.has(noteId);
  }

  /** After a password is set, everyone else in the room must unlock again. */
  async function revokeOthers(noteId: string, except: AppSocket) {
    const sockets = await io.in(roomName(noteId)).fetchSockets();
    for (const remote of sockets) {
      if (remote.id === except.id) continue;
      remote.data.access?.delete(noteId);
      remote.leave(roomName(noteId));
      remote.emit("note:locked", { noteId });
    }
  }

  io.on("connection", (rawSocket) => {
    const socket = rawSocket as AppSocket;
    socket.data.access = new Set();
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
          socket.data.access.delete(noteId);
          await socket.leave(roomName(noteId));
          return reply({ ok: true, status: "locked" });
        }
        await grantAccess(socket, noteId);
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
        await grantAccess(socket, noteId);
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
      async (input: { noteId?: unknown; password?: unknown }, ack: unknown) => {
        const reply = safeAck<SetPasswordResult>(ack);
        if (!hasAccess(socket, input?.noteId)) return reply({ ok: false, error: "No access" });
        const noteId = input.noteId;
        const clearing = input.password === null;
        const password = clearing ? null : validatePassword(input.password);
        if (!clearing && !password) {
          return reply({ ok: false, error: `Use 1–${NOTE_LIMITS.passwordMax} characters.` });
        }
        try {
          const token = await setNotePassword(noteId, password);
          if (!clearing) await revokeOthers(noteId, socket);
          socket.to(roomName(noteId)).emit("note:lock-state", { noteId, locked: !clearing });
          reply({ ok: true, token });
        } catch (error) {
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

    socket.on("note:leave", async (noteId: unknown) => {
      if (!isValidNoteId(noteId)) return;
      socket.data.access.delete(noteId);
      await socket.leave(roomName(noteId));
    });
  });

  // Uploads arrive over HTTP; tell everyone viewing the note.
  fileEvents.on("event", (event: FileEvent) => {
    io.to(roomName(event.noteId)).emit("note:file-event", event);
  });

  return io;
}
