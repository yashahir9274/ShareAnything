"use client";

import { NewNoteLink } from "@/components/new-note-link";
import { useRouter } from "next/navigation";
import type { Editor } from "@tiptap/react";
import { useCallback, useEffect, useState, useTransition } from "react";
import { CheckIcon, LinkIcon, LockIcon, PlusIcon, TypeIcon } from "@/components/icons";
import { MediaManager } from "@/components/media/media-manager";
import { NoteShell } from "@/components/note-shell";
import { Brand } from "@/components/logo";
import { RichTextEditor, type EditorStats } from "@/components/rich-text-editor";
import { META_FIELD, TITLE_FIELD } from "@/lib/editor-extensions";
import { fileRawUrl, formatBytes, type NoteFile } from "@/lib/files";
import { requestNewNoteId } from "@/lib/new-note";
import { NOTE_LIMITS } from "@/lib/note-types";
import { useNoteFiles } from "@/lib/use-note-files";
import { setYText, useNoteSync, useYMapValue, useYText } from "@/lib/use-note-sync";

type View = "document" | "files";

function NavIcon({ view }: { view: View }) {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {view === "document" ? (
        <>
          <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
          <path d="M14 3v5h5M9 13h6M9 17h4" />
        </>
      ) : (
        <>
          <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <path d="M12 11v5m-2.5-2.5h5" />
        </>
      )}
    </svg>
  );
}

type NotepadProps = {
  noteId: string;
};

