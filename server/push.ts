import { promises as fs } from "fs";
import path from "path";
import webpush, { type PushSubscription } from "web-push";
import { isValidNoteId } from "../src/lib/note-types";
import type { PushPayload } from "../src/lib/push-types";

/**
 * Web Push: notifies people about new chat messages and files even when the note
 * isn't open (phone locked, tab closed). Payloads never contain message text.
 *
 * Keys: VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY, or generated once into .data/vapid.json
 * (keep that file — changing keys silently breaks every existing subscription).
 */

const DATA_DIR = path.join(process.cwd(), ".data");
const NOTES_DIR = path.join(DATA_DIR, "notes");
const KEYS_FILE = path.join(DATA_DIR, "vapid.json");
const MAX_SUBSCRIPTIONS_PER_NOTE = 200;
const MAX_ENDPOINT_LENGTH = 1024;

type StoredSubscription = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  userId: string;
  createdAt: number;
};

let ready: Promise<string> | null = null;

/** Sets up VAPID once and returns the public key browsers subscribe with. */
export function pushPublicKey(): Promise<string> {
  ready ??= (async () => {
    let keys = { publicKey: process.env.VAPID_PUBLIC_KEY ?? "", privateKey: process.env.VAPID_PRIVATE_KEY ?? "" };
    if (!keys.publicKey || !keys.privateKey) {
      try {
        keys = JSON.parse(await fs.readFile(KEYS_FILE, "utf8"));
      } catch {
        keys = webpush.generateVAPIDKeys();
        await fs.mkdir(DATA_DIR, { recursive: true });
        await fs.writeFile(KEYS_FILE, JSON.stringify(keys), { mode: 0o600 });
      }
    }
    // The "subject" tells push services who to contact; the site URL is enough.
    const subject = process.env.PUBLIC_URL?.startsWith("https://")
      ? process.env.PUBLIC_URL
      : "https://shareanything.yashkumarram.com";
    webpush.setVapidDetails(subject, keys.publicKey, keys.privateKey);
    return keys.publicKey;
  })();
  return ready;
}

function pushPath(noteId: string) {
  if (!isValidNoteId(noteId)) throw new Error("Invalid note id");
  return path.join(NOTES_DIR, `${noteId}.push.json`);
}

// One write at a time per note.
const locks = new Map<string, Promise<unknown>>();
function withLock<T>(noteId: string, task: () => Promise<T>): Promise<T> {
  const previous = locks.get(noteId) ?? Promise.resolve();
  const next = previous.then(task, task);
  locks.set(
    noteId,
    next.catch(() => {}),
  );
  return next;
}

async function load(noteId: string): Promise<StoredSubscription[]> {
  try {
    const list = JSON.parse(await fs.readFile(pushPath(noteId), "utf8"));
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

async function save(noteId: string, list: StoredSubscription[]) {
  const file = pushPath(noteId);
  if (!list.length) {
    await fs.rm(file, { force: true });
    return;
  }
  await fs.mkdir(NOTES_DIR, { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(temp, JSON.stringify(list));
  await fs.rename(temp, file);
}

/** Checks a subscription sent by a browser. Only real https push endpoints are accepted. */
export function cleanSubscription(input: unknown): Omit<StoredSubscription, "userId" | "createdAt"> | null {
  if (!input || typeof input !== "object") return null;
  const { endpoint, keys } = input as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  if (typeof endpoint !== "string" || endpoint.length > MAX_ENDPOINT_LENGTH) return null;
  try {
    const url = new URL(endpoint);
    if (url.protocol !== "https:") return null;
  } catch {
    return null;
  }
  const p256dh = keys?.p256dh;
  const auth = keys?.auth;
  const base64url = /^[A-Za-z0-9_-]{8,200}={0,2}$/;
  if (typeof p256dh !== "string" || typeof auth !== "string" || !base64url.test(p256dh) || !base64url.test(auth)) {
    return null;
  }
  return { endpoint, keys: { p256dh, auth } };
}

export function addSubscription(noteId: string, userId: string, subscription: NonNullable<ReturnType<typeof cleanSubscription>>) {
  return withLock(noteId, async () => {
    const list = (await load(noteId)).filter((entry) => entry.endpoint !== subscription.endpoint);
    list.push({ ...subscription, userId, createdAt: Date.now() });
    // Oldest go first when a note has too many.
    await save(noteId, list.slice(-MAX_SUBSCRIPTIONS_PER_NOTE));
  });
}

export function removeSubscription(noteId: string, endpoint: string) {
  return withLock(noteId, async () => {
    const list = await load(noteId);
    const kept = list.filter((entry) => entry.endpoint !== endpoint);
    if (kept.length !== list.length) await save(noteId, kept);
  });
}

/** After a new password, people have to opt in again once they've unlocked (except whoever set it). */
export function clearSubscriptions(noteId: string, keepUserId?: string) {
  return withLock(noteId, async () => {
    const list = await load(noteId);
    const kept = keepUserId ? list.filter((entry) => entry.userId === keepUserId) : [];
    if (kept.length !== list.length) await save(noteId, kept);
  });
}

/**
 * Sends a notification to everyone subscribed to the note except `skipUserIds`
 * (the sender, and people who are looking at the note right now). With `onlyUserIds`,
 * only those people (e.g. the ones @mentioned).
 */
export async function sendPush(noteId: string, skipUserIds: Set<string>, payload: PushPayload, onlyUserIds?: Set<string>) {
  const list = await load(noteId);
  const targets = list.filter(
    (entry) => !skipUserIds.has(entry.userId) && (!onlyUserIds || onlyUserIds.has(entry.userId)),
  );
  if (!targets.length) return;
  await pushPublicKey();
  const body = JSON.stringify(payload);
  const gone: string[] = [];
  await Promise.all(
    targets.map(async (entry) => {
      try {
        await webpush.sendNotification(entry as PushSubscription, body, { TTL: 60 * 60 * 12, urgency: "high", topic: payload.topic });
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        // 404/410: the browser dropped this subscription.
        if (status === 404 || status === 410) gone.push(entry.endpoint);
        else console.warn("push failed", status ?? (error as Error).message);
      }
    }),
  );
  if (gone.length) {
    await withLock(noteId, async () => {
      const current = await load(noteId);
      await save(
        noteId,
        current.filter((entry) => !gone.includes(entry.endpoint)),
      );
    });
  }
}

/** How many push subscriptions a person has for a note (for the "test notification" check). */
export async function countSubscriptions(noteId: string, userId: string) {
  return (await load(noteId)).filter((entry) => entry.userId === userId).length;
}
