import { createReadStream, promises as fs } from "fs";
import type { IncomingMessage, ServerResponse } from "http";
import { isValidFileId, type FileKind } from "../src/lib/files";
import { isValidNoteId } from "../src/lib/note-types";
import { cleanUser } from "../src/lib/chat";
import { FileError, fileBlobPath, getFile, saveUpload } from "./file-store";
import { checkNoteAccess } from "./note-store";

/**
 * HTTP endpoints for the media manager, handled before Next.js:
 *   PUT /api/notes/:noteId/files      upload (raw body, streamed to disk)
 *   GET /api/files/:fileId            public metadata for a share link
 *   GET /api/files/:fileId/raw        the file (?download=1 forces a download)
 */

const UPLOAD_ROUTE = /^\/api\/notes\/([A-Za-z0-9_-]{1,64})\/files\/?$/;
const META_ROUTE = /^\/api\/files\/([a-f0-9]{32})\/?$/;
const RAW_ROUTE = /^\/api\/files\/([a-f0-9]{32})\/raw\/?$/;

/** Kinds a browser may display inline. Everything else is served as a download. */
const INLINE_KINDS = new Set<FileKind>(["image", "video", "audio", "pdf", "code", "text"]);

function sendJson(res: ServerResponse, status: number, body: unknown) {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(json),
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(json);
}

function contentDisposition(type: "inline" | "attachment", name: string) {
  const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

async function handleUpload(req: IncomingMessage, res: ServerResponse, noteId: string) {
  if (req.method !== "PUT" && req.method !== "POST") {
    return sendJson(res, 405, { error: "Method not allowed" });
  }
  // Uploads come from our own page; refuse cross-site form posts.
  const origin = req.headers.origin;
  const originHost = (() => {
    try {
      return origin ? new URL(origin).host : null;
    } catch {
      return "invalid";
    }
  })();
  if (origin && originHost !== req.headers.host) {
    return sendJson(res, 403, { error: "Cross-origin upload refused" });
  }
  if (!(await checkNoteAccess(noteId, req.headers["x-note-token"]))) {
    return sendJson(res, 403, { error: "This note is locked" });
  }

  let name = "file";
  try {
    name = decodeURIComponent(String(req.headers["x-file-name"] ?? "file"));
  } catch {
    // keep default
  }
  // Who uploaded it (the name they chose for chat); optional and cleaned like chat names.
  let uploader: { id: string; name: string } | null = null;
  try {
    const user = cleanUser({
      id: String(req.headers["x-user-id"] ?? ""),
      name: decodeURIComponent(String(req.headers["x-user-name"] ?? "")),
    });
    if (user) uploader = { id: user.id, name: user.name };
  } catch {
    // bad encoding: upload anonymously
  }

  try {
    const file = await saveUpload({
      noteId,
      uploader,
      viaChat: req.headers["x-upload-source"] === "chat",
      name,
      mime: String(req.headers["content-type"] ?? ""),
      declaredSize: Number(req.headers["content-length"] ?? 0),
      body: req,
    });
    sendJson(res, 201, file);
  } catch (error) {
    if (error instanceof FileError) {
      res.setHeader("Connection", "close"); // don't keep reading a rejected body
      return sendJson(res, error.status, { error: error.message });
    }
    throw error;
  }
}

async function handleMeta(res: ServerResponse, fileId: string) {
  const file = await getFile(fileId);
  if (!file) return sendJson(res, 404, { error: "File not found" });
  // Never reveal which note a file belongs to: the note link would open the note.
  const { id, name, mime, size, kind, createdAt, uploadedBy } = file;
  sendJson(res, 200, { id, name, mime, size, kind, createdAt, ...(uploadedBy ? { uploadedBy } : {}) });
}

async function handleRaw(req: IncomingMessage, res: ServerResponse, fileId: string, download: boolean) {
  const file = await getFile(fileId);
  let size: number;
  try {
    if (!file) throw new Error();
    size = (await fs.stat(fileBlobPath(fileId))).size;
  } catch {
    return sendJson(res, 404, { error: "File not found" });
  }

  const inline = !download && INLINE_KINDS.has(file.kind);
  const textLike = file.kind === "code" || file.kind === "text";
  const headers: Record<string, string> = {
    // Code and text are always plain text, so an uploaded .html can't run as a page here.
    "Content-Type": !inline
      ? "application/octet-stream"
      : textLike
        ? "text/plain; charset=utf-8"
        : file.mime,
    "Content-Disposition": contentDisposition(inline ? "inline" : "attachment", file.name),
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "public, max-age=3600",
    "Accept-Ranges": "bytes",
    "Cross-Origin-Resource-Policy": "same-site",
  };
  // Block scripts if someone opens e.g. an SVG directly. (PDF viewers need to run, so skip it there.)
  if (file.kind !== "pdf") headers["Content-Security-Policy"] = "default-src 'none'; style-src 'unsafe-inline'; sandbox";

  const range = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range ?? ""));
  if (range && (range[1] || range[2]) && size > 0) {
    let start = range[1] ? Number(range[1]) : size - Number(range[2]);
    let end = range[1] && range[2] ? Number(range[2]) : size - 1;
    start = Math.max(0, start);
    end = Math.min(end, size - 1);
    if (start > end) {
      res.writeHead(416, { ...headers, "Content-Range": `bytes */${size}` });
      return res.end();
    }
    res.writeHead(206, {
      ...headers,
      "Content-Range": `bytes ${start}-${end}/${size}`,
      "Content-Length": String(end - start + 1),
    });
    if (req.method === "HEAD") return res.end();
    createReadStream(fileBlobPath(fileId), { start, end }).pipe(res);
    return;
  }

  res.writeHead(200, { ...headers, "Content-Length": String(size) });
  if (req.method === "HEAD") return res.end();
  createReadStream(fileBlobPath(fileId)).pipe(res);
}

/** Returns true if the request was handled here. */
export function handleFileRequest(req: IncomingMessage, res: ServerResponse): boolean {
  const url = new URL(req.url ?? "/", "http://local");
  const upload = UPLOAD_ROUTE.exec(url.pathname);
  const meta = META_ROUTE.exec(url.pathname);
  const raw = RAW_ROUTE.exec(url.pathname);
  if (!upload && !meta && !raw) return false;

  const run = async () => {
    if (upload) {
      if (!isValidNoteId(upload[1])) return sendJson(res, 400, { error: "Invalid note id" });
      return handleUpload(req, res, upload[1]);
    }
    if (req.method !== "GET" && req.method !== "HEAD") return sendJson(res, 405, { error: "Method not allowed" });
    const fileId = (meta ?? raw)![1];
    if (!isValidFileId(fileId)) return sendJson(res, 404, { error: "File not found" });
    if (meta) return handleMeta(res, fileId);
    return handleRaw(req, res, fileId, url.searchParams.get("download") === "1");
  };

  run().catch((error) => {
    console.error("File request failed", error);
    if (!res.headersSent) sendJson(res, 500, { error: "Something went wrong" });
    else res.destroy();
  });
  return true;
}
