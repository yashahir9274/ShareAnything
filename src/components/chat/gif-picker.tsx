"use client";

import { useEffect, useRef, useState } from "react";
import { gifPreviewUrl, gifStillUrl, gifVideoUrl, type GifResult } from "@/lib/gifs";

/** Quick searches shown above the results. */
const TOPICS = ["Haha", "Love", "Yes", "No", "Wow", "Thanks", "Party", "Sad", "Hi", "OK", "Dance", "Facepalm"];

let enabledCache: Promise<boolean> | null = null;
function gifsEnabled() {
  enabledCache ??= fetch("/api/gifs/status")
    .then((r) => r.json() as Promise<{ enabled?: boolean }>)
    .then((d) => Boolean(d.enabled))
    .catch(() => false);
  return enabledCache;
}

type Page = { results: GifResult[]; next: number | null };

async function loadGifs(query: string, offset: number): Promise<Page> {
  const params = new URLSearchParams({ offset: String(offset) });
  if (query) params.set("q", query);
  const response = await fetch(`/api/gifs?${params}`);
  const data = (await response.json().catch(() => ({}))) as Partial<Page> & { error?: string };
  if (!response.ok) throw new Error(data.error || "Couldn’t load GIFs");
  return { results: data.results ?? [], next: data.next ?? null };
}

