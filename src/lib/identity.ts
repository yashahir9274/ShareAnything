"use client";

import { useSyncExternalStore } from "react";
import { USER_COLORS, cleanName, type ChatUser } from "@/lib/chat";

/**
 * Who you are on this device: a random id, a display name and a colour, kept in
 * localStorage. It isn't an account — anyone can pick any name — but it lets
 * people in a note tell each other apart and remembers your name next time.
 */

export type Identity = ChatUser & {
  /** False until the person picks a name (until then they're "Guest 1234"). */
  named: boolean;
  /**
   * Private to this browser, never shown to others. Sent with your messages so only
   * you can edit or delete them later (the server keeps just a hash of it).
   */
  secret?: string;
};

const KEY = "shareanything:identity";
const CHANGE_EVENT = "shareanything:identity-change";

function randomId() {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function create(): Identity {
  const bytes = new Uint8Array(2);
  crypto.getRandomValues(bytes);
  return {
    id: randomId(),
    name: `Guest ${1000 + ((bytes[0] * 256 + bytes[1]) % 9000)}`,
    color: USER_COLORS[bytes[0] % USER_COLORS.length],
    named: false,
    secret: randomId() + randomId(),
  };
}

let cachedRaw: string | null = null;
let cached: Identity | null = null;

export function getIdentity(): Identity {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    // storage blocked: fall back to an identity that lasts for this page only
  }
  if (raw && raw === cachedRaw && cached) return cached;
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Identity;
      if (parsed?.id && parsed.name && parsed.color) {
        // Identities from before message editing existed get their secret now.
        if (typeof parsed.secret !== "string" || parsed.secret.length < 32) {
          const upgraded = { ...parsed, secret: randomId() + randomId() };
          save(upgraded, false);
          return upgraded;
        }
        cachedRaw = raw;
        cached = parsed;
        return parsed;
      }
    } catch {
      // corrupt: replace below
    }
  }
  const fresh = cached ?? create();
  // Silent: this can run while React is rendering, where announcing a change isn't allowed.
  save(fresh, false);
  return fresh;
}

function save(identity: Identity, announce = true) {
  const raw = JSON.stringify(identity);
  cachedRaw = raw;
  cached = identity;
  try {
    localStorage.setItem(KEY, raw);
  } catch {
    // ignore
  }
  if (announce) window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** Sets your display name. Returns false if the name is empty after cleaning. */
export function setIdentityName(name: string): boolean {
  const cleaned = cleanName(name);
  if (!cleaned) return false;
  save({ ...getIdentity(), name: cleaned, named: true });
  return true;
}

function subscribe(onChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === KEY) onChange();
  };
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

/** Your identity, updating when you rename (also from another tab). Null during server render. */
export function useIdentity(): Identity | null {
  return useSyncExternalStore(subscribe, getIdentity, () => null);
}
