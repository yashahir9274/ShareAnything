import { randomBytes } from "crypto";
import { EventEmitter } from "events";
import { createWriteStream, promises as fs } from "fs";
import path from "path";
import { Transform, type Readable } from "stream";
import { pipeline } from "stream/promises";
import {
  cleanFileName,
  detectFileKind,
  isValidFileId,
  type FileEvent,
  type FilesUsage,
  type NoteFile,
} from "../src/lib/files";
import { isValidNoteId } from "../src/lib/note-types";

const MB = 1024 * 1024;
export const FILE_LIMITS = {
  maxFileSize: Number(process.env.SHAREANYTHING_MAX_FILE_MB || 100) * MB,
  noteQuota: Number(process.env.SHAREANYTHING_NOTE_QUOTA_MB || 500) * MB,
  maxFilesPerNote: 300,
};

const FILES_DIR = path.join(process.cwd(), ".data", "files");
const MANIFEST_DIR = path.join(process.cwd(), ".data", "notes");

/** What the server keeps per file (noteId is never sent to public viewers). */
export type StoredFile = NoteFile & { noteId: string };

export const fileEvents = new EventEmitter();
function emit(event: FileEvent) {
  fileEvents.emit("event", event);
}

export class FileError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

const blobPath = (id: string) => path.join(FILES_DIR, `${id}.bin`);
const metaPath = (id: string) => path.join(FILES_DIR, `${id}.json`);
const manifestPath = (noteId: string) => path.join(MANIFEST_DIR, `${noteId}.files.json`);

function toPublic(file: StoredFile): NoteFile {
  return {
    id: file.id,
    name: file.name,
    mime: file.mime,
    size: file.size,
    kind: file.kind,
    createdAt: file.createdAt,
  };
}

async function writeJson(target: string, data: unknown) {
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temp = `${target}.${randomBytes(6).toString("hex")}.tmp`;
  await fs.writeFile(temp, JSON.stringify(data), "utf8");
  await fs.rename(temp, target);
}

// ---- per-note manifest, cached and updated one change at a time --------------

const manifests = new Map<string, Promise<StoredFile[]>>();
const locks = new Map<string, Promise<unknown>>();

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

function loadManifest(noteId: string): Promise<StoredFile[]> {
  if (!isValidNoteId(noteId)) return Promise.reject(new FileError("Invalid note id"));
  let entry = manifests.get(noteId);
  if (!entry) {
    entry = fs
      .readFile(manifestPath(noteId), "utf8")
      .then((raw) => JSON.parse(raw) as StoredFile[])
      .catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return [];
        throw error;
      });
    manifests.set(noteId, entry);
    entry.catch(() => manifests.delete(noteId));
  }
  return entry;
}

async function saveManifest(noteId: string, files: StoredFile[]) {
  manifests.set(noteId, Promise.resolve(files));
  if (files.length) await writeJson(manifestPath(noteId), files);
  else await fs.rm(manifestPath(noteId), { force: true });
}

function usageOf(files: StoredFile[]): FilesUsage {
  return {
    used: files.reduce((sum, file) => sum + file.size, 0),
    quota: FILE_LIMITS.noteQuota,
    count: files.length,
    maxCount: FILE_LIMITS.maxFilesPerNote,
    maxFileSize: FILE_LIMITS.maxFileSize,
  };
}

// ---- public API ----------------------------------------------------------

export async function listFiles(noteId: string) {
  const files = await loadManifest(noteId);
  return { files: files.map(toPublic).reverse(), usage: usageOf(files) };
}

/** Looks up a single file by id (for public share links). */
export async function getFile(fileId: string): Promise<StoredFile | null> {
  if (!isValidFileId(fileId)) return null;
  try {
    return JSON.parse(await fs.readFile(metaPath(fileId), "utf8")) as StoredFile;
  } catch {
    return null;
  }
}

export function fileBlobPath(fileId: string) {
  if (!isValidFileId(fileId)) throw new FileError("Invalid file id");
  return blobPath(fileId);
}

