import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import {
  CHAT_LIMITS,
  cleanMentions,
  isReactionEmoji,
  type ChatAttachment,
  type ChatMessage,
  type ChatReplyRef,
  type ChatUser,
} from "../src/lib/chat";
import type { ChatGif } from "../src/lib/gifs";
import { isValidNoteId } from "../src/lib/note-types";

/** Per-note chat history, stored next to the note as .data/notes/<id>.chat.json. */

const NOTES_DIR = path.join(process.cwd(), ".data", "notes");

export class ChatError extends Error {}

const histories = new Map<string, Promise<ChatMessage[]>>();
const locks = new Map<string, Promise<unknown>>();

export function chatPath(noteId: string) {
  if (!isValidNoteId(noteId)) throw new ChatError("Invalid note id");
  return path.join(NOTES_DIR, `${noteId}.chat.json`);
}

function withLock<T>(noteId: string, task: () => Promise<T>): Promise<T> {
  const previous = locks.get(noteId) ?? Promise.resolve();
  const run = previous.then(task, task);
  const settled = run.catch(() => undefined);
  locks.set(noteId, settled);
  void settled.then(() => {
    if (locks.get(noteId) === settled) locks.delete(noteId);
  });
  return run;
}

function load(noteId: string): Promise<ChatMessage[]> {
  let entry = histories.get(noteId);
  if (!entry) {
    entry = fs
      .readFile(chatPath(noteId), "utf8")
      .then((raw) => JSON.parse(raw) as ChatMessage[])
      .catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return [];
        throw error;
      });
    histories.set(noteId, entry);
    entry.catch(() => histories.delete(noteId));
  }
  return entry;
}

async function save(noteId: string, messages: ChatMessage[]) {
  await fs.mkdir(NOTES_DIR, { recursive: true });
  const target = chatPath(noteId);
  const temp = `${target}.${randomBytes(6).toString("hex")}.tmp`;
  await fs.writeFile(temp, JSON.stringify(messages), "utf8");
  await fs.rename(temp, target);
}

/** The most recent messages, oldest first. */
export async function recentMessages(noteId: string, limit: number = CHAT_LIMITS.historyPage) {
  const messages = await load(noteId);
  return messages.slice(-limit).map(publicMessage);
}

export async function addMessage(
  noteId: string,
  author: ChatUser,
  text: unknown,
  attachments: ChatAttachment[] = [],
  mentionsInput?: unknown,
  replyToId?: unknown,
  ownerSecret?: unknown,
  gif?: ChatGif | null,
): Promise<ChatMessage> {
  if (typeof text !== "string") throw new ChatError("Invalid message");
  // Keep line breaks, drop other control characters.
  const cleaned = text.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, "").trim();
  if (!cleaned && !attachments.length && !gif) throw new ChatError("Message is empty");
  if (cleaned.length > CHAT_LIMITS.textMax) {
    throw new ChatError(`Messages can be up to ${CHAT_LIMITS.textMax} characters`);
  }

  return withLock(noteId, async () => {
    const messages = await load(noteId);
    const message: ChatMessage = {
      id: randomBytes(12).toString("hex"),
      author,
      text: cleaned,
      createdAt: new Date().toISOString(),
      ...(attachments.length ? { attachments } : {}),
      ...(gif ? { gif } : {}),
    };
    const mentions = cleanMentions(mentionsInput, cleaned, author.id);
    if (mentions.length) message.mentions = mentions;
    // A reply quotes the start of the original, so it still reads well if that scrolls away.
    const original = typeof replyToId === "string" ? messages.find((m) => m.id === replyToId) : undefined;
    if (original) message.replyTo = replyRef(original);
    const ownerKey = keyFor(ownerSecret);
    if (ownerKey) (message as StoredMessage).ownerKey = ownerKey;
    const next = [...messages, message].slice(-CHAT_LIMITS.historyMax);
    histories.set(noteId, Promise.resolve(next));
    await save(noteId, next);
    return publicMessage(message);
  });
}

function replyRef(original: ChatMessage): ChatReplyRef {
  if (original.deleted) return { id: original.id, author: original.author, text: "", deleted: true };
  const text = original.text.replace(/\s+/g, " ").trim();
  return {
    id: original.id,
    author: original.author,
    text: text.length > CHAT_LIMITS.replySnippetMax ? `${text.slice(0, CHAT_LIMITS.replySnippetMax - 1)}…` : text,
    ...(original.attachments?.length ? { files: original.attachments.length } : {}),
    ...(original.gif ? { gif: true } : {}),
  };
}

/**
 * Adds your reaction, or removes it if you'd already reacted with that emoji.
 * Returns the updated message.
 */
