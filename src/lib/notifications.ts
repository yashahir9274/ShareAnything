"use client";

import { useSyncExternalStore } from "react";

/**
 * Browser notifications. They never include message text — only who did what.
 * Chat messages and files arrive by Web Push (the server sends them, so they work with
 * the tab closed or the phone locked); other events are shown by the open page.
 */

/** "install" = iPhone/iPad Safari: notifications only work after Add to Home Screen. */
export type NotifyState = "unsupported" | "install" | "insecure" | "blocked" | "off" | "on";
/** Result of asking: "dismissed" = the browser didn't show the prompt or it was closed. */
export type EnableResult = NotifyState | "dismissed";

const KEY = "shareanything:notifications";
const CHANGE_EVENT = "shareanything:notify-change";
const CLICK_MESSAGE = "shareanything:notification-click";

function supported() {
  return typeof window !== "undefined" && "Notification" in window;
}

/** iPhone/iPad (iPadOS reports itself as a Mac with touch). */
function isIos() {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isInstalledApp() {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
}

export function getNotifyState(): NotifyState {
  if (typeof window === "undefined") return "unsupported";
  // iOS only allows notifications for web apps added to the Home Screen (iOS 16.4+).
  if (!supported()) return isIos() && !isInstalledApp() ? "install" : "unsupported";
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
    const data = event.data as { type?: string; tag?: string; url?: string } | null;
    if (data?.type !== CLICK_MESSAGE || !data.tag) return;
    const handler = clickHandlers.get(data.tag);
    if (handler) return handler();
    // A push notification: go to the tab in its link (#chat, #files).
    try {
      const target = new URL(data.url ?? "", window.location.href);
      if (target.pathname === window.location.pathname) window.location.hash = target.hash;
    } catch {
      // ignore
    }
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
  if (state === "unsupported" || state === "install" || state === "insecure") return state;
  const permission =
    Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
  if (permission === "default") return "dismissed";
  setWanted(permission === "granted");
  const result = getNotifyState();
  if (result === "on") {
    // A real notification straight away, so people can see it works.
    void show({
      title: "Notifications are on",
      body: "You’ll be told about new messages and files, even when this note is closed.",
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
  // Drop the push subscription: the server forgets it (for every note) on its next send.
  void getPushSubscription(null).then((subscription) => subscription?.unsubscribe());
}

// ---- Web Push ----

function keyToBytes(base64url: string) {
  const base64 = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}

function sameKey(a: ArrayBuffer | null, b: Uint8Array) {
  if (!a || a.byteLength !== b.byteLength) return false;
  const view = new Uint8Array(a);
  return view.every((byte, index) => byte === b[index]);
}

/**
 * This browser's push subscription. With a server key, creates (or renews) one;
 * with null, only returns an existing one. Null when push isn't available.
 */
export async function getPushSubscription(serverKey: string | null): Promise<PushSubscription | null> {
  if (typeof window === "undefined" || !("PushManager" in window)) return null;
  const reg = await getRegistration();
  if (!reg?.pushManager) return null;
  try {
    const existing = await reg.pushManager.getSubscription();
    if (!serverKey) return existing;
    const key = keyToBytes(serverKey);
    if (existing && sameKey(existing.options.applicationServerKey, key)) return existing;
    if (existing) await existing.unsubscribe(); // made with another server key
    return await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  } catch {
    // e.g. Brave with "Google services for push messaging" off, or a private window.
    return null;
  }
}

/** Notes whose chat/file notifications come by push (so the page doesn't show them too). */
const pushNotes = new Set<string>();

export function setPushActive(noteId: string, active: boolean) {
  if (active) pushNotes.add(noteId);
  else pushNotes.delete(noteId);
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
  // Chat and file notifications come from the server when push works; don't show them twice.
  const [kind, noteId] = options.tag.split(":");
  if ((kind === "chat" || kind === "files") && pushNotes.has(noteId)) return;
  void show(options);
}

/** Registers the service worker early when notifications are already on (so clicks route back). */
export function prepareNotifications() {
  if (getNotifyState() === "on") {
    void getRegistration();
    listenForClicks();
  }
}
