"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ALL_EMOJIS, EMOJI_CATEGORIES } from "./emoji-data";
import { FluentEmoji } from "./fluent-emoji";

const RECENT_KEY = "shareanything:recent-emojis";
const RECENT_MAX = 16;

function readRecent(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as unknown;
    return Array.isArray(parsed) ? parsed.filter((e): e is string => typeof e === "string").slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

function rememberRecent(emoji: string) {
  try {
    const next = [emoji, ...readRecent().filter((e) => e !== emoji)].slice(0, RECENT_MAX);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

/**
 * Emoji popover: search, categories, recently used. Enter picks the first match,
 * Escape closes. Closing returns focus to the message box (handled by the caller).
 */
export function EmojiPicker({ onPick, onClose }: { onPick: (emoji: string) => void; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [recent] = useState(readRecent);
  const searchRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  useEffect(() => {
    searchRef.current?.focus();
    function onDocPointer(event: PointerEvent) {
      const target = event.target as HTMLElement;
      // Clicks on the emoji button toggle it themselves.
      if (!panelRef.current?.contains(target) && !target.closest("[data-emoji-toggle]")) onClose();
    }
    document.addEventListener("pointerdown", onDocPointer);
    return () => document.removeEventListener("pointerdown", onDocPointer);
  }, [onClose]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return ALL_EMOJIS.filter((emoji) => emoji.keywords.includes(q)).slice(0, 80);
  }, [query]);

  function pick(emoji: string) {
    rememberRecent(emoji);
    onPick(emoji);
  }

  function emojiButton(char: string, keywords: string, key: string) {
    return (
      <button
        key={key}
        type="button"
        title={keywords.split(" ")[0]}
        aria-label={keywords.split(" ")[0]}
        onClick={() => pick(char)}
        className="flex h-9 w-9 items-center justify-center rounded-xl text-[22px] leading-none transition hover:scale-110 hover:bg-paper focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <FluentEmoji emoji={char} className="h-6 w-6" />
      </button>
    );
  }

  const keywordsFor = (char: string) => ALL_EMOJIS.find((e) => e.char === char)?.keywords ?? "emoji";

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Emoji picker"
      className="absolute bottom-full left-0 z-30 mb-2 flex h-[22rem] w-[min(22rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl animate-fade-up"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="shrink-0 border-b border-line/80 p-2">
        <input
          ref={searchRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              const first = results?.[0];
              if (first) pick(first.char);
            }
          }}
          placeholder="Search emoji (e.g. laugh, heart, fire)"
          aria-label="Search emoji"
          className="w-full rounded-xl border border-line bg-paper-elevated px-3 py-2 text-sm text-ink outline-none focus:border-accent"
        />
      </div>

      <div className="editor-scroll min-h-0 flex-1 overflow-y-auto p-2">
        {results ? (
          results.length ? (
            <div className="grid grid-cols-8 gap-0.5">
              {results.map((emoji) => emojiButton(emoji.char, emoji.keywords, emoji.char))}
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-ink-muted">No emoji found</p>
          )
        ) : (
          <>
            {recent.length ? (
              <section className="mb-2">
                <p className="px-1 pb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-muted">Recently used</p>
                <div className="grid grid-cols-8 gap-0.5">
                  {recent.map((char) => emojiButton(char, keywordsFor(char), `recent-${char}`))}
                </div>
              </section>
            ) : null}
            {EMOJI_CATEGORIES.map((category) => (
              <section
                key={category.id}
                ref={(element) => {
                  sectionRefs.current[category.id] = element;
                }}
                className="mb-2"
              >
                <p className="px-1 pb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-muted">{category.label}</p>
                <div className="grid grid-cols-8 gap-0.5">
                  {category.emojis.map((emoji) => emojiButton(emoji.char, emoji.keywords, emoji.char))}
                </div>
              </section>
            ))}
          </>
        )}
      </div>

      {results ? null : (
        <div className="flex shrink-0 justify-between border-t border-line/80 px-1.5 py-1">
          {EMOJI_CATEGORIES.map((category) => (
            <button
              key={category.id}
              type="button"
              title={category.label}
              aria-label={category.label}
              onClick={() => sectionRefs.current[category.id]?.scrollIntoView({ block: "start", behavior: "smooth" })}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-lg transition hover:bg-paper"
            >
              {category.icon}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
