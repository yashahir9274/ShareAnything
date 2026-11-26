"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatMessage, ChatUser, PresenceList, TypingEvent } from "@/lib/chat";
import type { Identity } from "@/lib/identity";
import { getSocket } from "@/lib/socket";

const TYPING_SHOW_MS = 4000;
const TYPING_SEND_EVERY_MS = 2000;

type Ack = { ok: true } | { ok: false; error: string };

/**
 * Chat messages, who's online and who's typing for one note.
 * `onMessage` fires for every new message from someone else (for notifications/unread).
 */
export function useNoteChat(options: {
  noteId: string;
  enabled: boolean;
  connected: boolean;
  identity: Identity | null;
  onMessage?: (message: ChatMessage) => void;
}) {
  const { noteId, enabled, connected, identity, onMessage } = options;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [online, setOnline] = useState<ChatUser[]>([]);
  const [typing, setTyping] = useState<Array<{ user: ChatUser; until: number }>>([]);

  const identityRef = useRef(identity);
  const onMessageRef = useRef(onMessage);
  const lastTypingSent = useRef(0);
  useEffect(() => {
    identityRef.current = identity;
    onMessageRef.current = onMessage;
  }, [identity, onMessage]);

  // Announce ourselves (again whenever our name/colour changes).
  const announce = useCallback(() => {
    const me = identityRef.current;
    if (!me) return;
    getSocket().emit("note:presence", { noteId, user: { id: me.id, name: me.name, color: me.color } });
  }, [noteId]);

  useEffect(() => {
    if (enabled && connected) announce();
  }, [enabled, connected, announce, identity?.name, identity?.color]);

  useEffect(() => {
    if (!enabled || !connected) return;
    const socket = getSocket();
    let cancelled = false;

    socket.emit(
      "note:chat-history",
      { noteId },
      (result: { ok: true; messages: ChatMessage[] } | { ok: false }) => {
        if (cancelled || !result.ok) return;
        setMessages(result.messages);
        setLoaded(true);
      },
    );

    function onChatMessage(payload: { noteId: string; message: ChatMessage }) {
      if (payload.noteId !== noteId) return;
      setMessages((current) =>
        current.some((m) => m.id === payload.message.id) ? current : [...current, payload.message],
      );
      // A message ends that person's "typing…".
      setTyping((current) => current.filter((t) => t.user.id !== payload.message.author.id));
      if (payload.message.author.id !== identityRef.current?.id) onMessageRef.current?.(payload.message);
    }

    function onPresence(payload: PresenceList) {
      if (payload.noteId === noteId) setOnline(payload.users);
    }

    function onTyping(payload: TypingEvent) {
      if (payload.noteId !== noteId || payload.user.id === identityRef.current?.id) return;
      const until = Date.now() + TYPING_SHOW_MS;
      setTyping((current) => [...current.filter((t) => t.user.id !== payload.user.id), { user: payload.user, until }]);
    }

    socket.on("note:chat-message", onChatMessage);
    socket.on("note:presence", onPresence);
    socket.on("note:typing", onTyping);
    return () => {
      cancelled = true;
      socket.off("note:chat-message", onChatMessage);
      socket.off("note:presence", onPresence);
      socket.off("note:typing", onTyping);
    };
  }, [noteId, enabled, connected]);

  // Expire "is typing" entries.
  useEffect(() => {
    if (!typing.length) return;
    const next = Math.min(...typing.map((t) => t.until)) - Date.now();
    const timer = window.setTimeout(() => {
      setTyping((current) => current.filter((t) => t.until > Date.now()));
    }, Math.max(50, next));
    return () => window.clearTimeout(timer);
  }, [typing]);

  const send = useCallback(
    (text: string, attachmentIds: string[] = []) =>
      new Promise<string | null>((resolve) => {
        const me = identityRef.current;
        if (!me) return resolve("Not ready yet");
        getSocket().emit(
          "note:chat-send",
          {
            noteId,
            user: { id: me.id, name: me.name, color: me.color },
            text,
            ...(attachmentIds.length ? { attachments: attachmentIds } : {}),
          },
          (result: Ack & { message?: ChatMessage }) => {
            if (!result.ok) return resolve(result.error);
            const message = result.message;
            if (message) {
              setMessages((current) => (current.some((m) => m.id === message.id) ? current : [...current, message]));
            }
            lastTypingSent.current = 0;
            resolve(null);
          },
        );
      }),
    [noteId],
  );

  /** Call on each keystroke; tells others at most every 2 seconds. */
  const notifyTyping = useCallback(() => {
    const me = identityRef.current;
    const now = Date.now();
    if (!me || now - lastTypingSent.current < TYPING_SEND_EVERY_MS) return;
    lastTypingSent.current = now;
    getSocket().emit("note:typing", { noteId, user: { id: me.id, name: me.name, color: me.color } });
  }, [noteId]);

  return { messages, loaded, online, typing: typing.map((t) => t.user), send, notifyTyping };
}
