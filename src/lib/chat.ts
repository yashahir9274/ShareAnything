/** Chat and presence types shared by client and server. */

import type { FileKind } from "./files";

export const CHAT_LIMITS = {
  textMax: 2000,
  nameMax: 40,
  /** Messages kept per note (oldest are dropped). */
  historyMax: 1000,
  /** Messages sent to a client when it opens the chat. */
  historyPage: 200,
  /** Files per message. */
  attachmentsMax: 10,
  /** People @mentioned per message. */
  mentionsMax: 20,
  /** Different emoji reactions per message, and people per reaction. */
  reactionsMax: 20,
  reactionUsersMax: 200,
  /** How much of the original a reply quotes. */
  replySnippetMax: 140,
} as const;

/** Avatar colours people are assigned (contrast-checked against white text). */
export const USER_COLORS = [
  "#e8461f",
  "#0f766e",
  "#1d4ed8",
  "#7c3aed",
  "#be185d",
  "#b45309",
  "#047857",
  "#4338ca",
] as const;

/** Who someone is in a note. Chosen on their device; not an account. */
export type ChatUser = {
  id: string;
  name: string;
  color: string;
};

/** A file from the note's Files, shown inside a chat message. */
export type ChatAttachment = {
  id: string;
  name: string;
  kind: FileKind;
  size: number;
  mime: string;
};

export type ChatMessage = {
  id: string;
  author: ChatUser;
  text: string;
  createdAt: string;
  attachments?: ChatAttachment[];
  /** People @mentioned in the text (each appears as "@Name"). */
  mentions?: ChatUser[];
  /** Emoji reactions, in the order they were first added. */
  reactions?: ChatReaction[];
  /** The message this one replies to (a short quote of it). */
  replyTo?: ChatReplyRef;
};

export type ChatReaction = { emoji: string; users: ChatUser[] };

export type ChatReplyRef = {
  id: string;
  author: ChatUser;
  /** The start of the original text ("" if it only had files). */
  text: string;
  /** How many files the original had. */
  files?: number;
};

/** Quick reactions shown when hovering a message. */
export const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"] as const;

const EMOJI_PART = /\p{Extended_Pictographic}|\p{Regional_Indicator}/gu;
const EMOJI_MODIFIERS = /[\u{1F3FB}-\u{1F3FF}\u{FE0F}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/gu;

/** A single emoji (incl. skin tones, flags, ZWJ sequences); nothing else. */
export function isReactionEmoji(value: unknown): value is string {
  if (typeof value !== "string" || !value || value.length > 16) return false;
  if (!value.match(EMOJI_PART)) return false;
  // Whatever is left after removing emoji and their joiners/modifiers must be nothing.
  return value.replace(EMOJI_PART, "").replace(EMOJI_MODIFIERS, "") === "";
}

export type PresenceList = {
  noteId: string;
  users: ChatUser[];
};

export type TypingEvent = {
  noteId: string;
  user: ChatUser;
};

const USER_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

/** Trims a display name and strips control characters; null if nothing usable is left. */
export function cleanName(name: unknown): string | null {
  if (typeof name !== "string") return null;
  const cleaned = name.replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim();
  return cleaned ? cleaned.slice(0, CHAT_LIMITS.nameMax) : null;
}

/** Validates a user object coming from a client. */
export function cleanUser(input: unknown): ChatUser | null {
  if (!input || typeof input !== "object") return null;
  const { id, name, color } = input as Record<string, unknown>;
  const cleanedName = cleanName(name);
  if (typeof id !== "string" || !USER_ID_PATTERN.test(id) || !cleanedName) return null;
  const safeColor = (USER_COLORS as readonly string[]).includes(color as string) ? (color as string) : USER_COLORS[0];
  return { id, name: cleanedName, color: safeColor };
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : (parts[0] ?? "?").slice(0, 2);
  return letters.toUpperCase();
}

/**
 * Mentions sent with a message: real users whose "@Name" is in the text,
 * without duplicates or the author. Anything else is dropped.
 */
export function cleanMentions(input: unknown, text: string, authorId: string): ChatUser[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const mentions: ChatUser[] = [];
  for (const item of input.slice(0, CHAT_LIMITS.mentionsMax)) {
    const user = cleanUser(item);
    if (!user || user.id === authorId || seen.has(user.id) || !text.includes(`@${user.name}`)) continue;
    seen.add(user.id);
    mentions.push(user);
  }
  return mentions;
}