export function Notepad({ noteId }: NotepadProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const { doc, access, locked, connected, saveState, saveError, unlock, changePassword } =
    useNoteSync(noteId);

  const titleText = doc.getText(TITLE_FIELD);
  const meta = doc.getMap(META_FIELD);
  const title = useYText(titleText);
  const monospace = useYMapValue(meta, "monospace", false);

  const [stats, setStats] = useState<EditorStats>({ words: 0, chars: 0 });
  const [copied, setCopied] = useState(false);
  const [lockOpen, setLockOpen] = useState(false);
  const [passwordDraft, setPasswordDraft] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [unlockDraft, setUnlockDraft] = useState("");
  const [unlocking, setUnlocking] = useState(false);
  const [lockError, setLockError] = useState("");
  // #files in the URL opens the Files tab directly.
  const [view, setViewState] = useState<View>(() =>
    typeof window !== "undefined" && window.location.hash === "#files" ? "files" : "document",
  );
  const [editor, setEditor] = useState<Editor | null>(null);

  const filesState = useNoteFiles(noteId, access === "open", connected);
  const { upload } = filesState;

  const setView = useCallback((next: View) => {
    setViewState(next);
    const url = next === "files" ? "#files" : window.location.pathname + window.location.search;
    window.history.replaceState(window.history.state, "", url);
  }, []);

  useEffect(() => {
    function onHash() {
      setViewState(window.location.hash === "#files" ? "files" : "document");
    }
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  /** Images/videos added in the editor are stored in the note's Files. */
  const uploadFromEditor = useCallback(
    async (file: File) => {
      const [result] = await upload([{ file, name: file.name || "pasted-image.png" }]);
      if (!result || result instanceof Error) throw result ?? new Error("Upload failed");
      return fileRawUrl(result.id);
    },
    [upload],
  );

  function insertIntoDocument(file: NoteFile) {
    setView("document");
    if (!editor) return;
    const src = fileRawUrl(file.id);
    const chain = editor.chain().focus();
    if (file.kind === "image") chain.setImage({ src, alt: file.name }).run();
    else chain.setVideo({ src }).run();
  }

  async function copyShareLink() {
    const url = `${window.location.origin}/${noteId}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  async function createFreshNote() {
    try {
      const nextId = await requestNewNoteId();
      startTransition(() => {
        router.push(`/${nextId}`);
      });
    } catch {
      // The server redirect on "/" also hands out a unique id.
      router.push("/");
    }
  }

  async function updatePassword(password: string | null) {
    setPasswordError("");
    const error = await changePassword(password);
    if (error) {
      setPasswordError(error);
      return;
    }
    setPasswordDraft("");
    setLockOpen(false);
  }

  function applyPassword() {
    const password = passwordDraft.trim();
    if (password) void updatePassword(password);
  }

  function clearPassword() {
    void updatePassword(null);
  }

  async function attemptUnlock() {
    const password = unlockDraft.trim();
    if (!password || unlocking) return;
    setUnlocking(true);
    const error = await unlock(password);
    setUnlocking(false);
    if (error) {
      setLockError(error);
      return;
    }
    setUnlockDraft("");
    setLockError("");
  }

  const statusLabel = !connected
    ? "Connecting…"
    : saveState === "syncing"
      ? "Syncing…"
      : saveState === "error"
        ? saveError || "Sync failed"
        : "Live";

  if (access === "loading") {
    return (
      <NoteShell noteId={noteId} status={connected ? "Opening…" : "Connecting…"} />
    );
  }

  if (access === "locked") {
    return (
      <div className="atmosphere flex min-h-dvh items-center justify-center px-6">
        <div className="editor-shell paper-grain w-full max-w-md rounded-[28px] border border-line bg-paper-elevated p-8 animate-fade-up">
          <p className="font-display text-sm tracking-[0.18em] uppercase text-accent">
            ShareAnything
          </p>
          <h1 className="mt-3 font-display text-3xl leading-tight text-ink">
            This note is locked
          </h1>
          <p className="mt-2 text-sm leading-6 text-ink-muted">
            Enter the password to read or keep writing.
          </p>
          <label className="mt-6 block text-xs font-medium uppercase tracking-[0.14em] text-ink-muted">
            Password
            <input
              type="password"
              value={unlockDraft}
              onChange={(event) => setUnlockDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void attemptUnlock();
              }}
              className="mt-2 w-full rounded-2xl border border-line bg-white px-4 py-3 text-base text-ink outline-none transition focus:border-accent"
              autoFocus
            />
          </label>
          {lockError ? (
            <p className="mt-2 text-sm text-danger">{lockError}</p>
          ) : null}
          <button
            type="button"
            onClick={() => void attemptUnlock()}
            disabled={unlocking}
            className="mt-5 w-full rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-ink/90"
          >
            {unlocking ? "Checking…" : "Unlock note"}
          </button>
          <NewNoteLink
            className="mt-4 block text-center text-sm text-ink-muted transition hover:text-ink"
          >
            Start a new note instead
          </NewNoteLink>
        </div>
      </div>
    );
  }

  return (
    <div className="app-frame atmosphere relative flex flex-col">
      <header className="relative z-10 mx-auto flex w-full max-w-6xl shrink-0 items-center justify-between gap-4 px-5 pb-3 pt-4 sm:px-8 sm:pt-5">
        <NewNoteLink className="group min-w-0">
          <Brand tagline="Write together live. Share anything." />
        </NewNoteLink>

        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={() => void createFreshNote()}
            className="inline-flex h-10 items-center gap-2 rounded-full border border-line bg-white/85 px-3 text-sm font-medium text-ink transition hover:border-ink/20 hover:bg-white"
            aria-label="New note"
          >
            <PlusIcon className="h-4 w-4" />
            <span className="hidden sm:inline">New</span>
          </button>
          <button
            type="button"
            onClick={() => setLockOpen((open) => !open)}
            className={`inline-flex h-10 items-center gap-2 rounded-full border px-3 text-sm font-medium transition ${
              locked
                ? "border-teal/30 bg-teal-soft text-teal"
                : "border-line bg-white/85 text-ink hover:border-ink/20 hover:bg-white"
            }`}
            aria-label="Password protect"
          >
            <LockIcon className="h-4 w-4" />
            <span className="hidden sm:inline">
              {locked ? "Locked" : "Protect"}
            </span>
          </button>
          <button
            type="button"
            onClick={() => void copyShareLink()}
            aria-label="Copy share link"
            className="inline-flex h-10 items-center gap-2 rounded-full bg-accent px-3 text-sm sm:px-4 font-semibold text-white shadow-[0_10px_24px_rgba(255,92,53,0.28)] transition hover:brightness-105"
          >
            {copied ? <CheckIcon className="h-4 w-4" /> : <LinkIcon className="h-4 w-4" />}
            <span className="hidden min-[400px]:inline">{copied ? "Copied" : "Share"}</span>
          </button>
        </div>
      </header>

      <main className="relative z-10 mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col px-3 pb-3 sm:px-8 sm:pb-4">
        {lockOpen ? (
          <div className="mb-3 shrink-0 rounded-[24px] border border-line bg-white/95 p-4 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <label className="flex-1 text-xs font-medium uppercase tracking-[0.14em] text-ink-muted">
                Set a password
                <input
                  type="password"
                  value={passwordDraft}
                  onChange={(event) => setPasswordDraft(event.target.value)}
                  placeholder="Anyone with the link still needs this"
                  className="mt-2 w-full rounded-2xl border border-line bg-paper-elevated px-4 py-3 text-sm text-ink outline-none transition focus:border-accent"
                />
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={applyPassword}
                  className="rounded-full bg-ink px-4 py-3 text-sm font-semibold text-white"
                >
                  Save lock
                </button>
                {locked ? (
                  <button
                    type="button"
                    onClick={clearPassword}
                    className="rounded-full border border-line px-4 py-3 text-sm font-medium text-ink-muted hover:text-ink"
                  >
                    Remove
                  </button>
                ) : null}
              </div>
            </div>
            {passwordError ? (
              <p className="mt-2 text-sm text-danger">{passwordError}</p>
            ) : null}
          </div>
        ) : null}

        <div className="flex min-h-0 flex-1 flex-col gap-2.5 md:flex-row md:gap-4">
        <nav
          aria-label="Note sections"
          className="flex shrink-0 gap-1 rounded-[20px] border border-line bg-white/95 p-1 shadow-[0_10px_30px_rgba(11,20,32,0.06)] md:w-52 md:flex-col md:gap-1.5 md:rounded-[24px] md:p-2"
        >
          {(
            [
              { id: "document", label: "Document", hint: "Write together" },
              { id: "files", label: "Files", hint: "Share anything" },
            ] as const
          ).map((item) => {
            const selected = view === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setView(item.id)}
                aria-current={selected ? "page" : undefined}
                className={`flex flex-1 items-center gap-2.5 rounded-2xl px-3 py-2 text-left transition md:flex-none md:py-2.5 ${
                  selected ? "bg-ink text-white shadow-sm" : "text-ink-muted hover:bg-paper hover:text-ink"
                }`}
              >
                <NavIcon view={item.id} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">{item.label}</span>
                  <span className={`hidden text-[11px] md:block ${selected ? "text-white/60" : "text-ink/40"}`}>
                    {item.hint}
                  </span>
                </span>
                {item.id === "files" && filesState.files.length ? (
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ${
                      selected ? "bg-white/15 text-white" : "bg-accent-soft text-accent"
                    }`}
                  >
                    {filesState.files.length}
                  </span>
                ) : null}
              </button>
            );
          })}

          {filesState.usage ? (
            <div className="mt-auto hidden rounded-2xl bg-paper px-3 py-2.5 md:block">
              <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-muted">Storage</p>
              <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-line">
                <span
                  className="block h-full rounded-full bg-teal"
                  style={{
                    width: `${Math.min(100, Math.max(filesState.usage.used ? 1 : 0, (filesState.usage.used / filesState.usage.quota) * 100))}%`,
                  }}
                />
              </span>
              <p className="mt-1.5 text-[11px] tabular-nums text-ink-muted">
                {formatBytes(filesState.usage.used)} of {formatBytes(filesState.usage.quota)}
              </p>
            </div>
          ) : null}
        </nav>

        <section className="editor-shell paper-grain flex min-h-0 flex-1 flex-col overflow-hidden rounded-[24px] border border-line bg-paper-elevated sm:rounded-[28px]">
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-line/80 px-4 py-2.5 sm:px-7 sm:py-3">
            <div className="flex items-center gap-3 text-sm text-ink-muted">
              <span className="rounded-full bg-white px-3 py-1 font-mono text-xs text-ink">
                /{noteId}
              </span>
              <span className="inline-flex items-center gap-2">
                <span
                  className={`h-2 w-2 rounded-full ${
                    !connected || saveState === "syncing"
                      ? "bg-accent animate-soft-pulse"
                      : saveState === "error"
                        ? "bg-danger"
                        : "bg-teal"
                  }`}
                />
                {statusLabel}
              </span>
            </div>

            <div className={view === "document" ? "flex items-center gap-2" : "hidden"}>
              <button
                type="button"
                onClick={() => meta.set("monospace", !monospace)}
                className={`inline-flex h-9 items-center gap-2 rounded-full px-3 text-xs font-medium transition ${
                  monospace
                    ? "bg-ink text-white"
                    : "bg-white text-ink-muted hover:text-ink"
                }`}
              >
                <TypeIcon className="h-3.5 w-3.5" />
                Mono
              </button>
              <p className="hidden text-xs text-ink-muted sm:block">
                {stats.words} words · {stats.chars} chars
              </p>
            </div>
          </div>

          {/* The document stays mounted while Files is open, so the editor keeps its state. */}
          <div className={view === "document" ? "flex min-h-0 flex-1 flex-col" : "hidden"}>
          <div className="shrink-0 px-4 pt-3 sm:px-7 sm:pt-5">
            <input
              value={title}
              maxLength={NOTE_LIMITS.titleMax}
              onChange={(event) => setYText(titleText, event.target.value)}
              placeholder="Untitled note"
              className="w-full border-none bg-transparent font-display text-2xl tracking-tight text-ink placeholder:text-ink/25 outline-none sm:text-4xl"
            />
          </div>

          <RichTextEditor
            key={doc.guid}
            doc={doc}
            monospace={monospace}
            onStats={setStats}
            uploadFile={uploadFromEditor}
            onEditorReady={setEditor}
          />
          </div>

          {view === "files" ? (
            <MediaManager
              files={filesState.files}
              usage={filesState.usage}
              loaded={filesState.loaded}
              uploads={filesState.uploads}
              active={view === "files"}
              onUpload={filesState.upload}
              onDismissUpload={filesState.dismissUpload}
              onDelete={filesState.remove}
              onRename={filesState.rename}
              onInsert={insertIntoDocument}
            />
          ) : null}
        </section>
        </div>

        <footer className="mt-2 flex shrink-0 items-center justify-between gap-2 px-1 text-xs text-ink/75 sm:mt-3 sm:text-sm">
          <p className="truncate">
            {view === "files"
              ? "Files are shared with everyone who has this note’s link — each file also has its own link."
              : "Everyone with the link edits together live; simultaneous changes merge."}
          </p>
          <p className={view === "document" ? "shrink-0 sm:hidden" : "hidden"}>
            {stats.words} words · {stats.chars} chars
          </p>
        </footer>
      </main>
    </div>
  );
}
