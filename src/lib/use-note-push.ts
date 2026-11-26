"use client";

import { useEffect } from "react";
import { getSocket } from "@/lib/socket";
import { getPushSubscription, pageIsAway, setPushActive, useNotifyState } from "@/lib/notifications";

/**
 * Real push notifications for one note: while notifications are on, this browser is
 * subscribed with the server, which sends a push when someone else chats or shares a
 * file and you aren't looking — even with the phone locked or the tab closed.
 * Also tells the server whether you're looking at the note right now.
 */
export function useNotePush({
  noteId,
  enabled,
  connected,
  userId,
}: {
  noteId: string;
  enabled: boolean;
  connected: boolean;
  userId: string | undefined;
}) {
  const state = useNotifyState();

  // "Looking" = this page is visible and focused. Others' activity then shows live, no push.
  useEffect(() => {
    if (!enabled || !connected) return;
    const socket = getSocket();
    let last: boolean | null = null;
    function report() {
      const looking = !pageIsAway();
      if (looking === last) return;
      last = looking;
      socket.emit("note:looking", { noteId, looking });
    }
    report();
    window.addEventListener("focus", report);
    window.addEventListener("blur", report);
    document.addEventListener("visibilitychange", report);
    window.addEventListener("pagehide", report);
    return () => {
      window.removeEventListener("focus", report);
      window.removeEventListener("blur", report);
      document.removeEventListener("visibilitychange", report);
      window.removeEventListener("pagehide", report);
    };
  }, [noteId, enabled, connected]);

  // Subscribe while notifications are on; unsubscribe this note when they're turned off.
  useEffect(() => {
    if (!enabled || !connected || !userId) return;
    const socket = getSocket();
    let cancelled = false;

    // Turning notifications off drops the browser's push subscription (see disableNotifications),
    // which removes it from every note on the server's next send.
    if (state !== "on") {
      setPushActive(noteId, false);
      return;
    }

    void (async () => {
      const key = await new Promise<string | null>((resolve) =>
        socket.timeout(10000).emit("push:key", {}, (error: unknown, result: { ok: boolean; key?: string }) =>
          resolve(!error && result?.ok && result.key ? result.key : null),
        ),
      );
      if (cancelled || !key) return;
      const subscription = await getPushSubscription(key);
      if (cancelled || !subscription) return;
      socket
        .timeout(10000)
        .emit(
          "note:push-subscribe",
          { noteId, userId, subscription: subscription.toJSON() },
          (error: unknown, result: { ok: boolean }) => {
            if (!cancelled) setPushActive(noteId, !error && Boolean(result?.ok));
          },
        );
    })();

    return () => {
      cancelled = true;
    };
  }, [noteId, enabled, connected, userId, state]);
}
