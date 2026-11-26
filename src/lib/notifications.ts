"use client";

import { useSyncExternalStore } from "react";

/**
 * Browser notifications while a note is open in the background (another tab,
 * another app, minimised). They never include message text — only who did what.
 * Notifications when the note isn't open at all would need Web Push (a push server).
 */

export type NotifyState = "unsupported" | "insecure" | "blocked" | "off" | "on";
/** Result of asking: "dismissed" = the browser didn't show the prompt or it was closed. */
export type EnableResult = NotifyState | "dismissed";

const KEY = "shareanything:notifications";
const CHANGE_EVENT = "shareanything:notify-change";
const CLICK_MESSAGE = "shareanything:notification-click";

function supported() {
  return typeof window !== "undefined" && "Notification" in window;
}

export function getNotifyState(): NotifyState {
  if (!supported()) return "unsupported";
  // Browsers only allow notifications on https:// (and localhost).
  if (!window.isSecureContext) return "insecure";
  if (Notification.permission === "denied") return "blocked";
  let wanted = false;
  try {
    wanted = localStorage.getItem(KEY) === "on";
  } catch {
    // ignore
  }
  return wanted && Notification.permission === "granted" ? "on" : "off";
}

function setWanted(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    // ignore
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

// ---- service worker (shows notifications + routes clicks back to the page) ----

let registration: Promise<ServiceWorkerRegistration | null> | null = null;

function getRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return Promise.resolve(null);
  registration ??= navigator.serviceWorker
    .register("/sw.js", { scope: "/" })
    .then(() => navigator.serviceWorker.ready)
    .catch(() => null);
  return registration;
}

/** What to do when a notification with a given tag is clicked. */
const clickHandlers = new Map<string, () => void>();
let listening = false;

function listenForClicks() {
  if (listening || typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  listening = true;
  navigator.serviceWorker.addEventListener("message", (event: MessageEvent) => {
    const data = event.data as { type?: string; tag?: string } | null;
    if (data?.type === CLICK_MESSAGE && data.tag) clickHandlers.get(data.tag)?.();
  });
}

type ShowOptions = { title: string; body: string; tag: string; url?: string; onClick?: () => void };

/** Shows a notification now (via the service worker when possible). */
async function show(options: ShowOptions) {
  if (options.onClick) clickHandlers.set(options.tag, options.onClick);
  listenForClicks();
  const settings: NotificationOptions & { renotify?: boolean } = {
    body: options.body,
    tag: options.tag,
    // Alert again for each new event, instead of silently replacing the last one with the same tag.
    renotify: true,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    data: { url: options.url ?? window.location.href },
  };
  const reg = await getRegistration();
  if (reg) {
    try {
      await reg.showNotification(options.title, settings);
      return;
    } catch {
      // fall back below
    }
  }
  try {
    const notification = new Notification(options.title, settings);
    notification.onclick = () => {
      window.focus();
      options.onClick?.();
      notification.close();
    };
  } catch {
    // This browser only allows notifications from a service worker, and that failed.
  }
}

/** Asks for permission (must be called from a click) and turns notifications on. */
export async function enableNotifications(): Promise<EnableResult> {
  const state = getNotifyState();
  if (state === "unsupported" || state === "insecure") return state;
  const permission =
    Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
  if (permission === "default") return "dismissed";
  setWanted(permission === "granted");
  const result = getNotifyState();
  if (result === "on") {
    // A real notification straight away, so people can see it works.
    void show({
      title: "Notifications are on",
      body: "You’ll be told about new messages and files while this note is in the background.",
      tag: "shareanything:welcome",
    });
  }
  return result;
}

const ASKED_KEY = "shareanything:notifications-asked";

/**
 * Asks for permission once, the first time someone opens Chat (call it from a click,
 * which browsers require). Returns null if we've asked before or there's nothing to ask.
 * After that, the bell in Chat is how people change it.
 */
export async function askOnceForNotifications(): Promise<EnableResult | null> {
  try {
    if (localStorage.getItem(ASKED_KEY)) return null;
    localStorage.setItem(ASKED_KEY, "1");
  } catch {
    return null;
  }
  if (getNotifyState() !== "off") return null;
  return enableNotifications();
}

export function disableNotifications() {
  setWanted(false);
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("focus", onChange); // permission may change in browser settings
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("focus", onChange);
  };
}

export function useNotifyState(): NotifyState {
  return useSyncExternalStore(subscribe, getNotifyState, () => "off" as NotifyState);
}

/** True when the person can't currently see the page (other tab, other app, minimised). */
export function pageIsAway() {
  return document.hidden || !document.hasFocus();
}

/**
 * Shows a notification if they're turned on and the page isn't in front.
 * `tag` groups notifications of one kind (a new one replaces the old one but still alerts).
 */
export function notifyIfAway(options: ShowOptions) {
  if (getNotifyState() !== "on" || !pageIsAway()) return;
  void show(options);
}

/** Registers the service worker early when notifications are already on (so clicks route back). */
export function prepareNotifications() {
  if (getNotifyState() === "on") {
    void getRegistration();
    listenForClicks();
  }
}
