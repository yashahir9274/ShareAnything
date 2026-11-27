"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { FluentEmoji } from "./fluent-emoji";
import { QUICK_REACTIONS, type ChatMessage, type ChatReaction, type ChatReplyRef, type ChatUser } from "@/lib/chat";

/** True on devices with a real hover (mouse/trackpad). Touch screens get tap-to-show instead. */
export function useCanHover() {
  return useSyncExternalStore(
    (onChange) => {
      const media = window.matchMedia("(hover: hover)");
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    },
    () => window.matchMedia("(hover: hover)").matches,
    () => true,
  );
}

function ReplyIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
    </svg>
  );
}

function SmilePlusIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <path d="M21 11.5V12a9 9 0 1 1-9-9h.5" />
      <path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01" />
      <path d="M16 5h6M19 2v6" />
    </svg>
  );
}

/** One row in a message's "⋯" menu. */
export type MessageMenuItem = {
  label: string;
  onSelect: () => void;
  danger?: boolean;
  /** Greyed out with this reason as a tooltip (e.g. "Messages can be edited for 15 minutes"). */
  disabledReason?: string;
};

function MoreIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden>
      <path d="M5 12h.01M12 12h.01M19 12h.01" />
    </svg>
  );
}

/**
 * The bar that appears over a message on hover (or tap on phones):
 * quick reactions, "any emoji", Reply, and a "⋯" menu (edit, copy, delete).
 */
