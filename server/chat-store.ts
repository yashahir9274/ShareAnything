import { randomBytes } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { CHAT_LIMITS, type ChatAttachment, type ChatMessage, type ChatUser } from "../src/lib/chat";
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
    const next = [...messages, message].slice(-CHAT_LIMITS.historyMax);
    histories.set(noteId, Promise.resolve(next));
    await save(noteId, next);
    return message;
  });
}
