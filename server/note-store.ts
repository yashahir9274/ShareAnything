import { createHash, createHmac, randomBytes, scrypt, timingSafeEqual } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { promisify } from "util";
import { generateJSON } from "@tiptap/html/server";
import { prosemirrorJSONToYXmlFragment } from "@tiptap/y-tiptap";
import * as Y from "yjs";
import {
  BODY_FIELD,
  META_FIELD,
  TITLE_FIELD,
  createEditorExtensions,
} from "../src/lib/editor-extensions";
import { createNoteId } from "../src/lib/id";
import { NOTE_LIMITS, isValidNoteId, type NoteSnapshot } from "../src/lib/note-types";
import { editorSchema, validateNoteDoc } from "./doc-validator";
import { sanitizeNoteHtml } from "./sanitize";

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

const DATA_DIR = path.join(process.cwd(), ".data");
const NOTES_DIR = path.join(DATA_DIR, "notes");
const SECRET_FILE = path.join(DATA_DIR, "secret.key");
const SAVE_DELAY_MS = 1000;
const IDLE_EVICT_MS = 30 * 60 * 1000;

type PasswordRecord =
  | { kind: "scrypt"; salt: string; hash: string }
  /** Unsalted SHA-256 hex from the old client-side lock; upgraded on first unlock. */
  | { kind: "legacy-sha256"; hash: string };

/** On-disk format (version 2: body, title and settings live in one Yjs document). */
type StoredNoteV2 = {
  version: 2;
  id: string;
  password: PasswordRecord | null;
  relockMinutes?: number | null;
  createdAt: string;
  updatedAt: string;
  /** Base64 of Y.encodeStateAsUpdate(doc). */
  ydoc: string;
};