export function MessageActions({
  mine,
  visible,
  hoverOnly,
  reactable,
  myReactions,
  menu,
  onReact,
  onMoreReactions,
  onReply,
}: {
  mine: boolean;
  /** Shown regardless of hover (tapped on a phone). */
  visible: boolean;
  /** Hidden until the message is hovered or focused. */
  hoverOnly: boolean;
  /** False for deleted messages: only the menu is offered. */
  reactable: boolean;
  myReactions: Set<string>;
  /** Builds the "⋯" menu when it's opened (so time limits are checked at that moment). */
  menu: () => MessageMenuItem[];
  onReact: (emoji: string) => void;
  onMoreReactions: () => void;
  onReply: () => void;
}) {
  const [menuItems, setMenuItems] = useState<MessageMenuItem[] | null>(null);
  const menuOpen = menuItems !== null;
  const setMenuOpen = (open: boolean) => setMenuItems(open ? menu() : null);
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onPointer(event: PointerEvent) {
      if (!barRef.current?.contains(event.target as Node)) setMenuItems(null);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuItems(null);
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  if (!hoverOnly && !visible) return null;
  return (
    <div
      ref={barRef}
      role="toolbar"
      aria-label="Message actions"
      onClick={(event) => event.stopPropagation()}
      className={`absolute -top-5 z-10 flex items-center gap-0.5 rounded-full border border-line bg-surface p-0.5 shadow-[0_8px_24px_rgba(11,20,32,0.14)] ${
        mine ? "right-1" : "left-1"
      } ${hoverOnly && !visible && !menuOpen ? "message-actions" : "animate-fade-up"}`}
    >
      {reactable ? (
        <>
          {QUICK_REACTIONS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              title={myReactions.has(emoji) ? `Remove ${emoji}` : `React ${emoji}`}
              aria-label={`React ${emoji}`}
              aria-pressed={myReactions.has(emoji)}
              onClick={() => onReact(emoji)}
              className={`flex h-7 w-7 items-center justify-center rounded-full text-[17px] leading-none transition hover:scale-125 hover:bg-paper ${
                myReactions.has(emoji) ? "bg-accent-soft" : ""
              }`}
            >
              <FluentEmoji emoji={emoji} className="h-5 w-5" lazy={false} />
            </button>
          ))}
          <button
            type="button"
            title="More reactions"
            aria-label="More reactions"
            onClick={onMoreReactions}
            className="flex h-7 w-7 items-center justify-center rounded-full text-ink-muted transition hover:bg-paper hover:text-ink"
          >
            <SmilePlusIcon />
          </button>
          <span className="mx-0.5 h-4 w-px bg-line" aria-hidden />
          <button
            type="button"
            title="Reply"
            aria-label="Reply"
            onClick={onReply}
            className="flex h-7 items-center gap-1 rounded-full px-2 text-xs font-semibold text-ink-muted transition hover:bg-paper hover:text-ink"
          >
            <ReplyIcon className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Reply</span>
          </button>
        </>
      ) : null}
      <button
        type="button"
        title="More"
        aria-label="More message options"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen(!menuOpen)}
        className={`flex h-7 w-7 items-center justify-center rounded-full transition hover:bg-paper hover:text-ink ${
          menuOpen ? "bg-paper text-ink" : "text-ink-muted"
        }`}
      >
        <MoreIcon />
      </button>

      {menuOpen ? (
        <div
          role="menu"
          aria-label="Message options"
          className={`absolute top-full z-20 mt-1.5 w-52 rounded-2xl border border-line bg-surface p-1.5 shadow-[0_18px_48px_rgba(11,20,32,0.2)] animate-fade-up ${
            mine ? "right-0" : "left-0"
          }`}
        >
          {(menuItems ?? []).map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              disabled={Boolean(item.disabledReason)}
              title={item.disabledReason}
              onClick={() => {
                setMenuOpen(false);
                item.onSelect();
              }}
              className={`flex w-full flex-col rounded-xl px-3 py-2 text-left text-sm transition enabled:hover:bg-paper disabled:cursor-not-allowed disabled:opacity-45 ${
                item.danger ? "text-danger" : "text-ink"
              }`}
            >
              {item.label}
              {item.disabledReason ? <span className="text-[11px] text-ink-muted">{item.disabledReason}</span> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Reaction counts under a message. Click one to add or remove yours. */
export function ReactionChips({
  reactions,
  meId,
  mine,
  onToggle,
}: {
  reactions: ChatReaction[];
  meId?: string;
  mine: boolean;
  onToggle: (emoji: string) => void;
}) {
  return (
    <div className={`mt-1 flex flex-wrap gap-1 ${mine ? "justify-end" : "justify-start"}`}>
      {reactions.map((reaction) => {
        const reacted = reaction.users.some((user) => user.id === meId);
        const names = reaction.users.map((user) => (user.id === meId ? "You" : user.name));
        const who = names.length > 3 ? `${names.slice(0, 3).join(", ")} and ${names.length - 3} more` : names.join(", ");
        return (
          <button
            key={reaction.emoji}
            type="button"
            title={`${who} reacted ${reaction.emoji}${reacted ? " · click to remove yours" : ""}`}
            aria-label={`${reaction.emoji} ${reaction.users.length}: ${who}`}
            aria-pressed={reacted}
            onClick={() => onToggle(reaction.emoji)}
            className={`inline-flex h-6 items-center gap-1 rounded-full border px-2 text-xs transition hover:border-accent/60 ${
              reacted ? "border-accent/70 bg-accent-soft font-semibold text-ink" : "border-line bg-surface text-ink-muted"
            }`}
          >
            <FluentEmoji emoji={reaction.emoji} className="h-4 w-4" />
            {reaction.users.length}
          </button>
        );
      })}
    </div>
  );
}

function replySummary(reply: Pick<ChatReplyRef, "text" | "files" | "deleted" | "gif">) {
  if (reply.deleted) return "🚫 This message was deleted";
  if (reply.text) return reply.text;
  if (reply.gif) return "🎞️ GIF";
  if (reply.files) return reply.files === 1 ? "📎 A file" : `📎 ${reply.files} files`;
  return "Message";
}

/** The quote of the original shown above a reply. Click to jump to it. */
export function ReplyQuote({
  reply,
  meId,
  mine,
  onJump,
}: {
  reply: ChatReplyRef;
  meId?: string;
  mine: boolean;
  onJump: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onJump}
      title="Show the original message"
      className={`mb-0.5 flex max-w-full items-stretch gap-2 rounded-xl border border-line bg-paper/80 px-2.5 py-1.5 text-left text-xs transition hover:border-ink/25 ${
        mine ? "self-end" : "self-start"
      }`}
    >
      <span className="w-0.5 shrink-0 rounded-full" style={{ backgroundColor: reply.author.color }} />
      <span className="min-w-0">
        <span className="flex items-center gap-1 font-semibold" style={{ color: reply.author.color }}>
          <ReplyIcon className="h-3 w-3" />
          {reply.author.id === meId ? "You" : reply.author.name}
        </span>
        <span className="line-clamp-2 break-words text-ink-muted">{replySummary(reply)}</span>
      </span>
    </button>
  );
}

/** "Replying to Riya · …" above the message box. */
export function ReplyingTo({
  message,
  meId,
  onCancel,
}: {
  message: ChatMessage;
  meId?: string;
  onCancel: () => void;
}) {
  return (
    <div className="mb-2 flex items-center gap-2 rounded-2xl border border-line bg-paper px-3 py-2 animate-fade-up">
      <ReplyIcon className="h-4 w-4 shrink-0 text-accent" />
      <span className="w-0.5 self-stretch rounded-full" style={{ backgroundColor: message.author.color }} />
      <div className="min-w-0 flex-1 text-xs">
        <p className="font-semibold text-ink">
          Replying to {message.author.id === meId ? "yourself" : message.author.name}
        </p>
        <p className="truncate text-ink-muted">
          {replySummary({ text: message.text.replace(/\s+/g, " "), files: message.attachments?.length, gif: Boolean(message.gif) })}
        </p>
      </div>
      <button
        type="button"
        onClick={onCancel}
        aria-label="Cancel reply (Esc)"
        title="Cancel reply (Esc)"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-ink-muted transition hover:bg-surface hover:text-ink"
      >
        ×
      </button>
    </div>
  );
}

/** "Riya Shah" stays; "Alexandria Montgomery" → "Alexandria"; "Supercalifragilistic" → "Supercalifrag…". */
export function shortName(name: string, max = 14) {
  if (name.length <= max) return name;
  const first = name.split(/\s+/)[0];
  if (first.length <= max) return first;
  return `${name.slice(0, max - 1)}…`;
}

/** Who's typing: their avatar(s), bouncing dots and (shortened) names. */
export function TypingIndicator({ users }: { users: ChatUser[] }) {
  if (!users.length) return <span className="sr-only" aria-live="polite" />;
  const names = users.map((user) => shortName(user.name));
  const label =
    users.length === 1
      ? `${names[0]} is typing`
      : users.length === 2
        ? `${names[0]} and ${names[1]} are typing`
        : `${names[0]}, ${names[1]} +${users.length - 2} are typing`;
  const full =
    users.length === 1 ? `${users[0].name} is typing` : `${users.map((u) => u.name).join(", ")} are typing`;
  return (
    <span className="inline-flex max-w-full items-center gap-2 animate-fade-up" title={full}>
      <span className="flex shrink-0 -space-x-1.5">
        {users.slice(0, 3).map((user) => (
          <span
            key={user.id}
            className="flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold text-white ring-2 ring-paper-elevated"
            style={{ backgroundColor: user.color }}
            aria-hidden
          >
            {user.name.trim().slice(0, 1).toUpperCase()}
          </span>
        ))}
      </span>
      <span className="flex shrink-0 items-center gap-[3px] rounded-full border border-line bg-surface px-2 py-1.5" aria-hidden>
        <span className="typing-dot" />
        <span className="typing-dot" />
        <span className="typing-dot" />
      </span>
      <span className="truncate text-[11px] text-ink-muted" aria-hidden>
        <span className="font-semibold text-ink">{label.replace(/ (is|are) typing$/, "")}</span>
        {users.length === 1 ? " is typing" : " are typing"}
      </span>
      <span className="sr-only" aria-live="polite">
        {full}
      </span>
    </span>
  );
}