/** The GIFs tab: trending, search as you type, endless scroll. Clicking a GIF sends it. */
export function GifPicker({ onPick, autoFocus = true }: { onPick: (gif: GifResult) => void; autoFocus?: boolean }) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [attempt, setAttempt] = useState(0);
  /** Results, and which search (+ attempt) they belong to. */
  const [page, setPage] = useState<{ key: string; items: GifResult[]; next: number | null; error: string }>({
    key: "",
    items: [],
    next: 0,
    error: "",
  });
  const [loadingMore, setLoadingMore] = useState(false);
  const key = `${search}|${attempt}`;
  const items = page.items;
  const next = page.next;
  const error = page.error;
  const loading = (Boolean(enabled) && page.key !== key) || loadingMore;
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const request = useRef(0);

  useEffect(() => {
    let alive = true;
    void gifsEnabled().then((value) => alive && setEnabled(value));
    if (autoFocus) inputRef.current?.focus();
    return () => {
      alive = false;
    };
  }, [autoFocus]);

  // Debounce typing → search.
  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(query.trim()), 350);
    return () => window.clearTimeout(timer);
  }, [query]);

  // New search: first page.
  useEffect(() => {
    if (!enabled) return;
    const id = (request.current += 1);
    loadGifs(search, 0)
      .then((result) => {
        if (id !== request.current) return;
        setPage({ key, items: result.results, next: result.next, error: "" });
        scrollRef.current?.scrollTo({ top: 0 });
      })
      .catch((problem: Error) => {
        if (id === request.current) setPage({ key, items: [], next: null, error: problem.message });
      });
  }, [search, enabled, key]);

  function loadMore() {
    if (loading || next === null || !enabled) return;
    const id = request.current;
    setLoadingMore(true);
    loadGifs(search, next)
      .then((result) => {
        if (id !== request.current) return;
        setPage((current) => {
          const seen = new Set(current.items.map((g) => g.id));
          return { ...current, items: [...current.items, ...result.results.filter((g) => !seen.has(g.id))], next: result.next };
        });
      })
      .catch((problem: Error) => setPage((current) => ({ ...current, next: null, error: problem.message })))
      .finally(() => setLoadingMore(false));
  }

  if (enabled === false) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
        <span className="text-3xl" aria-hidden>
          🎞️
        </span>
        <p className="text-sm font-semibold text-ink">GIFs aren’t set up yet</p>
        <p className="text-xs leading-5 text-ink-muted">
          The site owner needs to add a free GIPHY API key (GIPHY_API_KEY) on the server.
        </p>
      </div>
    );
  }

  // Two columns, each filled in order, so GIFs of different heights pack neatly.
  const columns: GifResult[][] = [[], []];
  const heights = [0, 0];
  for (const gif of items) {
    const col = heights[0] <= heights[1] ? 0 : 1;
    columns[col].push(gif);
    heights[col] += gif.height / gif.width;
  }

  return (
    <>
      <div className="shrink-0 space-y-2 border-b border-line/80 p-2">
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              setSearch(query.trim());
            }
          }}
          placeholder="Search GIPHY"
          aria-label="Search GIFs"
          className="w-full rounded-xl border border-line bg-paper-elevated px-3 py-2 text-sm text-ink outline-none focus:border-accent"
        />
        <div className="toolbar-row flex gap-1 overflow-x-auto">
          {TOPICS.map((topic) => (
            <button
              key={topic}
              type="button"
              onClick={() => setQuery(topic)}
              className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                search.toLowerCase() === topic.toLowerCase()
                  ? "border-accent bg-accent-soft text-ink"
                  : "border-line text-ink-muted hover:border-ink/25 hover:text-ink"
              }`}
            >
              {topic}
            </button>
          ))}
        </div>
      </div>

      <div
        ref={scrollRef}
        onScroll={(event) => {
          const el = event.currentTarget;
          if (el.scrollHeight - el.scrollTop - el.clientHeight < 300) loadMore();
        }}
        className="editor-scroll min-h-0 flex-1 overflow-y-auto p-2"
      >
        {!search && items.length ? (
          <p className="px-1 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-muted">Trending</p>
        ) : null}
        {error ? (
          <div className="py-8 text-center">
            <p className="text-sm text-ink-muted">{error}</p>
            <button
              type="button"
              onClick={() => setAttempt((n) => n + 1)}
              className="mt-2 rounded-full border border-line px-3 py-1 text-xs font-medium text-ink transition hover:border-ink/25"
            >
              Try again
            </button>
          </div>
        ) : items.length ? (
          <div className="flex gap-1.5">
            {columns.map((column, index) => (
              <div key={index} className="flex min-w-0 flex-1 flex-col gap-1.5">
                {column.map((gif) => (
                  <button
                    key={gif.id}
                    type="button"
                    title={gif.title || "Send GIF"}
                    aria-label={`Send GIF${gif.title ? `: ${gif.title}` : ""}`}
                    onClick={() => onPick(gif)}
                    className="group relative block w-full overflow-hidden rounded-xl bg-paper transition focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    style={{ aspectRatio: `${gif.width} / ${gif.height}` }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- animated GIPHY previews */}
                    <img
                      src={gifPreviewUrl(gif.id)}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="h-full w-full object-cover transition group-hover:scale-[1.04]"
                    />
                  </button>
                ))}
              </div>
            ))}
          </div>
        ) : !loading ? (
          <p className="py-8 text-center text-sm text-ink-muted">{search ? `No GIFs for “${search}”` : "No GIFs"}</p>
        ) : null}
        {loading ? <p className="py-3 text-center text-xs text-ink-muted">Loading GIFs…</p> : null}
      </div>

      <div className="flex shrink-0 items-center justify-end border-t border-line/80 px-3 py-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted">Powered by GIPHY</span>
      </div>
    </>
  );
}

/** A GIF in a message: a looping muted video that only plays while it's on screen. */
export function GifMessage({ gif, onOpen }: { gif: GifResult; onOpen?: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = videoRef.current;
    if (!video || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) void video.play().catch(() => {});
      else video.pause();
    });
    observer.observe(video);
    return () => observer.disconnect();
  }, []);
  const width = Math.min(260, gif.width);
  return (
    <button
      type="button"
      onClick={onOpen}
      title={gif.title || "GIF"}
      className="relative block overflow-hidden rounded-2xl border border-line bg-paper"
      style={{ width, aspectRatio: `${gif.width} / ${gif.height}`, maxWidth: "100%" }}
    >
      <video
        ref={videoRef}
        src={gifVideoUrl(gif.id)}
        poster={gifStillUrl(gif.id)}
        muted
        loop
        playsInline
        autoPlay
        preload="metadata"
        aria-label={gif.title || "GIF"}
        className="h-full w-full object-cover"
      />
      <span className="absolute bottom-1.5 left-1.5 rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-white">
        GIF
      </span>
    </button>
  );
}
