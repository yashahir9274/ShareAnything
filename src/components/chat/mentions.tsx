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

/** People to suggest for a query: name starts with it, or any word in the name does. */
export function matchMentions(users: ChatUser[], query: string) {
  const q = query.toLowerCase();
  return users
    .filter((user) => {
      const name = user.name.toLowerCase();
      return name.startsWith(q) || name.split(/\s+/).some((word) => word.startsWith(q));
    })
    .sort((a, b) => Number(!a.name.toLowerCase().startsWith(q)) - Number(!b.name.toLowerCase().startsWith(q)))
    .slice(0, 8);
}

/** The list that pops up above the message box while typing "@…". */
export function MentionPicker({
  users,
  query,
  activeIndex,
  anyoneOnline,
  onPick,
  onHover,
}: {
  users: ChatUser[];
  query: string;
  activeIndex: number;
  /** Whether anyone else is online at all (changes the empty message). */
  anyoneOnline: boolean;
  onPick: (user: ChatUser) => void;
  onHover: (index: number) => void;
}) {
  return (
    <div
      role="listbox"
      aria-label="Mention someone"
      className="absolute bottom-full left-0 z-20 mb-2 w-72 max-w-full overflow-hidden rounded-2xl border border-line bg-surface p-1.5 shadow-[0_18px_48px_rgba(11,20,32,0.18)] animate-fade-up"
    >
      <p className="px-2.5 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
        Mention someone online
      </p>
      {users.length ? (
        users.map((user, index) => (
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
            <Avatar user={user} size="sm" />
            <span className="min-w-0 flex-1 truncate font-medium">
              <Highlight text={user.name} query={query} />
            </span>
            <span className="flex items-center gap-1 text-[11px] text-ink-muted">
              <span className="h-1.5 w-1.5 rounded-full bg-teal" />
              online
            </span>
          </button>
        ))
      ) : (
        <p className="px-2.5 py-2 text-sm text-ink-muted">
          {anyoneOnline ? `No one online matches “${query}”.` : "No one else is in this note right now."}
        </p>
      )}
      {users.length ? (
        <p className="px-2.5 pb-1 pt-1.5 text-[11px] text-ink-muted">↑ ↓ to choose · Enter or Tab to mention · Esc to close</p>
      ) : null}
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
  meId,
  mine,
  emojiSize,
}: {
  text: string;
  mentions?: ChatUser[];
  meId?: string;
  mine: boolean;
  /** Size for emoji images (bigger when a message is only emoji). */
  emojiSize?: string;
}) {
  if (!mentions?.length) return <Links text={text} emojiSize={emojiSize} />;
  // Longest names first, so "@Riya Shah" wins over "@Riya".
  const byName = new Map(mentions.map((user) => [user.name, user]));
  const names = [...byName.keys()].sort((a, b) => b.length - a.length).map(escapeRegExp);
  const parts = text.split(new RegExp(`(@(?:${names.join("|")}))`, "g"));
  return (
    <>
      {parts.map((part, index) => {
        const user = index % 2 === 1 ? byName.get(part.slice(1)) : undefined;
        if (!user) return <Links key={index} text={part} emojiSize={emojiSize} />;
        const isMe = user.id === meId;
        return (
          <span
            key={index}
            title={isMe ? "You were mentioned" : `Mentioned ${user.name}`}
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
