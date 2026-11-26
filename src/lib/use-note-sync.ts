"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import * as Y from "yjs";
import type {
  JoinResult,
  NoteSnapshot,
  SetPasswordResult,
  UnlockResult,
  UpdateResult,
  YUpdatePayload,
} from "@/lib/note-types";
import { getSocket, isSocketConnected, subscribeToConnection } from "@/lib/socket";

export type Access = "loading" | "locked" | "open";
export type SaveState = "saved" | "syncing" | "error";

/** Transaction origin for changes that came from the server, so they aren't echoed back. */
const REMOTE = Symbol("remote");
const SEND_DELAY_MS = 60;

function tokenKey(noteId: string) {
  return `shareanything:token:${noteId}`;
}

export function readToken(noteId: string) {
  try {
    return sessionStorage.getItem(tokenKey(noteId)) ?? undefined;
  } catch {
    return undefined;
  }
}

function writeToken(noteId: string, token: string | null) {
  try {
    if (token) sessionStorage.setItem(tokenKey(noteId), token);
    else sessionStorage.removeItem(tokenKey(noteId));
  } catch {
    // Storage unavailable (private mode): the note asks for the password again on reload.
  }
}

function bytes(value: Uint8Array | ArrayBuffer) {
  return value instanceof Uint8Array ? value : new Uint8Array(value);
}

/**
 * Keeps a Yjs document for one note in sync with the server. Local edits are
 * batched and sent as Yjs updates; remote updates merge in without conflicts.
 */
export function useNoteSync(noteId: string) {
  const connected = useSyncExternalStore(subscribeToConnection, isSocketConnected, () => false);

  const [doc, setDoc] = useState(() => new Y.Doc());
  const [access, setAccessState] = useState<Access>("loading");
  const [locked, setLocked] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [saveError, setSaveError] = useState("");

  const accessRef = useRef<Access>("loading");
  const queueRef = useRef<Uint8Array[]>([]);
  const inFlightRef = useRef(0);
  const timerRef = useRef<number | null>(null);

  const setAccess = useCallback((next: Access) => {
    accessRef.current = next;
    setAccessState(next);
  }, []);

  /** The server rejected our changes: throw away the local copy and load the server's. */
  const resync = useCallback(
    (reason: string) => {
      queueRef.current = [];
      setSaveState("error");
      setSaveError(`Change not saved: ${reason}`);
      setAccess("loading");
      setDoc(new Y.Doc());
    },
    [setAccess],
  );

  const flush = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (!queueRef.current.length || accessRef.current !== "open") return;
    const socket = getSocket();
    if (!socket.connected) return; // resent from the state vector diff on rejoin

    const update = Y.mergeUpdates(queueRef.current);
    queueRef.current = [];
    inFlightRef.current += 1;
    socket.emit("note:yupdate", { noteId, update }, (result: UpdateResult) => {
      inFlightRef.current -= 1;
      if (result.ok) {
        if (!queueRef.current.length && !inFlightRef.current) setSaveState("saved");
        setSaveError("");
        return;
      }
      if (result.resync) {
        resync(result.error);
        return;
      }
      queueRef.current.unshift(update);
      setSaveState("error");
      setSaveError(result.error);
    });
  }, [noteId, resync]);

  // Queue local edits.
  useEffect(() => {
    function handleUpdate(update: Uint8Array, origin: unknown) {
      if (origin === REMOTE) return;
      queueRef.current.push(update);
      setSaveState("syncing");
      if (timerRef.current === null) timerRef.current = window.setTimeout(flush, SEND_DELAY_MS);
    }
    doc.on("update", handleUpdate);
    return () => {
      doc.off("update", handleUpdate);
    };
  }, [doc, flush]);

  const applySnapshot = useCallback(
    (snapshot: NoteSnapshot) => {
      if (!snapshot?.state || !snapshot.stateVector) {
        setSaveState("error");
        setSaveError("Server sent an unexpected reply — restart the server");
        return;
      }
      try {
        Y.applyUpdate(doc, bytes(snapshot.state), REMOTE);
      } catch {
        setSaveState("error");
        setSaveError("Couldn’t read the note from the server");
        return;
      }
      // Everything we have that the server doesn't (including edits made offline).
      const missing = Y.encodeStateAsUpdate(doc, bytes(snapshot.stateVector));
      queueRef.current = missing.byteLength > 2 ? [missing] : [];
      setLocked(snapshot.locked);
      setAccess("open");
      flush();
    },
    [doc, flush, setAccess],
  );

  // Join on every (re)connect, and again after a resync replaces the doc.
  useEffect(() => {
    if (!connected) return;
    const socket = getSocket();
    let cancelled = false;

    socket.emit("note:join", { noteId, token: readToken(noteId) }, (result: JoinResult) => {
      if (cancelled) return;
      if (!result.ok) {
        setSaveState("error");
        setSaveError(result.error);
        return;
      }
      if (result.status === "locked") {
        writeToken(noteId, null);
        queueRef.current = [];
        setAccess("locked");
        return;
      }
      applySnapshot(result.note);
    });

    function handleRemote(payload: YUpdatePayload) {
      if (payload.noteId !== noteId || !payload.update) return;
      try {
        Y.applyUpdate(doc, bytes(payload.update), REMOTE);
      } catch {
        // A bad remote update would desync us; reload the server's copy instead.
        resync("received a damaged update");
      }
    }

    function handleLockState(payload: { noteId: string; locked: boolean }) {
      if (payload.noteId === noteId) setLocked(payload.locked);
    }

    function handleLocked(payload: { noteId: string }) {
      if (payload.noteId !== noteId) return;
      writeToken(noteId, null);
      queueRef.current = [];
      setAccess("locked");
    }

    socket.on("note:yupdate", handleRemote);
    socket.on("note:lock-state", handleLockState);
    socket.on("note:locked", handleLocked);

    return () => {
      cancelled = true;
      flush();
      socket.emit("note:leave", noteId);
      socket.off("note:yupdate", handleRemote);
      socket.off("note:lock-state", handleLockState);
      socket.off("note:locked", handleLocked);
    };
  }, [connected, noteId, doc, flush, applySnapshot, setAccess, resync]);

  // Send the last batch when the tab closes.
  useEffect(() => {
    window.addEventListener("pagehide", flush);
    return () => window.removeEventListener("pagehide", flush);
  }, [flush]);

  const unlock = useCallback(
    (password: string) =>
      new Promise<string | null>((resolve) => {
        getSocket().emit("note:unlock", { noteId, password }, (result: UnlockResult) => {
          if (!result.ok) return resolve(result.error);
          writeToken(noteId, result.token);
          applySnapshot(result.note);
          resolve(null);
        });
      }),
    [noteId, applySnapshot],
  );

  /** Sets (or with null, removes) the note password. Resolves to an error message or null. */
  const changePassword = useCallback(
    (password: string | null) => {
      flush();
      return new Promise<string | null>((resolve) => {
        getSocket().emit("note:set-password", { noteId, password }, (result: SetPasswordResult) => {
          if (!result.ok) return resolve(result.error);
          writeToken(noteId, result.token || null);
          setLocked(password !== null);
          resolve(null);
        });
      });
    },
    [noteId, flush],
  );

  return { doc, access, locked, connected, saveState, saveError, unlock, changePassword };
}

