import type { Note } from "@/lib/note-types";

export type { Note };

export async function hashPassword(password: string): Promise<string> {
  const data = new TextEncoder().encode(password);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

export async function fetchNote(id: string): Promise<Note> {
  const response = await fetch(`/api/notes/${id}`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Failed to load note");
  }
  return response.json() as Promise<Note>;
}

export async function persistNote(note: Note): Promise<Note> {
  const response = await fetch(`/api/notes/${note.id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(note),
  });
  if (!response.ok) {
    throw new Error("Failed to save note");
  }
  return response.json() as Promise<Note>;
}
