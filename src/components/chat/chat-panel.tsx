"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { useDialogs } from "@/components/dialogs";
import { FilePreview } from "@/components/media/file-preview";
import { Modal } from "@/components/media/modal";
import { CHAT_LIMITS, type ChatMessage, type ChatUser } from "@/lib/chat";
import { fileRawUrl, formatBytes, type NoteFile } from "@/lib/files";
import { MessageAttachments, PendingAttachments, type PendingAttachment } from "./chat-attachments";
import { EmojiPicker } from "./emoji-picker";
import { MentionPicker, MessageText, findMentionQuery, matchMentions } from "./mentions";
import { MessageActions, ReactionChips, ReplyQuote, ReplyingTo, useCanHover } from "./message-extras";
import { setIdentityName, type Identity } from "@/lib/identity";
import { disableNotifications, enableNotifications, useNotifyState } from "@/lib/notifications";
import { Avatar, AvatarStack } from "./avatars";

type ChatPanelProps = {
  messages: ChatMessage[];
  loaded: boolean;
  online: ChatUser[];
  typing: ChatUser[];
  identity: Identity | null;
  onSend: (text: string, attachmentIds?: string[], mentions?: ChatUser[], replyTo?: string) => Promise<string | null>;
  /** Toggle your emoji reaction on a message. Resolves to an error message or null. */
  onReact: (messageId: string, emoji: string) => Promise<string | null>;
  onTyping: () => void;
  /** First click inside the chat (used to ask for notifications when Chat was opened by link). */
  onFirstInteraction?: () => void;
  /** The note's current files (attachments that were deleted show as removed). */
  files: NoteFile[];
  maxFileSize?: number;
  /** Uploads files into the note's Files; resolves per file to the stored file or an Error. */
  onAttach: (files: File[]) => Promise<Array<NoteFile | Error>>;
};

const GROUP_WINDOW_MS = 5 * 60 * 1000;

function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function dayLabel(iso: string) {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });
}

/** Turns plain-text URLs into links (rendered as text nodes, so no HTML injection). */
export function NotificationToggle({ compact = false }: { compact?: boolean }) {
  const state = useNotifyState();
  const { notify } = useDialogs();
  if (state === "unsupported") return null;

  async function toggle() {
    if (state === "install") {
      notify(
        "On iPhone and iPad, notifications only work from the Home Screen app: tap Share (the square with an arrow) → Add to Home Screen, open ShareAnything from there, then tap this bell.",
      );
      return;
    }
    if (state === "on") {
      disableNotifications();
      notify("Notifications turned off");
      return;
    }
    const result = await enableNotifications();
    if (result === "on") {
      notify("Notifications are on — you should see a test notification now. You’ll be told about new messages and files even when this note is closed.");
    } else if (result === "blocked") {
      notify(
        "Notifications are blocked for this site. Click the icon left of the address bar → Notifications → Allow, then click the bell again.",
        "error",
      );
    } else if (result === "dismissed") {
      notify(
        "The browser didn’t show the permission request (or it was closed). Look for a bell icon in the address bar, choose Allow, then click the bell again.",
        "error",
      );
    } else if (result === "insecure") {
      notify("Notifications only work on a secure https:// address.", "error");
    }
  }

  const label =
    state === "on"
      ? "Notifications on (click to turn off)"
      : state === "blocked"
        ? "Notifications blocked — click for how to allow them"
        : state === "insecure"
          ? "Notifications need https://"
          : state === "install"
            ? "Notifications on iPhone: add to Home Screen first"
          : "Turn on notifications";
  return (
    <button
      type="button"
      onClick={() => void toggle()}
      title={label}
      aria-label={label}
      aria-pressed={state === "on"}
      className={`inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition ${
        state === "on"
          ? "bg-teal-soft text-teal"
          : state === "blocked" || state === "insecure"
            ? "bg-surface text-ink-muted line-through"
            : "bg-surface text-ink-muted hover:text-ink"
      }`}
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden>
        <path d="M6 9a6 6 0 1 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9" />
        <path d="M10 20a2 2 0 0 0 4 0" />
        {state === "on" ? null : <path d="M4 4l16 16" />}
      </svg>
      {compact ? null : <span className="hidden sm:inline">{state === "on" ? "Notifying" : "Notify me"}</span>}
    </button>
  );
}

