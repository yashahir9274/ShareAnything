/** Media types accepted by /api/uploads, with the extension each is stored under. SVG is excluded (it can run script). */
export const UPLOAD_TYPES: Record<string, { ext: string; kind: "image" | "video" }> = {
  "image/png": { ext: "png", kind: "image" },
  "image/jpeg": { ext: "jpg", kind: "image" },
  "image/gif": { ext: "gif", kind: "image" },
  "image/webp": { ext: "webp", kind: "image" },
  "image/avif": { ext: "avif", kind: "image" },
  "video/mp4": { ext: "mp4", kind: "video" },
  "video/webm": { ext: "webm", kind: "video" },
  "video/ogg": { ext: "ogv", kind: "video" },
};

export const UPLOAD_MAX_BYTES = {
  image: 10 * 1024 * 1024,
  video: 50 * 1024 * 1024,
} as const;

export const UPLOAD_NAME_PATTERN = /^[a-f0-9]{32}\.(png|jpg|gif|webp|avif|mp4|webm|ogv)$/;

export const UPLOAD_EXT_TYPES: Record<string, string> = Object.fromEntries(
  Object.entries(UPLOAD_TYPES).map(([type, { ext }]) => [ext, type]),
);

/** Only http(s) URLs or our own upload paths may be embedded as media. */
export function isSafeMediaUrl(url: string): boolean {
  if (url.startsWith("/api/uploads/") || /^\/api\/files\/[a-f0-9]{32}\/raw$/.test(url)) return true;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}
