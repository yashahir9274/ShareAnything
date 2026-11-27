/** GIFs in chat (from GIPHY). Shared by client and server. */

export type GifResult = { id: string; title: string; width: number; height: number };

/** A GIF sent in a chat message. Only the id is trusted; URLs are always built from it. */
export type ChatGif = GifResult;

export const GIF_ID_PATTERN = /^[A-Za-z0-9]{5,40}$/;

/** Small animated preview for the picker. */
export const gifPreviewUrl = (id: string) => `https://media.giphy.com/media/${id}/200w.webp`;
/** Video version for messages (much smaller than .gif). */
export const gifVideoUrl = (id: string) => `https://media.giphy.com/media/${id}/giphy.mp4`;
/** Still frame, shown while the video loads. */
export const gifStillUrl = (id: string) => `https://media.giphy.com/media/${id}/200w_s.gif`;

/** Accepts a GIF sent with a message, or null if it isn't valid. */
export function cleanGif(input: unknown): ChatGif | null {
  if (!input || typeof input !== "object") return null;
  const { id, title, width, height } = input as Record<string, unknown>;
  if (typeof id !== "string" || !GIF_ID_PATTERN.test(id)) return null;
  const w = Math.round(Number(width));
  const h = Math.round(Number(height));
  return {
    id,
    title: typeof title === "string" ? title.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 100) : "",
    width: w >= 16 && w <= 4000 ? w : 200,
    height: h >= 16 && h <= 4000 ? h : 200,
  };
}
