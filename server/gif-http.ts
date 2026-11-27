import type { IncomingMessage, ServerResponse } from "http";
import { GIF_ID_PATTERN, type GifResult } from "../src/lib/gifs";

/**
 * GIF search for the chat's GIF tab, via GIPHY. The API key stays on the server.
 *
 *   GET /api/gifs/status            → { enabled }
 *   GET /api/gifs?q=cat&offset=0    → { results: GifResult[], next: number | null }
 *   (no q → trending)
 *
 * Env: GIPHY_API_KEY (required for GIFs), GIF_RATING (g | pg | pg-13 | r; default "r",
 * GIPHY's least filtered level), GIPHY_API_BASE (tests only).
 */

const PAGE = 24;
const CACHE_MS = 5 * 60 * 1000;
const CACHE_MAX = 300;
const RATINGS = new Set(["g", "pg", "pg-13", "r"]);

const cache = new Map<string, { at: number; body: string }>();
const hits = new Map<string, number[]>();

function apiKey() {
  return process.env.GIPHY_API_KEY?.trim() || "";
}

function send(res: ServerResponse, status: number, data: unknown, cacheSeconds = 0) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": cacheSeconds ? `public, max-age=${cacheSeconds}` : "no-store",
  });
  res.end(body);
}

/** 60 searches a minute per visitor, so nobody can burn through the API quota. */
function allowed(req: IncomingMessage) {
  const forwarded = process.env.TRUST_PROXY === "1" ? String(req.headers["x-forwarded-for"] ?? "").split(",")[0].trim() : "";
  const who = forwarded || req.socket.remoteAddress || "?";
  const now = Date.now();
  const recent = (hits.get(who) ?? []).filter((at) => now - at < 60_000);
  if (recent.length >= 60) return false;
  recent.push(now);
  hits.set(who, recent);
  if (hits.size > 5000) hits.clear();
  return true;
}

type GiphyItem = {
  id?: string;
  title?: string;
  images?: { fixed_width?: { width?: string; height?: string }; original?: { width?: string; height?: string } };
};

function toResult(item: GiphyItem): GifResult | null {
  if (typeof item.id !== "string" || !GIF_ID_PATTERN.test(item.id)) return null;
  const size = item.images?.fixed_width ?? item.images?.original;
  const width = Number(size?.width) || 200;
  const height = Number(size?.height) || 200;
  return { id: item.id, title: String(item.title ?? "").slice(0, 100), width, height };
}

export function handleGifRequest(req: IncomingMessage, res: ServerResponse): boolean {
  const url = new URL(req.url ?? "/", "http://local");
  if (url.pathname !== "/api/gifs" && url.pathname !== "/api/gifs/status") return false;
  if (req.method !== "GET") {
    send(res, 405, { error: "Method not allowed" });
    return true;
  }
  if (url.pathname === "/api/gifs/status") {
    send(res, 200, { enabled: Boolean(apiKey()) });
    return true;
  }
  if (!apiKey()) {
    send(res, 503, { error: "GIFs aren’t set up on this server yet." });
    return true;
  }
  if (!allowed(req)) {
    send(res, 429, { error: "Too many searches — try again in a minute." });
    return true;
  }

  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 50);
  const offset = Math.min(Math.max(0, Number(url.searchParams.get("offset")) || 0), 4975);
  const rating = RATINGS.has(process.env.GIF_RATING ?? "") ? process.env.GIF_RATING! : "r";
  const key = `${q.toLowerCase()}|${offset}|${rating}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=300" });
    res.end(hit.body);
    return true;
  }

  const base = process.env.GIPHY_API_BASE || "https://api.giphy.com/v1/gifs";
  const params = new URLSearchParams({ api_key: apiKey(), limit: String(PAGE), offset: String(offset), rating, bundle: "messaging_non_clips" });
  if (q) params.set("q", q);
  const endpoint = `${base}/${q ? "search" : "trending"}?${params}`;

  fetch(endpoint, { signal: AbortSignal.timeout(8000) })
    .then(async (response) => {
      if (!response.ok) throw new Error(`GIPHY ${response.status}`);
      const json = (await response.json()) as { data?: GiphyItem[]; pagination?: { total_count?: number; count?: number } };
      const results = (json.data ?? []).map(toResult).filter((r): r is GifResult => Boolean(r));
      const total = json.pagination?.total_count ?? 0;
      const nextOffset = offset + (json.pagination?.count ?? results.length);
      const body = JSON.stringify({ results, next: results.length && nextOffset < total ? nextOffset : null });
      if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
      cache.set(key, { at: Date.now(), body });
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=300" });
      res.end(body);
    })
    .catch((error) => {
      console.warn("GIF search failed:", (error as Error).message);
      send(res, 502, { error: "Couldn’t load GIFs right now." });
    });
  return true;
}
