"use client";

import { useSyncExternalStore } from "react";

/**
 * "Safe view": when on (the default), GIFs, photos and videos in chat arrive blurred
 * until you click them. Saved on this device. Each change bumps `version`, so any
 * picture you showed/hid by hand goes back to the new setting.
 */

const KEY = "shareanything:safe-view";
const EVENT = "shareanything:safe-view-change";

type SafeView = { on: boolean; version: number };

let version = 0;
let snapshot: SafeView = { on: true, version };

function read(): SafeView {
  let on = true;
  try {
    on = localStorage.getItem(KEY) !== "off";
  } catch {
    // storage blocked: stay safe
  }
  if (on !== snapshot.on || version !== snapshot.version) snapshot = { on, version };
  return snapshot;
}

export function setSafeView(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    // ignore
  }
  version += 1;
  window.dispatchEvent(new Event(EVENT));
}

const SERVER: SafeView = { on: true, version: 0 };

export function useSafeView(): SafeView {
  return useSyncExternalStore(
    (onChange) => {
      const onStorage = (event: StorageEvent) => {
        if (event.key === KEY) {
          version += 1;
          onChange();
        }
      };
      window.addEventListener(EVENT, onChange);
      window.addEventListener("storage", onStorage);
      return () => {
        window.removeEventListener(EVENT, onChange);
        window.removeEventListener("storage", onStorage);
      };
    },
    read,
    () => SERVER,
  );
}
