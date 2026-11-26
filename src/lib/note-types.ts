/** Limits shared by client and server. */
export const NOTE_LIMITS = {
  idPattern: /^[A-Za-z0-9_-]{1,64}$/,
  titleMax: 200,
  /** Max size of a note's encoded Yjs state (media is uploaded separately, so this is text). */
  docMaxBytes: 4 * 1024 * 1024,
  passwordMin: 1,
  passwordMax: 200,
} as const;

export function isValidNoteId(id: unknown): id is string {
  return typeof id === "string" && NOTE_LIMITS.idPattern.test(id);
}

/** Sent when a client gets access to a note. `state` is a full Yjs update. */
export type NoteSnapshot = {
  id: string;
  locked: boolean;
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
export type SetPasswordResult = AckResult<{ token: string }>;
export type UpdateResult = AckResult;
