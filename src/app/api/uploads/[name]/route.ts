import { createReadStream, promises as fs } from "fs";
import path from "path";
import { Readable } from "stream";
import { UPLOAD_EXT_TYPES, UPLOAD_NAME_PATTERN } from "@/lib/upload-rules";

const UPLOAD_DIR = path.join(process.cwd(), ".data", "uploads");

export async function GET(request: Request, context: RouteContext<"/api/uploads/[name]">) {
  const { name } = await context.params;
  if (!UPLOAD_NAME_PATTERN.test(name)) {
    return new Response("Not found", { status: 404 });
  }

  const filePath = path.join(UPLOAD_DIR, name);
  let size: number;
  try {
    size = (await fs.stat(filePath)).size;
  } catch {
    return new Response("Not found", { status: 404 });
  }

  const headers = new Headers({
    "Content-Type": UPLOAD_EXT_TYPES[name.split(".").pop()!] ?? "application/octet-stream",
    "Cache-Control": "public, max-age=31536000, immutable",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox",
    "Accept-Ranges": "bytes",
  });

  // Range requests let browsers seek in uploaded videos.
  const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get("range") ?? "");
  if (range && (range[1] || range[2])) {
    let start = range[1] ? Number(range[1]) : size - Number(range[2]);
    let end = range[1] && range[2] ? Number(range[2]) : size - 1;
    start = Math.max(0, start);
    end = Math.min(end, size - 1);
    if (start > end) {
      headers.set("Content-Range", `bytes */${size}`);
      return new Response(null, { status: 416, headers });
    }
    headers.set("Content-Range", `bytes ${start}-${end}/${size}`);
    headers.set("Content-Length", String(end - start + 1));
    const stream = Readable.toWeb(createReadStream(filePath, { start, end })) as ReadableStream;
    return new Response(stream, { status: 206, headers });
  }

  headers.set("Content-Length", String(size));
  const stream = Readable.toWeb(createReadStream(filePath)) as ReadableStream;
  return new Response(stream, { status: 200, headers });
}
