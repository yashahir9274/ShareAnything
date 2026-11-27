import { randomBytes } from "crypto";
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
  return messages.slice(-limit);
}

export async function addMessage(
  noteId: string,
  author: ChatUser,
  text: unknown,
  attachments: ChatAttachment[] = [],
  mentionsInput?: unknown,
  replyToId?: unknown,
): Promise<ChatMessage> {
  if (typeof text !== "string") throw new ChatError("Invalid message");
  // Keep line breaks, drop other control characters.
  const cleaned = text.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, "").trim();
  if (!cleaned && !attachments.length) throw new ChatError("Message is empty");
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
    };
    const mentions = cleanMentions(mentionsInput, cleaned, author.id);
    if (mentions.length) message.mentions = mentions;
    // A reply quotes the start of the original, so it still reads well if that scrolls away.
    const original = typeof replyToId === "string" ? messages.find((m) => m.id === replyToId) : undefined;
    if (original) message.replyTo = replyRef(original);
    const next = [...messages, message].slice(-CHAT_LIMITS.historyMax);
    histories.set(noteId, Promise.resolve(next));
    await save(noteId, next);
    return message;
  });
}

function replyRef(original: ChatMessage): ChatReplyRef {
  const text = original.text.replace(/\s+/g, " ").trim();
  return {
    id: original.id,
    author: original.author,
    text: text.length > CHAT_LIMITS.replySnippetMax ? `${text.slice(0, CHAT_LIMITS.replySnippetMax - 1)}…` : text,
    ...(original.attachments?.length ? { files: original.attachments.length } : {}),
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
    return updated;
  });
}
