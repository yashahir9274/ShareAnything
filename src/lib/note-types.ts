/** Limits shared by client and server. */
export const NOTE_LIMITS = {
  idPattern: /^[A-Za-z0-9_-]{1,64}$/,
  titleMax: 200,
  /** Max size of a note's encoded Yjs state (media is uploaded separately, so this is text). */
  docMaxBytes: 4 * 1024 * 1024,
  passwordMin: 1,
  passwordMax: 200,
  /** Longest "lock again after" time: 30 days, in minutes. */
  relockMaxMinutes: 30 * 24 * 60,
} as const;

/** Whole minutes between 1 and 30 days, or null for "never". */
export function cleanRelockMinutes(value: unknown): number | null | undefined {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  const minutes = Math.round(value);
  return minutes >= 1 && minutes <= NOTE_LIMITS.relockMaxMinutes ? minutes : undefined;
}

export function isValidNoteId(id: unknown): id is string {
  return typeof id === "string" && NOTE_LIMITS.idPattern.test(id);
}

/** Sent when a client gets access to a note. `state` is a full Yjs update. */
export type NoteSnapshot = {
  id: string;
  locked: boolean;
  /** Unlocked viewers must re-enter the password this many minutes after unlocking (null = never). */
  relockMinutes: number | null;
  state: Uint8Array;
  /** Server's Yjs state vector, so the client can send back only what the server lacks. */
  stateVector: Uint8Array;
};

export type YUpdateRequest = {
  noteId: string;
  update: Uint8Array;
};

export type YUpdatePayload = {
  noteId: string;
  update: Uint8Array;
};

export type AckResult<T = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string; resync?: boolean };

export type JoinResult =
  | { ok: true; status: "open"; note: NoteSnapshot }
  | { ok: true; status: "locked" }
  | { ok: false; error: string };

export type UnlockResult = AckResult<{ token: string; note: NoteSnapshot }>;

export type LockStateEvent = { noteId: string; locked: boolean; relockMinutes: number | null };
export type LockedEvent = { noteId: string; reason?: "password-set" | "expired" };
export type SetPasswordResult = AckResult<{ token: string }>;
export type UpdateResult = AckResult;
