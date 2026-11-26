"use client";

import { NewNoteLink } from "@/components/new-note-link";
import { Brand } from "@/components/logo";
import { useEffect, useState } from "react";
import { fileRawUrl, formatBytes, type NoteFile } from "@/lib/files";
import { kindLabel } from "./file-icon";
import { FilePreview } from "./file-preview";
import { ShareDialog } from "./share-dialog";

type State = { status: "loading" } | { status: "missing" } | { status: "ready"; file: NoteFile };

/** Public page for a single shared file: preview, download, share onward. */
export function SharedFileView({ fileId }: { fileId: string }) {
  const [state, setState] = useState<State>({ status: "loading" });
  const [shareOpen, setShareOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/files/${fileId}`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const file = (await response.json()) as NoteFile;
        if (!cancelled) {
          setState({ status: "ready", file });
          document.title = `${file.name} — ShareAnything`;
        }
      })
      .catch(() => {
        if (!cancelled) setState({ status: "missing" });
      });
    return () => {
      cancelled = true;
    };
  }, [fileId]);

  return (
    <div className="app-frame atmosphere relative flex flex-col">
      <header className="mx-auto flex w-full max-w-6xl shrink-0 items-center justify-between gap-4 px-5 pb-3 pt-4 sm:px-8 sm:pt-5 animate-fade-up">
        <NewNoteLink className="group min-w-0">
          <Brand tagline="A file was shared with you." />
        </NewNoteLink>
        <NewNoteLink
          className="inline-flex h-10 shrink-0 items-center rounded-full border border-line bg-white/85 px-4 text-sm font-medium text-ink transition hover:border-ink/20 hover:bg-white"
        >
          Share your own
        </NewNoteLink>
      </header>

      <main className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col px-3 pb-3 sm:px-8 sm:pb-4 animate-fade-up-delay">
        <section className="editor-shell paper-grain flex min-h-0 flex-1 flex-col overflow-hidden rounded-[24px] border border-line bg-paper-elevated sm:rounded-[28px]">
          {state.status === "loading" ? (
            <p className="m-auto font-display text-xl text-ink-muted animate-soft-pulse">Loading…</p>
          ) : state.status === "missing" ? (
            <div className="m-auto max-w-sm p-6 text-center">
              <p className="font-display text-2xl text-ink">This file isn’t available</p>
              <p className="mt-2 text-sm text-ink-muted">
                The link may be wrong, or the file was deleted by the person who shared it.
              </p>
            </div>
          ) : (
            <>
              <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-line/80 px-4 py-3 sm:px-6">
                <div className="min-w-0">
                  <h1 className="truncate font-display text-xl text-ink sm:text-2xl" title={state.file.name}>
                    {state.file.name}
                  </h1>
                  <p className="text-xs text-ink-muted">
                    {kindLabel(state.file.kind)} · {formatBytes(state.file.size)} · shared{" "}
                    {new Date(state.file.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={() => setShareOpen(true)}
                    className="inline-flex h-10 items-center rounded-full border border-line bg-white px-4 text-sm font-medium text-ink transition hover:border-ink/20"
                  >
                    Share
                  </button>
                  <a
                    href={fileRawUrl(state.file.id, true)}
                    className="inline-flex h-10 items-center rounded-full bg-accent px-4 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(255,92,53,0.25)] transition hover:brightness-105"
                  >
                    Download
                  </a>
                </div>
              </div>
              <div className="min-h-0 flex-1 p-3 sm:p-5">
                <FilePreview file={state.file} />
              </div>
            </>
          )}
        </section>
      </main>

      {shareOpen && state.status === "ready" ? (
        <ShareDialog file={state.file} onClose={() => setShareOpen(false)} />
      ) : null}
    </div>
  );
}
