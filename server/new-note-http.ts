import type { IncomingMessage, ServerResponse } from "http";
import { allocateNoteId } from "./note-store";

/**
 * The only two ways a new note id is created — both on the server, both
 * guaranteed not to land on an existing note:
 *   GET  /               → 307 redirect to a fresh note
 *   POST /api/notes/new  → { id } (used by the "New" button)
 */
export function handleNewNoteRequest(req: IncomingMessage, res: ServerResponse): boolean {
  const pathname = new URL(req.url ?? "/", "http://local").pathname;
  const isRoot = pathname === "/" && (req.method === "GET" || req.method === "HEAD");
  const isApi = pathname === "/api/notes/new" && req.method === "POST";
  if (!isRoot && !isApi) return false;

  allocateNoteId()
    .then((id) => {
      if (isRoot) {
        res.writeHead(307, { Location: `/${id}`, "Cache-Control": "no-store" });
        res.end();
        return;
      }
      const body = JSON.stringify({ id });
      res.writeHead(201, {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Length": Buffer.byteLength(body),
        "Cache-Control": "no-store",
      });
      res.end(body);
    })
    .catch((error) => {
      console.error("Could not create a note id", error);
      res.writeHead(503, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
      res.end("Could not create a new note, please try again.");
    });
  return true;
}
