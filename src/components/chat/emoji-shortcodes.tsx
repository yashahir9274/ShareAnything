"use client";

import { ALL_EMOJIS } from "./emoji-data";
import { FluentEmoji } from "./fluent-emoji";

/**
 * Emoji shortcodes, as in Teams/Slack: type ":lol" for suggestions, or ":lol:" to
 * turn it straight into 😆. Codes are the emoji's search keywords plus common aliases.
 */

const ALIASES: Record<string, string> = {
  "+1": "👍",
  "-1": "👎",
  thumbsup: "👍",
  thumbsdown: "👎",
  like: "👍",
  heart: "❤️",
  love: "😍",
  lol: "😆",
  rofl: "🤣",
  joy: "😂",
  lmao: "🤣",
  smile: "😄",
  happy: "😊",
  sad: "😢",
  cry: "😭",
  wink: "😉",
  cool: "😎",
  kiss: "😘",
  angry: "😠",
  shock: "😮",
  wow: "😮",
  thinking: "🤔",
  shrug: "🤷",
  facepalm: "🤦",
  clap: "👏",
  pray: "🙏",
  thanks: "🙏",
  ok: "👌",
  wave: "👋",
  fire: "🔥",
  party: "🎉",
  tada: "🎉",
  "100": "💯",
  eyes: "👀",
  check: "✅",
  x: "❌",
  rocket: "🚀",
  star: "⭐",
  coffee: "☕",
  cake: "🎂",
  gift: "🎁",
  sleepy: "😴",
  sick: "🤒",
  money: "💰",
  muscle: "💪",
  skull: "💀",
  poop: "💩",
  sweat: "😅",
};

type Code = { code: string; char: string };

/** Every (code, emoji) pair; aliases first, then each emoji's keywords in order. */
const CODES: Code[] = (() => {
  const seen = new Set<string>();
  const list: Code[] = [];
  const add = (code: string, char: string) => {
    const key = `${code} ${char}`;
    if (seen.has(key)) return;
    seen.add(key);
    list.push({ code, char });
  };
  for (const [code, char] of Object.entries(ALIASES)) add(code, char);
  for (const emoji of ALL_EMOJIS) for (const word of emoji.keywords.split(/\s+/)) if (word) add(word.toLowerCase(), emoji.char);
  return list;
})();

/** ":lo" right before the caret (needs 2+ characters) → { start: index of ":", query: "lo" }. */
export function findShortcodeQuery(text: string, caret: number): { start: number; query: string } | null {
  const match = text.slice(0, caret).match(/(^|[\s(]):([a-z0-9_+-]{2,30})$/i);
  if (!match) return null;
  return { start: caret - match[2].length - 1, query: match[2].toLowerCase() };
}

/** Best matches for a query: exact codes first, then codes that start with it; one row per emoji. */
export function matchShortcodes(query: string, limit = 8): Code[] {
  const q = query.toLowerCase();
  const exact = CODES.filter((c) => c.code === q);
  const prefix = CODES.filter((c) => c.code !== q && c.code.startsWith(q)).sort((a, b) => a.code.length - b.code.length);
  const out: Code[] = [];
  const chars = new Set<string>();
  for (const c of [...exact, ...prefix]) {
    if (chars.has(c.char)) continue;
    chars.add(c.char);
    out.push(c);
    if (out.length >= limit) break;
  }
  return out;
}

/** ":lol:" typed in full → 😆 (null if it isn't a known code). */
export function emojiForCode(code: string): string | null {
  return matchShortcodes(code, 1).find((c) => c.code === code.toLowerCase())?.char ?? null;
}

export function ShortcodePicker({
  items,
  query,
  activeIndex,
  onPick,
  onHover,
}: {
  items: Code[];
  query: string;
  activeIndex: number;
  onPick: (item: Code) => void;
  onHover: (index: number) => void;
}) {
  return (
    <div
      role="listbox"
      aria-label="Emoji suggestions"
      className="absolute bottom-full left-0 z-20 mb-2 w-72 max-w-full overflow-hidden rounded-2xl border border-line bg-surface p-1.5 shadow-[0_18px_48px_rgba(11,20,32,0.18)] animate-fade-up"
    >
      <p className="px-2.5 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted">Emoji</p>
      {items.length ? (
        items.map((item, index) => (
          <button
            key={`${item.code}-${item.char}`}
            type="button"
            role="option"
            aria-selected={index === activeIndex}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onPick(item)}
            onPointerMove={() => onHover(index)}
            className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-1.5 text-left text-sm transition ${
              index === activeIndex ? "bg-paper text-ink" : "text-ink"
            }`}
          >
            <FluentEmoji emoji={item.char} className="h-6 w-6" lazy={false} />
            <span className="truncate font-mono text-[13px]">
              :<strong className="font-bold">{item.code.slice(0, query.length)}</strong>
              {item.code.slice(query.length)}:
            </span>
          </button>
        ))
      ) : (
        <p className="px-2.5 py-2 text-sm text-ink-muted">No emoji for “:{query}”.</p>
      )}
      {items.length ? (
        <p className="px-2.5 pb-1 pt-1.5 text-[11px] text-ink-muted">Enter or Tab to insert · Esc to close</p>
      ) : null}
    </div>
  );
}