export function ChatPanel({
  messages,
  loaded,
  online,
  typing,
  identity,
  onSend,
  onReact,
  onTyping,
  onFirstInteraction,
  files,
  maxFileSize,
  onAttach,
}: ChatPanelProps) {
  const dialogs = useDialogs();
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const stickToBottom = useRef(true);
  const pendingCounter = useRef(0);
  const [draft, setDraft] = useState("");
  const [nameDraft, setNameDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [pending, setPending] = useState<PendingAttachment[]>([]);
  const [dragging, setDragging] = useState(false);
  const [previewFile, setPreviewFile] = useState<NoteFile | null>(null);
  const dragDepth = useRef(0);
  // @mentions: the "@query" being typed, which suggestion is highlighted, and who was picked.
  const [mention, setMention] = useState<{ start: number; query: string } | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const picked = useRef(new Map<string, ChatUser>());
  // Replies and reactions.
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  /** Message the emoji picker will react to (instead of typing into the box). */
  const [reactTarget, setReactTarget] = useState<string | null>(null);
  /** On touch screens, the message whose action bar was tapped open. */
  const [activeMessage, setActiveMessage] = useState<string | null>(null);
  const canHover = useCanHover();

  async function react(messageId: string, emoji: string) {
    setActiveMessage(null);
    const problem = await onReact(messageId, emoji);
    if (problem) setError(problem);
  }

  function startReply(message: ChatMessage) {
    setReplyTo(message);
    setActiveMessage(null);
    inputRef.current?.focus();
  }

  /** Scrolls to the original of a reply and flashes it. */
  function jumpTo(messageId: string) {
    const row = document.getElementById(`msg-${messageId}`);
    if (!row) {
      dialogs.notify("That message is too old to show here.");
      return;
    }
    row.scrollIntoView({ block: "center", behavior: "smooth" });
    row.classList.remove("chat-flash");
    void row.offsetWidth; // restart the animation
    row.classList.add("chat-flash");
  }
  const others = online.filter((user) => user.id !== identity?.id);
  const suggestions = mention ? matchMentions(others, mention.query) : [];

  function updateMention(value: string, caret: number | null) {
    const next = caret === null ? null : findMentionQuery(value, caret);
    if (!next) {
      if (mention) setMention(null);
      return;
    }
    if (mention?.start === next.start && mention.query === next.query) return;
    setMentionIndex(0);
    setMention(next);
  }

  function pickMention(user: ChatUser) {
    if (!mention) return;
    const input = inputRef.current;
    const caret = input?.selectionStart ?? draft.length;
    const inserted = `@${user.name} `;
    const next = `${draft.slice(0, mention.start)}${inserted}${draft.slice(caret)}`.slice(0, CHAT_LIMITS.textMax);
    picked.current.set(user.id, user);
    setDraft(next);
    setMention(null);
    input?.focus();
    const at = mention.start + inserted.length;
    window.setTimeout(() => input?.setSelectionRange(at, at), 0);
  }

  /** Everyone whose "@Name" is still in the text (picked from the list, or typed out in full). */
  function mentionsIn(text: string) {
    const candidates = new Map(picked.current);
    for (const user of others) candidates.set(user.id, user);
    return [...candidates.values()].filter((user) => text.includes(`@${user.name}`));
  }

  const available = useMemo(() => new Map(files.map((file) => [file.id, file])), [files]);
  const readyIds = pending.filter((item) => item.status === "ready" && item.file).map((item) => item.file!.id);
  const uploading = pending.some((item) => item.status === "uploading");

  /** Uploads picked/dropped/pasted files right away; they're sent with the next message. */
  const attach = useCallback(
    async (list: File[]) => {
      if (!list.length) return;
      const room = CHAT_LIMITS.attachmentsMax - pending.length;
      if (room <= 0) {
        setError(`Up to ${CHAT_LIMITS.attachmentsMax} files per message.`);
        return;
      }
      const chosen = list.slice(0, room);
      const items: PendingAttachment[] = chosen.map((file) => ({
        key: `p${(pendingCounter.current += 1)}`,
        name: file.name || "pasted-file",
        status: "uploading",
      }));
      setPending((current) => [...current, ...items]);
      setError(list.length > room ? `Only the first ${room} files were added (${CHAT_LIMITS.attachmentsMax} per message).` : "");
      const results = await onAttach(chosen);
      setPending((current) =>
        current.map((item) => {
          const index = items.findIndex((i) => i.key === item.key);
          if (index < 0) return item;
          const result = results[index];
          return result instanceof Error || !result
            ? { ...item, status: "error", error: result?.message ?? "Upload failed" }
            : { ...item, status: "ready", file: result };
        }),
      );
      inputRef.current?.focus();
    },
    [onAttach, pending.length],
  );

  function pickEmoji(emoji: string) {
    if (reactTarget) {
      const target = reactTarget;
      setReactTarget(null);
      setEmojiOpen(false);
      void react(target, emoji);
      return;
    }
    insertEmoji(emoji);
  }

  function insertEmoji(emoji: string) {
    const input = inputRef.current;
    const start = input?.selectionStart ?? draft.length;
    const end = input?.selectionEnd ?? draft.length;
    const next = `${draft.slice(0, start)}${emoji}${draft.slice(end)}`.slice(0, CHAT_LIMITS.textMax);
    setDraft(next);
    setEmojiOpen(false);
    // Focus now (keeps the keyboard in the message box); place the caret once React has updated the text.
    input?.focus();
    const caret = start + emoji.length;
    window.setTimeout(() => input?.setSelectionRange(caret, caret), 0);
  }

  function onDragEnter(event: DragEvent) {
    if (!event.dataTransfer.types.includes("Files")) return;
    dragDepth.current += 1;
    setDragging(true);
  }
  function onDragLeave() {
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (!dragDepth.current) setDragging(false);
  }
  function onDrop(event: DragEvent) {
    if (!event.dataTransfer.files.length) return;
    event.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    void attach(Array.from(event.dataTransfer.files));
  }
  function onPaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const pasted = Array.from(event.clipboardData.files);
    if (!pasted.length) return;
    event.preventDefault();
    void attach(pasted);
  }

  // Group consecutive messages from the same person (within 5 minutes) and add day separators.
  const rows = useMemo(() => {
    return messages.map((message, index) => {
      const previous = messages[index - 1];
      const newDay = !previous || dayLabel(previous.createdAt) !== dayLabel(message.createdAt);
      const grouped =
        !newDay &&
        previous?.author.id === message.author.id &&
        new Date(message.createdAt).getTime() - new Date(previous.createdAt).getTime() < GROUP_WINDOW_MS;
      return { message, newDay, grouped };
    });
  }, [messages]);

  // Keep the newest message in view unless the reader has scrolled up.
  useLayoutEffect(() => {
    const list = listRef.current;
    if (list && stickToBottom.current) list.scrollTop = list.scrollHeight;
  }, [messages, typing.length]);

  useEffect(() => {
    if (identity?.named) inputRef.current?.focus();
  }, [identity?.named]);

  function onScroll() {
    const list = listRef.current;
    if (!list) return;
    stickToBottom.current = list.scrollHeight - list.scrollTop - list.clientHeight < 80;
  }

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    const text = draft.trim();
    if ((!text && !readyIds.length) || sending) return;
    if (uploading) {
      setError("Wait for the files to finish uploading.");
      return;
    }
    setSending(true);
    setError("");
    stickToBottom.current = true;
    const problem = await onSend(text, readyIds, mentionsIn(text), replyTo?.id);
    setSending(false);
    if (problem) {
      setError(problem);
      return;
    }
    setDraft("");
    setPending([]);
    setMention(null);
    picked.current.clear();
    setReplyTo(null);
    inputRef.current?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // The @mention list takes the arrow keys, Enter/Tab and Escape while it's open.
    if (mention) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setMention(null);
        return;
      }
      if (suggestions.length) {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          const step = event.key === "ArrowDown" ? 1 : -1;
          setMentionIndex((index) => (index + step + suggestions.length) % suggestions.length);
          return;
        }
        if ((event.key === "Enter" || event.key === "Tab") && !event.shiftKey && !event.nativeEvent.isComposing) {
          event.preventDefault();
          pickMention(suggestions[Math.min(mentionIndex, suggestions.length - 1)]);
          return;
        }
      }
    }
    if (event.key === "Escape" && replyTo) {
      event.preventDefault();
      event.stopPropagation();
      setReplyTo(null);
      return;
    }
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void submit();
      return;
    }
    // Ctrl + / (⌘ + / on Mac) opens the emoji picker. Uses the physical key, so any layout works.
    if ((event.ctrlKey || event.metaKey) && !event.altKey && (event.code === "Slash" || event.key === "/")) {
      event.preventDefault();
      setEmojiOpen(true);
    }
  }

  async function rename() {
    const name = await dialogs.prompt({
      title: "Your name",
      label: "Shown to others in this note’s chat",
      defaultValue: identity?.named ? identity.name : "",
      placeholder: "e.g. Yash",
      confirmLabel: "Save",
      validate: (value) => (value ? null : "Enter a name."),
    });
    if (name) setIdentityName(name);
  }

  const me = identity?.id;
  const typingText =
    typing.length === 0
      ? ""
      : typing.length === 1
        ? `${typing[0].name} is typing…`
        : typing.length === 2
          ? `${typing[0].name} and ${typing[1].name} are typing…`
          : `${typing.length} people are typing…`;

  return (
    <div
      className="relative flex min-h-0 flex-1 flex-col"
      onPointerDown={onFirstInteraction}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes("Files")) event.preventDefault();
      }}
      onDrop={onDrop}
    >
      {/* Header: who's here, who you are, notifications */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-line/80 px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <h2 className="font-display text-2xl tracking-tight text-ink sm:text-3xl">Chat</h2>
          <span className="inline-flex items-center gap-2 text-xs text-ink-muted">
            <AvatarStack users={online} max={5} />
            {online.length} online
          </span>
        </div>
        <div className="flex items-center gap-2">
          {identity ? (
            <button
              type="button"
              onClick={() => void rename()}
              className="inline-flex h-9 items-center gap-2 rounded-full bg-surface px-2 pr-3 text-xs font-medium text-ink transition hover:bg-paper"
              title="Change your name"
            >
              <Avatar user={identity} size="sm" />
              <span className="max-w-28 truncate">{identity.name}</span>
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-ink-muted" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M4 20h4L19 9l-4-4L4 16z" />
              </svg>
            </button>
          ) : null}
          <NotificationToggle />
        </div>
      </div>

      {/* Messages */}
      <div
        ref={listRef}
        onScroll={onScroll}
        className="editor-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6"
        role="log"
        aria-live="polite"
        aria-label="Chat messages"
      >
        {!loaded ? (
          <p className="py-10 text-center text-sm text-ink-muted animate-soft-pulse">Loading messages…</p>
        ) : !messages.length ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 py-10 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-soft text-accent">
              <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden>
                <path d="M4 5h16v11H9l-5 4z" />
              </svg>
            </span>
            <p className="font-display text-xl text-ink">No messages yet</p>
            <p className="max-w-xs text-sm text-ink-muted">
              Everyone with this note’s link can chat here. Say hi!
            </p>
          </div>
        ) : (
          <ul className="space-y-1">
            {rows.map(({ message, newDay, grouped }) => {
              const mine = message.author.id === me;
              const mentionsMe = !mine && Boolean(message.mentions?.some((user) => user.id === me));
              return (
                <li key={message.id} id={`msg-${message.id}`} className="rounded-2xl">
                  {newDay ? (
                    <div className="my-3 flex items-center gap-3 text-[11px] font-medium uppercase tracking-[0.12em] text-ink-muted">
                      <span className="h-px flex-1 bg-line" />
                      {dayLabel(message.createdAt)}
                      <span className="h-px flex-1 bg-line" />
                    </div>
                  ) : null}
                  <div className={`flex items-end gap-2 ${mine ? "flex-row-reverse" : ""} ${grouped ? "" : "mt-3"}`}>
                    <span className="w-8 shrink-0">{!grouped && !mine ? <Avatar user={message.author} /> : null}</span>
                    <div
                      className={`msg-row relative flex max-w-[78%] flex-col ${mine ? "items-end" : "items-start"}`}
                      onClick={() => {
                        // Phones: tap a message to show its reactions and Reply.
                        if (!canHover) setActiveMessage((current) => (current === message.id ? null : message.id));
                      }}
                    >
                      <MessageActions
                        mine={mine}
                        visible={activeMessage === message.id}
                        hoverOnly={canHover}
                        myReactions={
                          new Set(
                            (message.reactions ?? []).filter((r) => r.users.some((u) => u.id === me)).map((r) => r.emoji),
                          )
                        }
                        onReact={(emoji) => void react(message.id, emoji)}
                        onMoreReactions={() => {
                          setReactTarget(message.id);
                          setMention(null);
                          setEmojiOpen(true);
                          setActiveMessage(null);
                        }}
                        onReply={() => startReply(message)}
                      />
                      {!grouped ? (
                        <span className="mb-1 px-1 text-[11px] text-ink-muted">
                          {mine ? "You" : <span className="font-semibold" style={{ color: message.author.color }}>{message.author.name}</span>}
                          {" · "}
                          {timeLabel(message.createdAt)}
                        </span>
                      ) : null}
                      {message.replyTo ? (
                        <ReplyQuote
                          reply={message.replyTo}
                          meId={me}
                          mine={mine}
                          onJump={() => jumpTo(message.replyTo!.id)}
                        />
                      ) : null}
                      {message.text ? (
                        <p
                          title={new Date(message.createdAt).toLocaleString()}
                          className={`whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-[15px] leading-6 ${
                            mine
                              ? "rounded-br-md bg-accent text-white"
                              : mentionsMe
                                ? "rounded-bl-md border border-accent/60 bg-accent-soft text-ink"
                                : "rounded-bl-md border border-line bg-surface text-ink"
                          }`}
                        >
                          <MessageText text={message.text} mentions={message.mentions} meId={me} mine={mine} />
                        </p>
                      ) : null}
                      {message.attachments?.length ? (
                        <MessageAttachments
                          attachments={message.attachments}
                          available={available}
                          mine={mine}
                          onOpen={setPreviewFile}
                        />
                      ) : null}
                      {message.reactions?.length ? (
                        <ReactionChips
                          reactions={message.reactions}
                          meId={me}
                          mine={mine}
                          onToggle={(emoji) => void react(message.id, emoji)}
                        />
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Typing + composer */}
      <div className="shrink-0 border-t border-line/80 px-3 pb-3 pt-1.5 sm:px-5">
        <p className="h-5 px-1 text-[11px] text-ink-muted" aria-live="polite">
          {typingText}
        </p>
        {identity && !identity.named ? (
          <form
            className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-3 sm:flex-row sm:items-center"
            onSubmit={(event) => {
              event.preventDefault();
              if (!setIdentityName(nameDraft)) setError("Enter a name to start chatting.");
              else setError("");
            }}
          >
            <span className="text-sm text-ink">
              What should others call you?
            </span>
            <input
              value={nameDraft}
              onChange={(event) => setNameDraft(event.target.value)}
              maxLength={CHAT_LIMITS.nameMax}
              placeholder="Your name"
              autoComplete="nickname"
              className="min-w-0 flex-1 rounded-full border border-line bg-paper-elevated px-4 py-2 text-sm text-ink outline-none focus:border-accent"
            />
            <button type="submit" className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:brightness-105">
              Start chatting
            </button>
          </form>
        ) : (
          <form onSubmit={(event) => void submit(event)} className="relative">
            {replyTo ? <ReplyingTo message={replyTo} meId={me} onCancel={() => setReplyTo(null)} /> : null}
            <PendingAttachments
              items={pending}
              onRemove={(key) => setPending((current) => current.filter((item) => item.key !== key))}
            />
            {mention && !emojiOpen ? (
              <MentionPicker
                users={suggestions}
                query={mention.query}
                activeIndex={Math.min(mentionIndex, Math.max(0, suggestions.length - 1))}
                anyoneOnline={others.length > 0}
                onPick={pickMention}
                onHover={setMentionIndex}
              />
            ) : null}
            {emojiOpen ? (
              <EmojiPicker
                onPick={pickEmoji}
                onClose={() => {
                  setEmojiOpen(false);
                  setReactTarget(null);
                  inputRef.current?.focus();
                }}
              />
            ) : null}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(event) => {
                if (event.target.files) void attach(Array.from(event.target.files));
                event.target.value = "";
              }}
            />
            <div className="flex items-end gap-2">
            <div className="flex shrink-0 items-center gap-0.5 rounded-2xl border border-line bg-surface p-1">
              <button
                type="button"
                data-emoji-toggle
                onClick={() => setEmojiOpen((open) => !open)}
                aria-label="Emoji (Ctrl + /)"
                title="Emoji (Ctrl + /)"
                aria-expanded={emojiOpen}
                className={`flex h-9 w-9 items-center justify-center rounded-xl transition ${
                  emojiOpen ? "bg-accent-soft text-accent" : "text-ink-muted hover:bg-paper hover:text-ink"
                }`}
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
                  <circle cx="12" cy="12" r="9" />
                  <path d="M8.5 14.5s1.3 2 3.5 2 3.5-2 3.5-2M9 9.5h.01M15 9.5h.01" strokeWidth="2.2" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                aria-label="Attach files"
                title={`Attach files${maxFileSize ? ` (up to ${formatBytes(maxFileSize)} each)` : ""}`}
                className="flex h-9 w-9 items-center justify-center rounded-xl text-ink-muted transition hover:bg-paper hover:text-ink"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="m20.5 11.5-8.4 8.4a5.2 5.2 0 0 1-7.4-7.4l8.4-8.4a3.5 3.5 0 0 1 4.9 4.9l-8.4 8.4a1.7 1.7 0 0 1-2.5-2.5l7.7-7.7" />
                </svg>
              </button>
            </div>
            <textarea
              ref={inputRef}
              value={draft}
              rows={1}
              maxLength={CHAT_LIMITS.textMax}
              onChange={(event) => {
                setDraft(event.target.value);
                setError("");
                updateMention(event.target.value, event.target.selectionStart);
                if (event.target.value) onTyping();
              }}
              onSelect={(event) => updateMention(event.currentTarget.value, event.currentTarget.selectionStart)}
              onBlur={() => setMention(null)}
              onKeyDown={onKeyDown}
              onPaste={onPaste}
              placeholder="Write a message… (@ to mention, Ctrl + / for emoji)"
              aria-label="Message"
              className="max-h-36 min-h-11 flex-1 resize-none rounded-2xl border border-line bg-surface px-4 py-2.5 text-[15px] leading-6 text-ink outline-none transition [field-sizing:content] focus:border-accent"
            />
            <button
              type="submit"
              disabled={(!draft.trim() && !readyIds.length) || sending || uploading}
              aria-label="Send message"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent text-white transition hover:brightness-105 disabled:opacity-40 disabled:shadow-none"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </button>
            </div>
          </form>
        )}
        {error ? <p className="mt-1.5 px-1 text-xs text-danger">{error}</p> : null}
        {!error && draft.length > CHAT_LIMITS.textMax * 0.9 ? (
          <p className="mt-1.5 px-1 text-xs text-ink-muted">
            {draft.length}/{CHAT_LIMITS.textMax}
          </p>
        ) : null}
      </div>

      {dragging ? (
        <div className="pointer-events-none absolute inset-2 z-20 flex flex-col items-center justify-center gap-2 rounded-3xl border-2 border-dashed border-accent bg-surface/90">
          <p className="font-display text-2xl text-ink">Drop to send in chat</p>
          <p className="text-sm text-ink-muted">Files are also saved in this note’s Files.</p>
        </div>
      ) : null}

      {previewFile ? (
        <Modal
          title={previewFile.name}
          size="lg"
          onClose={() => setPreviewFile(null)}
          actions={
            <a
              href={fileRawUrl(previewFile.id, true)}
              download
              className="rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink transition hover:border-ink/20"
            >
              Download
            </a>
          }
        >
          <div className="h-[70dvh] min-h-0 p-3 sm:p-5">
            <FilePreview file={previewFile} />
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
