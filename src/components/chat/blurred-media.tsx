"use client";

import { useState, type CSSProperties, type ReactNode } from "react";

function EyeIcon({ off = false }: { off?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
      {off ? <path d="m3 3 18 18" /> : null}
    </svg>
  );
}

/**
 * Photos, videos and GIFs in chat start blurred, so nobody gets surprised by what
 * someone else sent. Click to show; click again to blur it back. Hover shows a
 * Show/Hide button (and "Open" for the full preview once it's visible).
 */
export function BlurredMedia({
  label,
  children,
  onOpen,
  className = "",
  style,
}: {
  /** e.g. "GIF" or the file name — used for the button labels. */
  label: string;
  children: ReactNode;
  /** Full-size preview (only offered once revealed). */
  onOpen?: () => void;
  className?: string;
  style?: CSSProperties;
}) {
  const [revealed, setRevealed] = useState(false);
  const toggle = () => setRevealed((value) => !value);

  return (
    <div className={`group/blur relative overflow-hidden ${className}`} style={style}>
      <div
        className={`h-full w-full transition duration-300 ${revealed ? "" : "scale-110 blur-2xl brightness-75 saturate-50"}`}
        aria-hidden={!revealed}
      >
        {children}
      </div>

      {/* The whole picture is the toggle. */}
      <button
        type="button"
        onClick={toggle}
        aria-pressed={revealed}
        aria-label={revealed ? `Blur ${label} again` : `Show ${label}`}
        title={revealed ? "Click to blur again" : "Click to view"}
        className="absolute inset-0 flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
      >
        {revealed ? null : (
          <span className="flex items-center gap-1.5 rounded-full bg-black/55 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-sm">
            <EyeIcon />
            Click to view
          </span>
        )}
      </button>

      {/* Hover (always on touch screens): Show/Hide, and Open once visible. */}
      <div className="pointer-events-none absolute right-1.5 top-1.5 flex gap-1 opacity-0 transition group-hover/blur:pointer-events-auto group-hover/blur:opacity-100 group-focus-within/blur:pointer-events-auto group-focus-within/blur:opacity-100 [@media(hover:none)]:pointer-events-auto [@media(hover:none)]:opacity-100">
        <button
          type="button"
          onClick={toggle}
          className="flex items-center gap-1 rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur-sm transition hover:bg-black/75"
        >
          <EyeIcon off={revealed} />
          {revealed ? "Hide" : "Show"}
        </button>
        {revealed && onOpen ? (
          <button
            type="button"
            onClick={onOpen}
            className="flex items-center gap-1 rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur-sm transition hover:bg-black/75"
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
            </svg>
            Open
          </button>
        ) : null}
      </div>
    </div>
  );
}
