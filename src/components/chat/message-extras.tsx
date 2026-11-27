"use client";

import { useSyncExternalStore } from "react";
import { QUICK_REACTIONS, type ChatMessage, type ChatReaction, type ChatReplyRef } from "@/lib/chat";

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

/**
 * The bar that appears over a message on hover (or tap on phones):
 * quick reactions, "any emoji", and Reply.
 */
export function MessageActions({
  mine,
  visible,
  hoverOnly,
  myReactions,
  onReact,
  onMoreReactions,
  onReply,
}: {
  mine: boolean;
  /** Shown regardless of hover (tapped on a phone). */
  visible: boolean;
  /** Hidden until the message is hovered or focused. */
  hoverOnly: boolean;
  myReactions: Set<string>;
  onReact: (emoji: string) => void;
  onMoreReactions: () => void;
  onReply: () => void;
}) {
  if (!hoverOnly && !visible) return null;
  return (
    <div
      role="toolbar"
      aria-label="Message actions"
      className={`absolute -top-5 z-10 flex items-center gap-0.5 rounded-full border border-line bg-surface p-0.5 shadow-[0_8px_24px_rgba(11,20,32,0.14)] ${
        mine ? "right-1" : "left-1"
      } ${hoverOnly && !visible ? "message-actions" : "animate-fade-up"}`}
    >
      {QUICK_REACTIONS.map((emoji) => (
        <button
          key={emoji}
          type="button"
          title={myReactions.has(emoji) ? `Remove ${emoji}` : `React ${emoji}`}
          aria-label={`React ${emoji}`}
          aria-pressed={myReactions.has(emoji)}
          onClick={(event) => {
            event.stopPropagation();
            onReact(emoji);
          }}
          className={`flex h-7 w-7 items-center justify-center rounded-full text-[17px] leading-none transition hover:scale-125 hover:bg-paper ${
            myReactions.has(emoji) ? "bg-accent-soft" : ""
          }`}
        >
          {emoji}
        </button>
      ))}
      <button
        type="button"
        title="More reactions"
        aria-label="More reactions"
        onClick={(event) => {
          event.stopPropagation();
          onMoreReactions();
        }}
        className="flex h-7 w-7 items-center justify-center rounded-full text-ink-muted transition hover:bg-paper hover:text-ink"
      >
        <SmilePlusIcon />
      </button>
      <span className="mx-0.5 h-4 w-px bg-line" aria-hidden />
      <button
        type="button"
        title="Reply"
        aria-label="Reply"
        onClick={(event) => {
          event.stopPropagation();
          onReply();
        }}
        className="flex h-7 items-center gap-1 rounded-full px-2 text-xs font-semibold text-ink-muted transition hover:bg-paper hover:text-ink"
      >
        <ReplyIcon className="h-3.5 w-3.5" />
        Reply
      </button>
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
            <span className="text-sm leading-none">{reaction.emoji}</span>
            {reaction.users.length}
          </button>
        );
      })}
    </div>
  );
}

function replySummary(reply: Pick<ChatReplyRef, "text" | "files">) {
  if (reply.text) return reply.text;
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
          {replySummary({ text: message.text.replace(/\s+/g, " "), files: message.attachments?.length })}
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
