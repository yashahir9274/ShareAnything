import { isValidNoteId } from "@/lib/note-types";

/**
 * Asks the server for a brand-new note id. Ids are never made up in the
 * browser, so a new note can never land on an existing one.
 */
export async function requestNewNoteId(): Promise<string> {
  const response = await fetch("/api/notes/new", { method: "POST", cache: "no-store" });
  const body = (await response.json().catch(() => ({}))) as { id?: unknown };
  if (!response.ok || !isValidNoteId(body.id)) throw new Error("Could not create a new note");
  return body.id;
}
