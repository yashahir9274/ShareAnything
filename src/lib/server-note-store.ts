import { promises as fs } from "fs";
import path from "path";
import { createEmptyNote, type Note } from "./note-types";

const DATA_DIR = path.join(process.cwd(), ".data", "notes");

async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

function notePath(id: string) {
  const safeId = id.replace(/[^a-zA-Z0-9_-]/g, "");
  if (!safeId || safeId !== id) {
    throw new Error("Invalid note id");
  }
  return path.join(DATA_DIR, `${safeId}.json`);
}

export async function readNote(id: string): Promise<Note | null> {
  try {
    const raw = await fs.readFile(notePath(id), "utf8");
    return JSON.parse(raw) as Note;
  } catch {
    return null;
  }
}

export async function writeNote(note: Note): Promise<Note> {
  await ensureDataDir();
  const next: Note = {
    ...note,
    updatedAt: new Date().toISOString(),
  };
  await fs.writeFile(notePath(note.id), JSON.stringify(next, null, 2), "utf8");
  return next;
}

export async function getOrCreateServerNote(id: string): Promise<Note> {
  const existing = await readNote(id);
  if (existing) return existing;
  return writeNote(createEmptyNote(id));
}

export async function mergeNote(incoming: Note): Promise<Note> {
  const existing = await readNote(incoming.id);
  if (!existing) {
    return writeNote(incoming);
  }

  if (new Date(incoming.updatedAt).getTime() < new Date(existing.updatedAt).getTime()) {
    return existing;
  }

  return writeNote({
    ...existing,
    ...incoming,
    id: existing.id,
    createdAt: existing.createdAt,
  });
}
