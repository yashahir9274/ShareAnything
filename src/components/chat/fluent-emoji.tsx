"use client";

import { Fragment, useState } from "react";

/**
 * Microsoft Fluent Emoji (3D), served by this site at /emoji/<code points>.webp.
 * Falls back to the device's own emoji if there's no image for it.
 */

const EMOJI = /\p{Extended_Pictographic}|\p{Regional_Indicator}|⃣/u;

/** "👍" → "1f44d", "❤️" → "2764-fe0f". */
export function emojiCode(emoji: string) {
  return [...emoji].map((char) => char.codePointAt(0)!.toString(16)).join("-");
}

export function FluentEmoji({
  emoji,
  className = "h-[1.25em] w-[1.25em]",
  lazy = true,
}: {
  emoji: string;
  className?: string;
  lazy?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) return <span className="fluent-fallback">{emoji}</span>;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- tiny static images; next/image adds nothing here
    <img
      src={`/emoji/${emojiCode(emoji)}.webp`}
      alt={emoji}
      draggable={false}
      loading={lazy ? "lazy" : "eager"}
      decoding="async"
      onError={() => setFailed(true)}
      className={`inline-block select-text align-[-0.25em] ${className}`}
    />
  );
}

const segmenter =
  typeof Intl !== "undefined" && "Segmenter" in Intl ? new Intl.Segmenter(undefined, { granularity: "grapheme" }) : null;

/** Splits text into plain runs and single emoji (whole graphemes, so 👨‍👩‍👧 and 🇮🇳 stay together). */
export function splitEmoji(text: string): Array<{ emoji: boolean; value: string }> {
  if (!segmenter || !EMOJI.test(text)) return [{ emoji: false, value: text }];
  const parts: Array<{ emoji: boolean; value: string }> = [];
  for (const { segment } of segmenter.segment(text)) {
    const emoji = EMOJI.test(segment) && !/^[0-9#*]$/.test(segment);
    const last = parts[parts.length - 1];
    if (!emoji && last && !last.emoji) last.value += segment;
    else parts.push({ emoji, value: segment });
  }
  return parts;
}

/** A message that is just 1–3 emoji is shown big, like other chat apps. */
export function isJumboEmoji(text: string) {
  const parts = splitEmoji(text.trim()).filter((part) => part.emoji || part.value.trim());
  return parts.length > 0 && parts.length <= 3 && parts.every((part) => part.emoji);
}

/** Text with its emoji drawn as Fluent emoji. */
export function EmojiText({ text, size }: { text: string; size?: string }) {
  return (
    <>
      {splitEmoji(text).map((part, index) =>
        part.emoji ? (
          <FluentEmoji key={index} emoji={part.value} className={size} />
        ) : (
          <Fragment key={index}>{part.value}</Fragment>
        ),
      )}
    </>
  );
}
