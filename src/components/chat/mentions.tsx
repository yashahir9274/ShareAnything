"use client";

import { Fragment } from "react";
import { Avatar } from "@/components/chat/avatars";
import type { ChatUser } from "@/lib/chat";
import { EmojiText } from "./fluent-emoji";

/** "@ri" right before the caret → { start: index of "@", query: "ri" }. Names may contain spaces. */
export function findMentionQuery(text: string, caret: number): { start: number; query: string } | null {
  const before = text.slice(0, caret);
  const match = before.match(/(^|\s)@([^\n@]{0,30})$/);
  if (!match) return null;
  return { start: caret - match[2].length - 1, query: match[2] };
}

/** The "@everyone" entry in the list (not a real person). */
export const EVERYONE_ID = "__everyone__";

/**
 * People to suggest for a query: name starts with it, or any word in the name does.
 * Once the query has a space ("Yash how…"), only names that really start with it match —
 * so a finished "@Yash" followed by your sentence doesn't keep the list open.
 */
export function matchMentions<T extends ChatUser>(users: T[], query: string): T[] {
  const q = query.toLowerCase();
  const hasSpace = /\s/.test(q);
  return users
    .filter((user) => {
      const name = user.name.toLowerCase();
      if (hasSpace) return name.startsWith(q);
      return name.startsWith(q) || name.split(/\s+/).some((word) => word.startsWith(q));
    })
    .sort((a, b) => Number(!a.name.toLowerCase().startsWith(q)) - Number(!b.name.toLowerCase().startsWith(q)))
    .slice(0, 8);
}

export type MentionOption = { user: ChatUser; online: boolean };

/** The list that pops up above the message box while typing "@…". */
export function MentionPicker({
  options,
  query,
  activeIndex,
  onPick,
  onHover,
}: {
  /** People (online first) and, when it matches, the "everyone" entry (id EVERYONE_ID). */
  options: MentionOption[];
  query: string;
  activeIndex: number;
  onPick: (user: ChatUser) => void;
  onHover: (index: number) => void;
}) {
  return (
    <div
      role="listbox"
      aria-label="Mention someone"
      className="absolute bottom-full left-0 z-20 mb-2 w-72 max-w-full overflow-hidden rounded-2xl border border-line bg-surface p-1.5 shadow-[0_18px_48px_rgba(11,20,32,0.18)] animate-fade-up"
    >
      <p className="px-2.5 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted">Mention</p>
      {options.map(({ user, online }, index) => {
        const everyone = user.id === EVERYONE_ID;
        return (
          <button
            key={user.id}
            type="button"
            role="option"
            aria-selected={index === activeIndex}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onPick(user)}
            onPointerMove={() => onHover(index)}
            className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm transition ${
              index === activeIndex ? "bg-accent-soft text-ink" : "text-ink"
            }`}
          >
            {everyone ? (
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-white" aria-hidden>
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" />
                  <circle cx="9" cy="7" r="4" />
                </svg>
              </span>
            ) : (
              <Avatar user={user} size="sm" />
            )}
            <span className="min-w-0 flex-1 truncate font-medium">
              {everyone ? (
                <>
                  <Highlight text="everyone" query={query} />
                  <span className="ml-1.5 text-xs font-normal text-ink-muted">notify everyone here</span>
                </>
              ) : (
                <Highlight text={user.name} query={query} />
              )}
            </span>
            {everyone ? null : (
              <span className="flex items-center gap-1 text-[11px] text-ink-muted">
                <span className={`h-1.5 w-1.5 rounded-full ${online ? "bg-teal" : "bg-ink/25"}`} />
                {online ? "online" : "in chat"}
              </span>
            )}
          </button>
        );
      })}
      <p className="px-2.5 pb-1 pt-1.5 text-[11px] text-ink-muted">↑ ↓ to choose · Enter or Tab · or just keep typing the name</p>
    </div>
  );
}

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const index = text.toLowerCase().indexOf(query.toLowerCase());
  if (index < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, index)}
      <mark className="rounded bg-transparent font-bold text-accent">{text.slice(index, index + query.length)}</mark>
      {text.slice(index + query.length)}
    </>
  );
}

const URL_PATTERN = /(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])/g;

function Links({ text, emojiSize }: { text: string; emojiSize?: string }) {
  const parts = text.split(URL_PATTERN);
  return (
    <>
      {parts.map((part, index) =>
        index % 2 === 1 ? (
          <a key={index} href={part} target="_blank" rel="noopener noreferrer nofollow" className="underline underline-offset-2">
            {part}
          </a>
        ) : (
          <EmojiText key={index} text={part} size={emojiSize} />
        ),
      )}
    </>
  );
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Message text with clickable links and highlighted @mentions ("you" stands out more). */
export function MessageText({
  text,
  mentions,
  mentionsAll,
  meId,
  mine,
  emojiSize,
}: {
  text: string;
  mentions?: ChatUser[];
  /** The message has @everyone / @all. */
  mentionsAll?: boolean;
  meId?: string;
  mine: boolean;
  /** Size for emoji images (bigger when a message is only emoji). */
  emojiSize?: string;
}) {
  if (!mentions?.length && !mentionsAll) return <Links text={text} emojiSize={emojiSize} />;
  // Longest names first, so "@Riya Shah" wins over "@Riya". Case doesn't matter.
  const byName = new Map((mentions ?? []).map((user) => [user.name.toLowerCase(), user]));
  if (mentionsAll) {
    for (const word of ["everyone", "all"]) byName.set(word, { id: EVERYONE_ID, name: word, color: "" });
  }
  const names = [...byName.keys()].sort((a, b) => b.length - a.length).map(escapeRegExp);
  const parts = text.split(new RegExp(`(@(?:${names.join("|")}))`, "gi"));
  return (
    <>
      {parts.map((part, index) => {
        const user = index % 2 === 1 ? byName.get(part.slice(1).toLowerCase()) : undefined;
        if (!user) return <Links key={index} text={part} emojiSize={emojiSize} />;
        const isMe = user.id === meId || user.id === EVERYONE_ID;
        return (
          <span
            key={index}
            title={user.id === EVERYONE_ID ? "Everyone was mentioned" : isMe ? "You were mentioned" : `Mentioned ${user.name}`}
            className={`rounded-md px-1 font-semibold ${
              mine ? "bg-white/20 text-white" : isMe ? "bg-accent text-white" : "bg-accent-soft text-accent"
            }`}
          >
            {part}
          </span>
        );
      })}
    </>
  );
}