/** Current string value of a Y.Text, re-rendering on changes. */
export function useYText(text: Y.Text) {
  const subscribe = useCallback(
    (onChange: () => void) => {
      text.observe(onChange);
      return () => text.unobserve(onChange);
    },
    [text],
  );
  return useSyncExternalStore(subscribe, () => text.toString(), () => "");
}

/** Replaces a Y.Text's content with `next`, touching only the changed middle so concurrent edits merge. */
export function setYText(text: Y.Text, next: string) {
  const prev = text.toString();
  if (prev === next) return;
  let start = 0;
  while (start < prev.length && start < next.length && prev[start] === next[start]) start += 1;
  let end = 0;
  while (
    end < prev.length - start &&
    end < next.length - start &&
    prev[prev.length - 1 - end] === next[next.length - 1 - end]
  ) {
    end += 1;
  }
  text.doc?.transact(() => {
    const removed = prev.length - start - end;
    if (removed > 0) text.delete(start, removed);
    const inserted = next.slice(start, next.length - end);
    if (inserted) text.insert(start, inserted);
  });
}

/** A value in a Y.Map, re-rendering on changes. */
export function useYMapValue<T>(map: Y.Map<unknown>, key: string, fallback: T): T {
  const subscribe = useCallback(
    (onChange: () => void) => {
      map.observe(onChange);
      return () => map.unobserve(onChange);
    },
    [map],
  );
  return useSyncExternalStore(
    subscribe,
    () => (map.has(key) ? (map.get(key) as T) : fallback),
    () => fallback,
  );
}