const MIME_PATTERN = /^[a-z0-9][a-z0-9!#$&^_.+-]{0,126}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,126}$/i;

/**
 * Streams an upload to disk, enforcing the per-file and per-note limits
 * while bytes arrive (a lying Content-Length can't get past them).
 */
export async function saveUpload(input: {
  noteId: string;
  name: string;
  mime: string;
  declaredSize: number;
  body: Readable;
}): Promise<NoteFile> {
  const { noteId, body } = input;
  const name = cleanFileName(input.name);
  const mime = MIME_PATTERN.test(input.mime) ? input.mime.toLowerCase() : "application/octet-stream";

  const before = usageOf(await loadManifest(noteId));
  if (before.count >= FILE_LIMITS.maxFilesPerNote) {
    throw new FileError("This note already has the maximum number of files", 413);
  }
  const room = Math.min(FILE_LIMITS.maxFileSize, before.quota - before.used);
  if (input.declaredSize > FILE_LIMITS.maxFileSize) {
    throw new FileError(`Files must be under ${FILE_LIMITS.maxFileSize / MB} MB`, 413);
  }
  if (input.declaredSize > room) throw new FileError("Not enough space left in this note", 413);

  const id = randomBytes(16).toString("hex");
  await fs.mkdir(FILES_DIR, { recursive: true });
  const temp = `${blobPath(id)}.uploading`;
  let size = 0;
  const limiter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      size += chunk.length;
      if (size > room) {
        callback(new FileError(size > FILE_LIMITS.maxFileSize
          ? `Files must be under ${FILE_LIMITS.maxFileSize / MB} MB`
          : "Not enough space left in this note", 413));
        return;
      }
      callback(null, chunk);
    },
  });

  try {
    await pipeline(body, limiter, createWriteStream(temp));
  } catch (error) {
    await fs.rm(temp, { force: true });
    throw error instanceof FileError ? error : new FileError("Upload interrupted", 400);
  }

  const record: StoredFile = {
    id,
    noteId,
    name,
    mime,
    size,
    kind: detectFileKind(name, mime),
    createdAt: new Date().toISOString(),
  };

  return withLock(noteId, async () => {
    const files = await loadManifest(noteId);
    const usage = usageOf(files);
    // Re-check: other uploads may have finished meanwhile.
    if (usage.used + size > usage.quota || files.length >= FILE_LIMITS.maxFilesPerNote) {
      await fs.rm(temp, { force: true });
      throw new FileError("Not enough space left in this note", 413);
    }
    await fs.rename(temp, blobPath(id));
    await writeJson(metaPath(id), record);
    const next = [...files, record];
    await saveManifest(noteId, next);
    emit({ noteId, type: "added", file: toPublic(record), usage: usageOf(next) });
    return toPublic(record);
  });
}

export async function deleteFile(noteId: string, fileId: string) {
  return withLock(noteId, async () => {
    const files = await loadManifest(noteId);
    if (!files.some((file) => file.id === fileId)) throw new FileError("File not found", 404);
    const next = files.filter((file) => file.id !== fileId);
    await saveManifest(noteId, next);
    await Promise.all([
      fs.rm(blobPath(fileId), { force: true }),
      fs.rm(metaPath(fileId), { force: true }),
    ]);
    emit({ noteId, type: "removed", fileId, usage: usageOf(next) });
  });
}

export async function renameFile(noteId: string, fileId: string, newName: string) {
  return withLock(noteId, async () => {
    const files = await loadManifest(noteId);
    const index = files.findIndex((file) => file.id === fileId);
    if (index < 0) throw new FileError("File not found", 404);
    const name = cleanFileName(newName);
    const updated: StoredFile = { ...files[index], name, kind: detectFileKind(name, files[index].mime) };
    const next = files.slice();
    next[index] = updated;
    await writeJson(metaPath(fileId), updated);
    await saveManifest(noteId, next);
    emit({ noteId, type: "updated", file: toPublic(updated) });
    return toPublic(updated);
  });
}