/** Older formats: HTML content, title and monospace stored as plain fields. */
type StoredNoteLegacy = {
  id?: string;
  title?: string;
  content?: string;
  monospace?: boolean;
  password?: PasswordRecord | null;
  passwordHash?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

type LiveNote = {
  id: string;
  doc: Y.Doc;
  password: PasswordRecord | null;
  /** "Lock again after" time for unlocked viewers, in minutes (null = never). */
  relockMinutes: number | null;
  createdAt: string;
  updatedAt: string;
  /** False until the first change; untouched notes are never written to disk. */
  exists: boolean;
  dirty: boolean;
  saveTimer: NodeJS.Timeout | null;
  saving: Promise<void>;
  lastActive: number;
};

function notePath(id: string) {
  if (!isValidNoteId(id)) throw new Error("Invalid note id");
  return path.join(NOTES_DIR, `${id}.json`);
}

// ---- legacy conversion -----------------------------------------------------

function htmlToFragment(html: string, fragment: Y.XmlFragment) {
  const json = generateJSON(sanitizeNoteHtml(html), createEditorExtensions());
  prosemirrorJSONToYXmlFragment(editorSchema, json, fragment);
}

function plainTextToFragment(html: string, fragment: Y.XmlFragment) {
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const json = {
    type: "doc",
    content: [{ type: "paragraph", content: text ? [{ type: "text", text }] : [] }],
  };
  prosemirrorJSONToYXmlFragment(editorSchema, json, fragment);
}

function legacyToDoc(data: StoredNoteLegacy): Y.Doc {
  const html = data.content ?? "";
  // Plain text from the very first version had no tags.
  const asHtml = /<[a-z][\s\S]*>/i.test(html)
    ? html
    : `<p>${html.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br>")}</p>`;

  const build = (writeBody: (html: string, fragment: Y.XmlFragment) => void) => {
    const doc = new Y.Doc();
    if (data.title) doc.getText(TITLE_FIELD).insert(0, data.title.slice(0, NOTE_LIMITS.titleMax));
    if (data.monospace) doc.getMap(META_FIELD).set("monospace", true);
    if (html.trim()) writeBody(asHtml, doc.getXmlFragment(BODY_FIELD));
    return doc;
  };

  const doc = build(htmlToFragment);
  if (!validateNoteDoc(doc)) return doc;
  // Shouldn't happen after sanitizing, but never load something the validator rejects.
  doc.destroy();
  return build(plainTextToFragment);
}

// ---- load / save -----------------------------------------------------------

const live = new Map<string, Promise<LiveNote>>();

async function loadNote(id: string): Promise<LiveNote> {
  const now = new Date().toISOString();
  const base: LiveNote = {
    id,
    doc: new Y.Doc(),
    password: null,
    relockMinutes: null,
    createdAt: now,
    updatedAt: now,
    exists: false,
    dirty: false,
    saveTimer: null,
    saving: Promise.resolve(),
    lastActive: Date.now(),
  };

  let raw: string;
  try {
    raw = await fs.readFile(notePath(id), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return base;
    throw error;
  }

  const data = JSON.parse(raw) as StoredNoteV2 | StoredNoteLegacy;
  base.exists = true;
  base.createdAt = data.createdAt ?? now;
  base.updatedAt = data.updatedAt ?? now;

  if ("version" in data && data.version === 2) {
    Y.applyUpdate(base.doc, Buffer.from(data.ydoc, "base64"));
    base.password = data.password;
    base.relockMinutes = data.relockMinutes ?? null;
    return base;
  }

  const legacy = data as StoredNoteLegacy;
  base.doc = legacyToDoc(legacy);
  base.password =
    legacy.password ??
    (legacy.passwordHash ? { kind: "legacy-sha256", hash: legacy.passwordHash } : null);
  base.dirty = true; // rewrite in the new format
  scheduleSave(base);
  return base;
}

function getLive(id: string): Promise<LiveNote> {
  if (!isValidNoteId(id)) return Promise.reject(new Error("Invalid note id"));
  let entry = live.get(id);
  if (!entry) {
    entry = loadNote(id);
    live.set(id, entry);
    entry.catch(() => live.delete(id));
  }
  return entry.then((note) => {
    note.lastActive = Date.now();
    return note;
  });
}

function saveNow(note: LiveNote): Promise<void> {
  if (note.saveTimer) {
    clearTimeout(note.saveTimer);
    note.saveTimer = null;
  }
  // Chain writes so an older snapshot can never land after a newer one.
  note.saving = note.saving.then(async () => {
    if (!note.dirty) return;
    note.dirty = false;
    const stored: StoredNoteV2 = {
      version: 2,
      id: note.id,
      password: note.password,
      relockMinutes: note.relockMinutes,
      createdAt: note.createdAt,
      updatedAt: note.updatedAt,
      ydoc: Buffer.from(Y.encodeStateAsUpdate(note.doc)).toString("base64"),
    };
    try {
      await fs.mkdir(NOTES_DIR, { recursive: true });
      const target = notePath(note.id);
      const temp = `${target}.${randomBytes(6).toString("hex")}.tmp`;
      await fs.writeFile(temp, JSON.stringify(stored), "utf8");
      await fs.rename(temp, target);
      note.exists = true;
    } catch (error) {
      note.dirty = true;
      console.error(`Failed to save note ${note.id}`, error);
    }
  });
  return note.saving;
}

function scheduleSave(note: LiveNote) {
  note.dirty = true;
  if (note.saveTimer) return;
  note.saveTimer = setTimeout(() => void saveNow(note), SAVE_DELAY_MS);
}

/** Writes every unsaved note; call before the process exits. */
export async function flushAllNotes() {
  const notes = await Promise.allSettled(live.values());
  await Promise.all(
    notes.flatMap((result) => (result.status === "fulfilled" ? [saveNow(result.value)] : [])),
  );
}

// Drop idle, saved notes from memory.
setInterval(async () => {
  const cutoff = Date.now() - IDLE_EVICT_MS;
  for (const [id, entry] of live) {
    const note = await entry.catch(() => null);
    if (note && !note.dirty && !note.saveTimer && note.lastActive < cutoff) {
      live.delete(id);
      note.doc.destroy();
    }
  }
}, 60 * 1000).unref();

// ---- access tokens -------------------------------------------------------

let secretPromise: Promise<Buffer> | null = null;
function getSecret(): Promise<Buffer> {
  secretPromise ??= (async () => {
    const fromEnv = process.env.SHAREANYTHING_SECRET;
    if (fromEnv) return Buffer.from(fromEnv, "utf8");
    try {
      return Buffer.from(await fs.readFile(SECRET_FILE, "utf8"), "hex");
    } catch {
      const secret = randomBytes(32);
      await fs.mkdir(DATA_DIR, { recursive: true });
      await fs.writeFile(SECRET_FILE, secret.toString("hex"), { mode: 0o600 });
      return secret;
    }
  })();
  return secretPromise;
}

/**
 * Access token: "<issued-at>.<signature>". The signature covers the note, its current
 * password and the issue time, so changing the password revokes every token, and the
 * issue time can't be edited to dodge "lock again after".
 */
async function tokenFor(note: LiveNote, issuedAt = Date.now()): Promise<string> {
  if (!note.password) return "";
  const signature = createHmac("sha256", await getSecret())
    .update(`${note.id}\n${note.password.hash}\n${issuedAt}`)
    .digest("base64url");
  return `${issuedAt.toString(36)}.${signature}`;
}

function expiresAt(note: LiveNote, issuedAt: number): number | null {
  return note.relockMinutes ? issuedAt + note.relockMinutes * 60_000 : null;
}

/** Checks a token; returns when it was issued, or null if it's invalid or has expired. */
async function verifyToken(note: LiveNote, token: unknown): Promise<number | null> {
  if (!note.password || typeof token !== "string") return null;
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const issuedAt = parseInt(token.slice(0, dot), 36);
  if (!Number.isFinite(issuedAt) || issuedAt > Date.now() + 60_000) return null;
  if (!safeEqual(token, await tokenFor(note, issuedAt))) return null;
  const expiry = expiresAt(note, issuedAt);
  if (expiry !== null && Date.now() >= expiry) return null;
  return issuedAt;
}

/** When access granted at `issuedAt` ends for this note (null = never), for live connections. */
export async function accessExpiry(id: string, issuedAt: number): Promise<number | null> {
  const note = await getLive(id);
  return note.password ? expiresAt(note, issuedAt) : null;
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

async function hashPassword(password: string): Promise<PasswordRecord> {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, 64);
  return { kind: "scrypt", salt: salt.toString("hex"), hash: hash.toString("hex") };
}

async function verifyPassword(record: PasswordRecord, password: string) {
  if (record.kind === "legacy-sha256") {
    const digest = createHash("sha256").update(password).digest("hex");
    return safeEqual(digest, record.hash);
  }
  const hash = await scryptAsync(password, Buffer.from(record.salt, "hex"), 64);
  return safeEqual(hash.toString("hex"), record.hash);
}

export function validatePassword(password: unknown): string | null {
  if (typeof password !== "string") return null;
  const trimmed = password.trim();
  if (trimmed.length < NOTE_LIMITS.passwordMin || trimmed.length > NOTE_LIMITS.passwordMax) {
    return null;
  }
  return trimmed;
}

// ---- public API ----------------------------------------------------------

function snapshot(note: LiveNote): NoteSnapshot {
  return {
    id: note.id,
    locked: note.password !== null,
    relockMinutes: note.password ? note.relockMinutes : null,
    state: Y.encodeStateAsUpdate(note.doc),
    stateVector: Y.encodeStateVector(note.doc),
  };
}

/** `issuedAt` is when this viewer's access started (null for notes without a password). */
export type OpenResult =
  | { status: "open"; note: NoteSnapshot; issuedAt: number | null }
  | { status: "locked" };

/** Returns the note if it is unlocked or `token` grants access. Does not create files. */
export async function openNote(id: string, token?: unknown): Promise<OpenResult> {
  const note = await getLive(id);
  if (!note.password) return { status: "open", note: snapshot(note), issuedAt: null };
  const issuedAt = await verifyToken(note, token);
  if (issuedAt !== null) return { status: "open", note: snapshot(note), issuedAt };
  return { status: "locked" };
}

// ---- new note ids --------------------------------------------------------

/** Ids handed out recently, so two people asking at once can't get the same one. */
const reservedIds = new Map<string, number>();
const RESERVATION_MS = 6 * 60 * 60 * 1000;
const MAX_RESERVATIONS = 100_000;

async function pathExists(target: string) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

/**
 * A brand-new note id that is guaranteed unused: not saved on disk (note or
 * files), not open in memory, and not handed out to anyone else recently.
 */
export async function allocateNoteId(): Promise<string> {
  const now = Date.now();
  for (const [id, at] of reservedIds) {
    if (now - at > RESERVATION_MS) reservedIds.delete(id);
  }
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const id = createNoteId();
    if (reservedIds.has(id) || live.has(id)) continue;
    // Reserve before the async checks so a concurrent call can't pick it too.
    reservedIds.set(id, now);
    // Bound memory if "/" is hammered: drop the oldest reservations (Map keeps insertion order).
    // A dropped one only matters if that exact random id comes up again before anyone saves it.
    while (reservedIds.size > MAX_RESERVATIONS) {
      reservedIds.delete(reservedIds.keys().next().value as string);
    }
    const taken =
      (await pathExists(notePath(id))) ||
      (await pathExists(path.join(NOTES_DIR, `${id}.files.json`))) ||
      (await pathExists(path.join(NOTES_DIR, `${id}.chat.json`)));
    if (!taken) return id;
  }
  throw new Error("Could not allocate a note id");
}

/** True if the note is unlocked or `token` grants access (for HTTP requests). */
export async function checkNoteAccess(id: string, token?: unknown): Promise<boolean> {
  const note = await getLive(id);
  if (!note.password) return true;
  return (await verifyToken(note, token)) !== null;
}

export async function unlockNote(
  id: string,
  password: string,
): Promise<{ token: string; note: NoteSnapshot; issuedAt: number } | null> {
  const note = await getLive(id);
  const record = note.password;
  if (!record || !(await verifyPassword(record, password))) return null;
  if (note.password !== record) return null; // changed while we were hashing
  if (record.kind === "legacy-sha256") {
    note.password = await hashPassword(password);
    scheduleSave(note);
  }
  const issuedAt = Date.now();
  return { token: await tokenFor(note, issuedAt), note: snapshot(note), issuedAt };
}

export class NoteInputError extends Error {}

/**
 * Applies a Yjs update from a client after checking the result on a copy.
 * Throws NoteInputError when the update is rejected; the client should then resync.
 */
export async function applyNoteUpdate(id: string, update: Uint8Array): Promise<void> {
  const note = await getLive(id);
  if (update.byteLength > NOTE_LIMITS.docMaxBytes) throw new NoteInputError("Change is too large");

  const trial = new Y.Doc();
  try {
    Y.applyUpdate(trial, Y.encodeStateAsUpdate(note.doc));
    Y.applyUpdate(trial, update);
    const error = validateNoteDoc(trial);
    if (error) throw new NoteInputError(error);
    if (Y.encodeStateAsUpdate(trial).byteLength > NOTE_LIMITS.docMaxBytes) {
      throw new NoteInputError("Note is too large");
    }
  } catch (error) {
    if (error instanceof NoteInputError) throw error;
    throw new NoteInputError("Malformed change");
  } finally {
    trial.destroy();
  }

  Y.applyUpdate(note.doc, update, "client");
  note.updatedAt = new Date().toISOString();
  scheduleSave(note);
}

/**
 * Sets, keeps or removes the password and the "lock again after" time.
 * password: string = new password, null = remove, undefined = keep the current one.
 */
export async function setNotePassword(
  id: string,
  password: string | null | undefined,
  relockMinutes: number | null,
): Promise<{ token: string; issuedAt: number; passwordChanged: boolean }> {
  const note = await getLive(id);
  if (password === undefined && !note.password) throw new NoteInputError("Set a password first");
  const passwordChanged = password !== undefined;
  if (password !== undefined) note.password = password === null ? null : await hashPassword(password);
  note.relockMinutes = note.password ? relockMinutes : null;
  note.updatedAt = new Date().toISOString();
  note.dirty = true;
  await saveNow(note);
  const issuedAt = Date.now();
  return { token: await tokenFor(note, issuedAt), issuedAt, passwordChanged };
}
