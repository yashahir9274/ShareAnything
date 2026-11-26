"use client";

import { useEffect } from "react";
import { NoteShell } from "@/components/note-shell";
import { requestNewNoteId } from "@/lib/new-note";

/**
 * Normally never rendered: the server answers "/" with a redirect to a fresh,
 * unused note id (server/new-note-http.ts). This is only a fallback, and it
 * still gets its id from the server.
 */
export default function Home() {
  useEffect(() => {
    requestNewNoteId()
      .then((id) => window.location.replace(`/${id}`))
      .catch(() => {});
  }, []);

  return <NoteShell />;
}
