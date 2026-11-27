"use client";

import { useEffect, useRef, useState } from "react";
import { useDialogs } from "@/components/dialogs";
import { disableNotifications, enableNotifications, sendTestNotification, useNotifyState } from "@/lib/notifications";
import { getSocket } from "@/lib/socket";

function BellIcon({ off }: { off: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden>
      <path d="M6 9a6 6 0 1 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9" />
      <path d="M10 20a2 2 0 0 0 4 0" />
      {off ? <path d="M4 4l16 16" /> : null}
    </svg>
  );
}

const TIPS = [
  "Windows: turn off Do not disturb / Focus (Settings → System → Notifications) and allow your browser there.",
  "Mac: allow your browser in System Settings → Notifications, and turn off Focus.",
  "Chrome/Edge must be running to receive them — enable “Continue running background apps when closed”.",
  "Brave: turn on “Use Google services for push messaging” in brave://settings/privacy.",
  "iPhone/iPad: Add to Home Screen, open it from there, then allow notifications.",
  "Notifications are per note — turn them on in each note you want to hear from.",
];

/**
 * The bell in Chat. Off → asks permission and turns on. On / blocked → a small panel with
 * status, a real test notification, troubleshooting tips and "turn off".
 */
export function NotificationMenu({ noteId, userId }: { noteId: string; userId?: string }) {
  const state = useNotifyState();
  const { notify } = useDialogs();
  const [open, setOpen] = useState(false);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointer(event: PointerEvent) {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (state === "unsupported") return null;

  async function turnOn() {
    if (state === "install") {
      notify(
        "On iPhone and iPad, notifications only work from the Home Screen app: tap Share (the square with an arrow) → Add to Home Screen, open ShareAnything from there, then tap this bell.",
      );
      return;
    }
    const outcome = await enableNotifications();
    if (outcome === "on") {
      notify("Notifications are on. Use the bell → “Send test notification” to check they arrive.");
    } else if (outcome === "blocked") {
      setOpen(true);
    } else if (outcome === "dismissed") {
      notify(
        "The browser didn’t show the permission request (or it was closed). Look for a bell icon in the address bar, choose Allow, then click the bell again.",
        "error",
      );
    } else if (outcome === "insecure") {
      notify("Notifications only work on a secure https:// address.", "error");
    }
  }

  async function test() {
    if (!userId) return;
    setTesting(true);
    setResult("");
    const outcome = await sendTestNotification(() =>
      getSocket()
        .timeout(8000)
        .emitWithAck("push:test", { noteId, userId }) as Promise<{ ok: boolean; devices?: number; error?: string }>,
    );
    setTesting(false);
    setResult(outcome.message);
  }

  const on = state === "on";
  const blocked = state === "blocked" || state === "insecure";
  const label = on ? "Notifications on" : blocked ? "Notifications blocked" : "Turn on notifications";

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => (on || blocked ? setOpen((value) => !value) : void turnOn())}
        title={label}
        aria-label={label}
        aria-haspopup={on || blocked ? "dialog" : undefined}
        aria-expanded={on || blocked ? open : undefined}
        className={`inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition ${
          on
            ? "bg-teal-soft text-teal"
            : blocked
              ? "bg-surface text-danger"
              : "bg-surface text-ink-muted hover:text-ink"
        }`}
      >
        <BellIcon off={!on} />
        <span className="hidden sm:inline">{on ? "On" : blocked ? "Blocked" : "Notify me"}</span>
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 top-full z-30 mt-2 w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-line bg-surface p-3 text-left shadow-[0_18px_48px_rgba(11,20,32,0.2)] animate-fade-up"
        >
          <p className="flex items-center gap-2 text-sm font-semibold text-ink">
            <span className={`h-2 w-2 rounded-full ${on ? "bg-teal" : "bg-danger"}`} />
            {on ? "Notifications are on for this device" : "Notifications are blocked"}
          </p>
          <p className="mt-1 text-xs leading-5 text-ink-muted">
            {on
              ? "You’ll hear about new messages, @mentions, replies and files in this note when you’re not looking at it — even with the tab closed."
              : state === "insecure"
                ? "Notifications only work on a secure https:// address."
                : "Click the icon left of the address bar → Notifications → Allow, then reload the page."}
          </p>

          {on ? (
            <button
              type="button"
              onClick={() => void test()}
              disabled={testing || !userId}
              className="mt-3 w-full rounded-full bg-strong px-3 py-2 text-xs font-semibold text-on-strong transition hover:opacity-90 disabled:opacity-50"
            >
              {testing ? "Sending…" : "Send test notification"}
            </button>
          ) : null}
          {result ? <p className="mt-2 text-xs leading-5 text-ink">{result}</p> : null}

          <details className="mt-3 rounded-xl border border-line bg-paper px-3 py-2">
            <summary className="cursor-pointer text-xs font-semibold text-ink">Not getting them? Check these</summary>
            <ul className="mt-2 list-disc space-y-1.5 pl-4 text-[11px] leading-4 text-ink-muted">
              {TIPS.map((tip) => (
                <li key={tip}>{tip}</li>
              ))}
            </ul>
          </details>

          {on ? (
            <button
              type="button"
              onClick={() => {
                disableNotifications();
                setOpen(false);
                notify("Notifications turned off");
              }}
              className="mt-2 w-full rounded-full px-3 py-2 text-xs font-medium text-danger transition hover:bg-danger/10"
            >
              Turn off notifications
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
