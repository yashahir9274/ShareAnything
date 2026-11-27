"use client";

import { useSyncExternalStore } from "react";

/**
 * "Delete for me": message ids you've hidden in a note, kept on this device only
 * (localStorage), like WhatsApp. Other people still see those messages.
 */

const EVENT = "shareanything:hidden-messages";
const MAX = 2000;
const keyFor = (noteId: string) => `shareanything:hidden:${noteId}`;
const EMPTY: ReadonlySet<string> = new Set();
const cache = new Map<string, { raw: string | null; set: ReadonlySet<string> }>();

function read(noteId: string): ReadonlySet<string> {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(keyFor(noteId));
  } catch {
    return EMPTY;
  }
  const cached = cache.get(noteId);
  if (cached && cached.raw === raw) return cached.set;
  let set: ReadonlySet<string> = EMPTY;
  try {
    const list = JSON.parse(raw ?? "[]");
    if (Array.isArray(list)) set = new Set(list.filter((id) => typeof id === "string"));
  } catch {
    // corrupt: treat as empty
  }
  cache.set(noteId, { raw, set });
  return set;
}

export function hideMessageForMe(noteId: string, messageId: string) {
  const next = [...read(noteId), messageId].slice(-MAX);
  try {
    localStorage.setItem(keyFor(noteId), JSON.stringify(next));
  } catch {
    // storage full or blocked: nothing to do
  }
  window.dispatchEvent(new Event(EVENT));
}

export function useHiddenMessages(noteId: string): ReadonlySet<string> {
  return useSyncExternalStore(
    (onChange) => {
      const onStorage = (event: StorageEvent) => {
        if (event.key === keyFor(noteId)) onChange();
      };
      window.addEventListener(EVENT, onChange);
      window.addEventListener("storage", onStorage);
      return () => {
        window.removeEventListener(EVENT, onChange);
        window.removeEventListener("storage", onStorage);
      };
    },
    () => read(noteId),
    () => EMPTY,
  );
}