export async function toggleReaction(noteId: string, messageId: unknown, emoji: unknown, user: ChatUser) {
  if (typeof messageId !== "string" || !/^[a-f0-9]{24}$/.test(messageId)) throw new ChatError("Invalid message");
  if (!isReactionEmoji(emoji)) throw new ChatError("Invalid reaction");
  return withLock(noteId, async () => {
    const messages = await load(noteId);
    const index = messages.findIndex((m) => m.id === messageId);
    if (index < 0) throw new ChatError("That message is no longer available");
    const message = messages[index];
    if (message.deleted) throw new ChatError("That message was deleted");
    const reactions = (message.reactions ?? []).map((r) => ({ ...r, users: [...r.users] }));
    const existing = reactions.find((r) => r.emoji === emoji);
    if (existing) {
      const mine = existing.users.findIndex((u) => u.id === user.id);
      if (mine >= 0) existing.users.splice(mine, 1);
      else if (existing.users.length < CHAT_LIMITS.reactionUsersMax) existing.users.push(user);
    } else {
      if (reactions.length >= CHAT_LIMITS.reactionsMax) throw new ChatError("Too many different reactions");
      reactions.push({ emoji, users: [user] });
    }
    const kept = reactions.filter((r) => r.users.length);
    const updated: ChatMessage = { ...message };
    if (kept.length) updated.reactions = kept;
    else delete updated.reactions;
    const next = [...messages];
    next[index] = updated;
    histories.set(noteId, Promise.resolve(next));
    await save(noteId, next);
    return publicMessage(updated);
  });
}

/* ---- editing and deleting your own messages ---- */

/** Stored with each message: a hash of its author's private secret. Never sent to clients. */
type StoredMessage = ChatMessage & { ownerKey?: string };

function keyFor(secret: unknown): string | null {
  if (typeof secret !== "string" || secret.length < 32 || secret.length > 128) return null;
  return createHash("sha256").update(secret).digest("hex");
}

/** What clients see: everything except the owner key, plus whether it can still be changed. */
function publicMessage(message: ChatMessage): ChatMessage {
  const { ownerKey, ...rest } = message as StoredMessage;
  return ownerKey && !message.deleted ? { ...rest, ownable: true } : rest;
}

function isOwner(message: ChatMessage, secret: unknown) {
  const stored = (message as StoredMessage).ownerKey;
  const given = keyFor(secret);
  if (!stored || !given) return false;
  return timingSafeEqual(Buffer.from(stored, "hex"), Buffer.from(given, "hex"));
}

/** Finds your message and checks it's yours and still changeable within `windowMs`. */
function ownMessage(messages: ChatMessage[], messageId: unknown, secret: unknown, windowMs: number, what: string) {
  if (typeof messageId !== "string" || !/^[a-f0-9]{24}$/.test(messageId)) throw new ChatError("Invalid message");
  const index = messages.findIndex((m) => m.id === messageId);
  if (index < 0) throw new ChatError("That message is no longer available");
  const message = messages[index];
  if (message.deleted) throw new ChatError("That message was deleted");
  if (!isOwner(message, secret)) throw new ChatError("You can only change your own messages");
  if (Date.now() - Date.parse(message.createdAt) > windowMs) throw new ChatError(`It’s too late to ${what} this message`);
  return index;
}

/** Updates quotes of a message in the replies to it. Returns the replies that changed. */
function refreshReplies(messages: ChatMessage[], original: ChatMessage) {
  const changed: ChatMessage[] = [];
  messages.forEach((m, i) => {
    if (m.replyTo?.id !== original.id) return;
    messages[i] = { ...m, replyTo: replyRef(original) };
    changed.push(messages[i]);
  });
  return changed;
}

/** Edits the text of your message (within 15 minutes). Returns every message that changed. */
export async function editMessage(
  noteId: string,
  messageId: unknown,
  secret: unknown,
  text: unknown,
  mentionsInput?: unknown,
): Promise<ChatMessage[]> {
  if (typeof text !== "string") throw new ChatError("Invalid message");
  const cleaned = text.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, "").trim();
  if (cleaned.length > CHAT_LIMITS.textMax) throw new ChatError(`Messages can be up to ${CHAT_LIMITS.textMax} characters`);
  return withLock(noteId, async () => {
    const messages = [...(await load(noteId))];
    const index = ownMessage(messages, messageId, secret, CHAT_LIMITS.editWindowMs, "edit");
    const message = messages[index];
    if (!cleaned && !message.attachments?.length && !message.gif) throw new ChatError("A message can’t be empty — delete it instead");
    if (cleaned === message.text) return [publicMessage(message)];
    const updated: ChatMessage = { ...message, text: cleaned, editedAt: new Date().toISOString() };
    const mentions = cleanMentions(mentionsInput, cleaned, message.author.id);
    if (mentions.length) updated.mentions = mentions;
    else delete updated.mentions;
    messages[index] = updated;
    const replies = refreshReplies(messages, updated);
    histories.set(noteId, Promise.resolve(messages));
    await save(noteId, messages);
    return [updated, ...replies].map(publicMessage);
  });
}

/** Deletes your message for everyone (within 2 days). Returns every message that changed. */
export async function deleteForEveryone(noteId: string, messageId: unknown, secret: unknown): Promise<ChatMessage[]> {
  return withLock(noteId, async () => {
    const messages = [...(await load(noteId))];
    const index = ownMessage(messages, messageId, secret, CHAT_LIMITS.deleteWindowMs, "delete");
    const { id, author, createdAt } = messages[index];
    // Keep only who and when; the content is gone (files stay in the note's Files).
    const tombstone: ChatMessage = { id, author, createdAt, text: "", deleted: true };
    messages[index] = tombstone;
    const replies = refreshReplies(messages, tombstone);
    histories.set(noteId, Promise.resolve(messages));
    await save(noteId, messages);
    return [tombstone, ...replies].map(publicMessage);
  });
}
