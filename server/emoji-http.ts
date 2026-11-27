import { createReadStream, readdirSync } from "fs";
import type { IncomingMessage, ServerResponse } from "http";
import path from "path";

/**
 * Microsoft Fluent Emoji (3D style, MIT — see THIRD-PARTY-NOTICES.md), served from this
 * server so visitors never load images from a third-party CDN.
 *
 *   GET /emoji/1f44d.webp → 👍
 *
 * Names are an emoji's code points in hex, joined by "-". The variation selector (fe0f)
 * is optional: "2764.webp" and "2764-fe0f.webp" both give ❤️.
 */

const ASSETS = path.join(process.cwd(), "node_modules", "@lobehub", "fluent-emoji-3d", "assets");
const REQUEST = /^\/emoji\/([0-9a-f]{2,6}(?:-[0-9a-f]{2,6}){0,9})\.webp$/;

const normalize = (key: string) =>
  key
    .split("-")
    .filter((part) => part !== "fe0f")
    .join("-");

let index: Map<string, string> | null = null;

function files() {
  if (!index) {
    index = new Map();
    try {
      for (const name of readdirSync(ASSETS)) {
        if (name.endsWith(".webp")) index.set(normalize(name.slice(0, -5)), name);
      }
    } catch (error) {
      console.warn("Fluent emoji not available:", (error as Error).message);
    }
  }
  return index;
}

/** Handles /emoji/*.webp; returns false for anything else. */
export function handleEmojiRequest(req: IncomingMessage, res: ServerResponse): boolean {
  if (!req.url?.startsWith("/emoji/")) return false;
  const match = REQUEST.exec(req.url.split("?")[0]);
  const file = match ? files().get(normalize(match[1])) : undefined;
  if (!file || (req.method !== "GET" && req.method !== "HEAD")) {
    res.writeHead(404, { "Content-Type": "text/plain", "Cache-Control": "public, max-age=3600" });
    res.end("Not found");
    return true;
  }
  res.writeHead(200, {
    "Content-Type": "image/webp",
    // The artwork for a code point never changes.
    "Cache-Control": "public, max-age=31536000, immutable",
    "X-Content-Type-Options": "nosniff",
  });
  if (req.method === "HEAD") {
    res.end();
    return true;
  }
  createReadStream(path.join(ASSETS, file))
    .on("error", () => res.destroy())
    .pipe(res);
  return true;
}
