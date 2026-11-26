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
};

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
