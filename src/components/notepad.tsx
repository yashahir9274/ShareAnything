"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import type { Socket } from "socket.io-client";
import { CheckIcon, LinkIcon, LockIcon, PlusIcon, TypeIcon } from "@/components/icons";
import { createNoteId } from "@/lib/id";
import { createEmptyNote, type Note, type NoteUpdatePayload } from "@/lib/note-types";
import { countWords, fetchNote, hashPassword } from "@/lib/notes";
import { createClientId, getSocket } from "@/lib/socket";

type SaveState = "connecting" | "syncing" | "live" | "error";

type NotepadProps = {
  noteId: string;
};

const SYNC_DELAY_MS = 450;

export function Notepad({ noteId }: NotepadProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const clientIdRef = useRef(createClientId());
  const socketRef = useRef<Socket | null>(null);
  const noteRef = useRef<Note | null>(null);
  const skipSyncRef = useRef(false);
  const sessionUnlockedRef = useRef(false);

  const [note, setNote] = useState<Note | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("connecting");
  const [copied, setCopied] = useState(false);
  const [lockOpen, setLockOpen] = useState(false);
  const [passwordDraft, setPasswordDraft] = useState("");
  const [unlockDraft, setUnlockDraft] = useState("");
  const [locked, setLocked] = useState(false);
  const [lockError, setLockError] = useState("");

  useEffect(() => {
    noteRef.current = note;
  }, [note]);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        const loaded = await fetchNote(noteId);
        if (cancelled) return;
        sessionUnlockedRef.current = !loaded.passwordHash;
        setNote(loaded);
        setLocked(Boolean(loaded.passwordHash));
      } catch {
        if (cancelled) return;
        const fallback = createEmptyNote(noteId);
        sessionUnlockedRef.current = true;
        setNote(fallback);
        setLocked(false);
      }
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [noteId]);

  useEffect(() => {
    const socket = getSocket();
    socketRef.current = socket;
    setSaveState(socket.connected ? "live" : "connecting");

    function handleConnect() {
      setSaveState("live");
      socket.emit("note:join", noteId);
    }

    function handleDisconnect() {
      setSaveState("connecting");
    }

    function applyRemoteNote(remote: Note) {
      skipSyncRef.current = true;
      setNote(remote);
      if (!remote.passwordHash) {
        sessionUnlockedRef.current = true;
        setLocked(false);
      } else if (!sessionUnlockedRef.current) {
        setLocked(true);
      }
      setSaveState("live");
    }

    function handleState(remote: Note) {
      applyRemoteNote(remote);
    }

    function handleSync(payload: NoteUpdatePayload) {
      if (!payload?.note || payload.clientId === clientIdRef.current) return;
      applyRemoteNote(payload.note);
    }

    function handleSaved(remote: Note) {
      setNote((current) => {
        if (!current) return remote;
        if (current.updatedAt === remote.updatedAt) return current;
        return { ...current, updatedAt: remote.updatedAt };
      });
      setSaveState("live");
    }

    function handleError() {
      setSaveState("error");
    }

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("note:state", handleState);
    socket.on("note:sync", handleSync);
    socket.on("note:saved", handleSaved);
    socket.on("note:error", handleError);

    if (socket.connected) {
      handleConnect();
    } else {
      socket.connect();
    }

    return () => {
      socket.emit("note:leave", noteId);
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("note:state", handleState);
      socket.off("note:sync", handleSync);
      socket.off("note:saved", handleSaved);
      socket.off("note:error", handleError);
    };
  }, [noteId]);

  useEffect(() => {
    if (!note || locked) return;

    if (skipSyncRef.current) {
      skipSyncRef.current = false;
      return;
    }

    setSaveState("syncing");
    const timer = window.setTimeout(() => {
      const latest = noteRef.current;
      if (!latest) return;

      const payload: NoteUpdatePayload = {
        clientId: clientIdRef.current,
        note: {
          ...latest,
          updatedAt: new Date().toISOString(),
        },
      };

      socketRef.current?.emit("note:update", payload);
    }, SYNC_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [note?.content, note?.title, note?.monospace, note?.passwordHash, locked]);

  useEffect(() => {
    if (!locked) {
      const frame = requestAnimationFrame(() => textareaRef.current?.focus());
      return () => cancelAnimationFrame(frame);
    }
  }, [locked, noteId]);

  const stats = useMemo(() => {
    const content = note?.content ?? "";
    return {
      words: countWords(content),
      chars: content.length,
    };
  }, [note?.content]);

  function updateNote(patch: Partial<Note>) {
    setNote((current) => (current ? { ...current, ...patch } : current));
  }

  async function copyShareLink() {
    const url = `${window.location.origin}/n/${noteId}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  function createFreshNote() {
    const nextId = createNoteId();
    startTransition(() => {
      router.push(`/n/${nextId}`);
    });
  }

  async function applyPassword() {
    if (!note || !passwordDraft.trim()) return;
    const passwordHash = await hashPassword(passwordDraft.trim());
    sessionUnlockedRef.current = false;
    updateNote({ passwordHash });
    setPasswordDraft("");
    setLockOpen(false);
    setLocked(true);
  }

  function clearPassword() {
    sessionUnlockedRef.current = true;
    updateNote({ passwordHash: null });
    setLockOpen(false);
    setLocked(false);
  }

  async function attemptUnlock() {
    if (!note?.passwordHash) return;
    const attempt = await hashPassword(unlockDraft.trim());
    if (attempt === note.passwordHash) {
      sessionUnlockedRef.current = true;
      setLocked(false);
      setUnlockDraft("");
      setLockError("");
      return;
    }
    setLockError("That password doesn’t match.");
  }

  const statusLabel =
    saveState === "connecting"
      ? "Connecting…"
      : saveState === "syncing"
        ? "Syncing…"
        : saveState === "error"
          ? "Sync offline"
          : "Live";

  if (!note) {
    return (
      <div className="flex min-h-dvh items-center justify-center atmosphere">
        <p className="font-display text-2xl text-ink-muted animate-soft-pulse">
          Opening your note…
        </p>
      </div>
    );
  }

  if (locked) {
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
            className="mt-5 w-full rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-ink/90"
          >
            Unlock note
          </button>
          <Link
            href="/"
            className="mt-4 block text-center text-sm text-ink-muted transition hover:text-ink"
          >
            Start a new note instead
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="atmosphere relative min-h-dvh">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(ellipse_at_top,rgba(255,92,53,0.14),transparent_60%)]" />

      <header className="relative z-10 mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-5 pb-3 pt-5 sm:px-8 animate-fade-up">
        <Link href="/" className="group min-w-0">
          <p className="font-display text-[1.65rem] leading-none tracking-tight text-ink transition group-hover:text-accent sm:text-[1.85rem]">
            ShareAnything
          </p>
          <p className="mt-1 truncate text-xs text-ink-muted sm:text-sm">
            Live shared notes over sockets.
          </p>
        </Link>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={createFreshNote}
            className="inline-flex h-10 items-center gap-2 rounded-full border border-line bg-white/70 px-3 text-sm font-medium text-ink backdrop-blur transition hover:border-ink/20 hover:bg-white"
            aria-label="New note"
          >
            <PlusIcon className="h-4 w-4" />
            <span className="hidden sm:inline">New</span>
          </button>
          <button
            type="button"
            onClick={() => setLockOpen((open) => !open)}
            className={`inline-flex h-10 items-center gap-2 rounded-full border px-3 text-sm font-medium backdrop-blur transition ${
              note.passwordHash
                ? "border-teal/30 bg-teal-soft text-teal"
                : "border-line bg-white/70 text-ink hover:border-ink/20 hover:bg-white"
            }`}
            aria-label="Password protect"
          >
            <LockIcon className="h-4 w-4" />
            <span className="hidden sm:inline">
              {note.passwordHash ? "Locked" : "Protect"}
            </span>
          </button>
          <button
            type="button"
            onClick={() => void copyShareLink()}
            className="inline-flex h-10 items-center gap-2 rounded-full bg-accent px-4 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(255,92,53,0.28)] transition hover:brightness-105"
          >
            {copied ? <CheckIcon className="h-4 w-4" /> : <LinkIcon className="h-4 w-4" />}
            <span>{copied ? "Copied" : "Share"}</span>
          </button>
        </div>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-5xl px-5 pb-8 sm:px-8 animate-fade-up-delay">
        {lockOpen ? (
          <div className="mb-4 rounded-[24px] border border-line bg-white/80 p-4 backdrop-blur sm:p-5">
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
                  onClick={() => void applyPassword()}
                  className="rounded-full bg-ink px-4 py-3 text-sm font-semibold text-white"
                >
                  Save lock
                </button>
                {note.passwordHash ? (
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
          </div>
        ) : null}

        <section className="editor-shell paper-grain overflow-hidden rounded-[28px] border border-line bg-paper-elevated">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line/80 px-5 py-3 sm:px-7">
            <div className="flex items-center gap-3 text-sm text-ink-muted">
              <span className="rounded-full bg-white px-3 py-1 font-mono text-xs text-ink">
                /n/{noteId}
              </span>
              <span className="inline-flex items-center gap-2">
                <span
                  className={`h-2 w-2 rounded-full ${
                    saveState === "syncing" || saveState === "connecting"
                      ? "bg-accent animate-soft-pulse"
                      : saveState === "error"
                        ? "bg-danger"
                        : "bg-teal"
                  }`}
                />
                {statusLabel}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => updateNote({ monospace: !note.monospace })}
                className={`inline-flex h-9 items-center gap-2 rounded-full px-3 text-xs font-medium transition ${
                  note.monospace
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

          <div className="px-5 pt-5 sm:px-7 sm:pt-7">
            <input
              value={note.title}
              onChange={(event) => updateNote({ title: event.target.value })}
              placeholder="Untitled note"
              className="w-full border-none bg-transparent font-display text-3xl tracking-tight text-ink placeholder:text-ink/25 outline-none sm:text-4xl"
            />
          </div>

          <textarea
            ref={textareaRef}
            value={note.content}
            onChange={(event) => updateNote({ content: event.target.value })}
            placeholder="Start typing. Open the same link in another browser — updates appear after a short delay."
            spellCheck
            className={`editor-textarea w-full border-none bg-transparent px-5 pb-8 pt-4 text-[1.05rem] leading-8 text-ink placeholder:text-ink/30 sm:px-7 sm:text-[1.125rem] sm:leading-8 ${
              note.monospace ? "font-mono text-[0.98rem] leading-7" : "font-sans"
            }`}
          />
        </section>

        <footer className="mt-4 flex flex-col gap-2 px-1 text-sm text-ink-muted sm:flex-row sm:items-center sm:justify-between">
          <p>
            Shared live over sockets. Changes sync about {SYNC_DELAY_MS}ms after you pause typing.
          </p>
          <p className="sm:hidden">
            {stats.words} words · {stats.chars} chars
          </p>
        </footer>
      </main>
    </div>
  );
}
