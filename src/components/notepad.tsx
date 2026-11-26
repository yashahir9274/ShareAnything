"use client";

import { NewNoteLink } from "@/components/new-note-link";
import { useRouter } from "next/navigation";
import type { Editor } from "@tiptap/react";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { AvatarStack } from "@/components/chat/avatars";
import { ChatPanel } from "@/components/chat/chat-panel";
import { useDialogs } from "@/components/dialogs";
import type { ChatMessage } from "@/lib/chat";
import { useIdentity } from "@/lib/identity";
import { useNotePush } from "@/lib/use-note-push";
import { askOnceForNotifications, notifyIfAway, pageIsAway, prepareNotifications } from "@/lib/notifications";
import { useNoteChat } from "@/lib/use-note-chat";
import { CheckIcon, LinkIcon, LockIcon, PlusIcon, TypeIcon } from "@/components/icons";
import { MediaManager } from "@/components/media/media-manager";
import { NoteShell } from "@/components/note-shell";
import { ProtectDialog, describeMinutes } from "@/components/protect-dialog";
import { ThemeMenu } from "@/components/theme-menu";
import { Brand } from "@/components/logo";
import { RichTextEditor, type EditorStats } from "@/components/rich-text-editor";
import { META_FIELD, TITLE_FIELD } from "@/lib/editor-extensions";
import { fileRawUrl, formatBytes, type NoteFile } from "@/lib/files";
import { requestNewNoteId } from "@/lib/new-note";
import { NOTE_LIMITS } from "@/lib/note-types";
import { useNoteFiles } from "@/lib/use-note-files";
import { REMOTE, setYText, useNoteSync, useYMapValue, useYText } from "@/lib/use-note-sync";

type View = "document" | "files" | "chat";

/** #files / #chat in the URL open that tab directly. */
function viewFromHash(): View {
  if (typeof window === "undefined") return "document";
  if (window.location.hash === "#files") return "files";
  if (window.location.hash === "#chat") return "chat";
  return "document";
}

const DOC_NOTIFY_EVERY_MS = 5 * 60 * 1000;

function NavIcon({ view }: { view: View }) {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {view === "document" ? (
        <>
          <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
          <path d="M14 3v5h5M9 13h6M9 17h4" />
        </>
      ) : view === "chat" ? (
        <path d="M4 5h16v11H9l-5 4z" />
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
  const { doc, access, locked, relockMinutes, lockReason, connected, saveState, saveError, unlock, changePassword } =
    useNoteSync(noteId);

  const titleText = doc.getText(TITLE_FIELD);
  const meta = doc.getMap(META_FIELD);
  const title = useYText(titleText);
  const monospace = useYMapValue(meta, "monospace", false);

  const [stats, setStats] = useState<EditorStats>({ words: 0, chars: 0 });
  const [copied, setCopied] = useState(false);
  const [lockOpen, setLockOpen] = useState(false);
  const [unlockDraft, setUnlockDraft] = useState("");
  const [unlocking, setUnlocking] = useState(false);
  const [lockError, setLockError] = useState("");
  const [view, setViewState] = useState<View>(viewFromHash);
  const viewRef = useRef<View>(view);
  const [editor, setEditor] = useState<Editor | null>(null);
  const identity = useIdentity();

  // Activity you haven't seen yet: shown on the tabs and in the browser tab title.
  const [unreadChat, setUnreadChat] = useState(0);
  const [newFiles, setNewFiles] = useState(0);
  const noteLabel = title.trim() || `/${noteId}`;
  const noteLabelRef = useRef(noteLabel);
  useEffect(() => {
    noteLabelRef.current = noteLabel;
  }, [noteLabel]);

  const setView = useCallback((next: View) => {
    viewRef.current = next;
    setViewState(next);
    if (next === "chat") setUnreadChat(0);
    if (next === "files") setNewFiles(0);
    const url = next === "document" ? window.location.pathname + window.location.search : `#${next}`;
    window.history.replaceState(window.history.state, "", url);
  }, []);

  useEffect(() => {
    function onHash() {
      const next = viewFromHash();
      viewRef.current = next;
      setViewState(next);
    }
    // Coming back to the page counts as seeing whatever tab is open.
    function onReturn() {
      if (pageIsAway()) return;
      if (viewRef.current === "chat") setUnreadChat(0);
      if (viewRef.current === "files") setNewFiles(0);
    }
    window.addEventListener("hashchange", onHash);
    window.addEventListener("focus", onReturn);
    document.addEventListener("visibilitychange", onReturn);
    return () => {
      window.removeEventListener("hashchange", onHash);
      window.removeEventListener("focus", onReturn);
      document.removeEventListener("visibilitychange", onReturn);
    };
  }, []);

  const { notify: showNotice } = useDialogs();

  /** First time someone opens Chat: ask for notification permission (once, ever, per device). */
  const askNotificationsOnce = useCallback(async () => {
    const result = await askOnceForNotifications();
    if (result === "on") {
      showNotice("Notifications are on. You can turn them off with the bell in Chat.");
    } else if (result && result !== "unsupported") {
      showNotice("Notifications are off. Turn them on any time with the bell in Chat.");
    }
  }, [showNotice]);

  // If notifications are already on, register the service worker now so clicks route back here.
  useEffect(() => {
    prepareNotifications();
  }, []);

  /** Link a notification click opens: this note, on the given tab. */
  const viewUrl = useCallback(
    (target: View) => `${window.location.origin}/${noteId}${target === "document" ? "" : `#${target}`}`,
    [noteId],
  );

  const onChatMessage = useCallback(
    (message: ChatMessage) => {
      if (viewRef.current !== "chat" || pageIsAway()) setUnreadChat((n) => n + 1);
      // Never include the message text: just who sent something.
      const fileCount = message.attachments?.length ?? 0;
      notifyIfAway({
        title: `New message · ${noteLabelRef.current}`,
        body: fileCount
          ? `${message.author.name} sent ${fileCount === 1 ? "a file" : `${fileCount} files`}`
          : `${message.author.name} sent a message`,
        tag: `chat:${noteId}`,
        url: viewUrl("chat"),
        onClick: () => setView("chat"),
      });
    },
    [noteId, setView, viewUrl],
  );

  const onOthersUpload = useCallback(
    (file: NoteFile, viaChat: boolean) => {
      if (viewRef.current !== "files" || pageIsAway()) setNewFiles((n) => n + 1);
      // Files sent in chat are announced by the chat message instead.
      if (viaChat) return;
      notifyIfAway({
        title: `New file · ${noteLabelRef.current}`,
        body: `${file.uploadedBy ?? "Someone"} shared a file`,
        tag: `files:${noteId}`,
        url: viewUrl("files"),
        onClick: () => setView("files"),
      });
    },
    [noteId, setView, viewUrl],
  );

  const filesState = useNoteFiles(noteId, access === "open", connected, onOthersUpload);
  const { upload } = filesState;
  const chat = useNoteChat({ noteId, enabled: access === "open", connected, identity, onMessage: onChatMessage });
  useNotePush({ noteId, enabled: access === "open", connected, userId: identity?.id });

  // Someone else edited the document while you're away: at most one notification per 5 minutes.
  const lastDocNotify = useRef(0);
  useEffect(() => {
    if (access !== "open") return;
    function onUpdate(_update: Uint8Array, origin: unknown) {
      if (origin !== REMOTE || !pageIsAway()) return;
      const now = Date.now();
      if (now - lastDocNotify.current < DOC_NOTIFY_EVERY_MS) return;
      lastDocNotify.current = now;
      notifyIfAway({
        title: `Document updated · ${noteLabelRef.current}`,
        body: "Someone edited the document",
        tag: `doc:${noteId}`,
        url: viewUrl("document"),
        onClick: () => setView("document"),
      });
    }
    doc.on("update", onUpdate);
    return () => doc.off("update", onUpdate);
  }, [doc, access, noteId, setView, viewUrl]);

  // "(3) ShareAnything / abc" in the browser tab while there's unseen activity.
  useEffect(() => {
    const base = document.title.replace(/^\(\d+\) /, "");
    const count = unreadChat + newFiles;
    document.title = count ? `(${count}) ${base}` : base;
  }, [unreadChat, newFiles]);

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
            {lockReason === "expired"
              ? "This note locked again automatically. Enter the password to keep going."
              : lockReason === "password-set"
                ? "Someone just set a new password. Enter it to keep going."
                : "Enter the password to read or keep writing."}
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
              className="mt-2 w-full rounded-2xl border border-line bg-surface px-4 py-3 text-base text-ink outline-none transition focus:border-accent"
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
            className="mt-5 w-full rounded-full bg-strong px-5 py-3 text-sm font-semibold text-on-strong transition hover:bg-strong/90"
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
      <header data-kb-hide className="relative z-30 mx-auto flex w-full max-w-6xl shrink-0 items-center justify-between gap-4 px-5 pb-3 pt-4 sm:px-8 sm:pt-5">
        <NewNoteLink className="group min-w-0">
          <Brand tagline="Write together live. Share anything." />
        </NewNoteLink>

        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <ThemeMenu />
          <button
            type="button"
            onClick={() => void createFreshNote()}
            className="inline-flex h-10 items-center gap-2 rounded-full border border-line bg-surface/85 px-3 text-sm font-medium text-ink transition hover:border-ink/20 hover:bg-surface"
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
                : "border-line bg-surface/85 text-ink hover:border-ink/20 hover:bg-surface"
            }`}
            aria-label="Password protect"
            title={
              locked
                ? relockMinutes
                  ? `Protected · locks again ${describeMinutes(relockMinutes)} after unlocking`
                  : "Protected with a password"
                : "Protect with a password"
            }
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
            className="inline-flex h-10 items-center gap-2 rounded-full bg-accent px-3 text-sm sm:px-4 font-semibold text-white transition hover:brightness-105"
          >
            {copied ? <CheckIcon className="h-4 w-4" /> : <LinkIcon className="h-4 w-4" />}
            <span className="hidden min-[400px]:inline">{copied ? "Copied" : "Share"}</span>
          </button>
        </div>
      </header>

      <main className="relative z-10 mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col px-3 pb-3 sm:px-8 sm:pb-4">
        {lockOpen ? (
          <ProtectDialog
            locked={locked}
            relockMinutes={relockMinutes}
            onSave={(password, relock) => changePassword(password, relock)}
            onRemove={() => changePassword(null)}
            onClose={() => setLockOpen(false)}
          />
        ) : null}

        <div className="flex min-h-0 flex-1 flex-col gap-2.5 md:flex-row md:gap-4">
        <nav
          data-kb-hide
          aria-label="Note sections"
          className="flex shrink-0 gap-1 rounded-[20px] border border-line bg-surface/95 p-1 md:w-52 md:flex-col md:gap-1.5 md:rounded-[24px] md:p-2"
        >
          {(
            [
              { id: "document", label: "Document", hint: "Write together" },
              { id: "files", label: "Files", hint: "Share anything" },
              { id: "chat", label: "Chat", hint: "Talk with others" },
            ] as const
          ).map((item) => {
            const selected = view === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  if (item.id === "chat") void askNotificationsOnce();
                  setView(item.id);
                }}
                aria-current={selected ? "page" : undefined}
                className={`flex flex-1 items-center gap-2.5 rounded-2xl px-3 py-2 text-left transition md:flex-none md:py-2.5 ${
                  selected ? "bg-strong text-on-strong" : "text-ink-muted hover:bg-paper hover:text-ink"
                }`}
              >
                <NavIcon view={item.id} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">{item.label}</span>
                  <span className={`hidden text-[11px] md:block ${selected ? "text-on-strong/60" : "text-ink/40"}`}>
                    {item.hint}
                  </span>
                </span>
                {item.id === "files" && filesState.files.length ? (
                  <span
                    title={newFiles ? `${newFiles} new` : undefined}
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ${
                      selected ? "bg-on-strong/15 text-on-strong" : newFiles ? "bg-accent text-white" : "bg-accent-soft text-accent"
                    }`}
                  >
                    {filesState.files.length}
                  </span>
                ) : null}
                {item.id === "chat" && unreadChat ? (
                  <span
                    aria-label={`${unreadChat} unread`}
                    className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold tabular-nums text-white"
                  >
                    {unreadChat > 99 ? "99+" : unreadChat}
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
              <span className="rounded-full bg-surface px-3 py-1 font-mono text-xs text-ink">
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
              {chat.online.length ? (
                <button
                  type="button"
                  onClick={() => setView("chat")}
                  className="hidden items-center gap-1.5 rounded-full px-1 text-xs text-ink-muted transition hover:text-ink sm:inline-flex"
                  title={chat.online.map((u) => u.name).join(", ")}
                >
                  <AvatarStack users={chat.online} max={3} />
                  {chat.online.length} here
                </button>
              ) : null}
            </div>

            <div className="flex items-center gap-2">
            <div className={view === "document" ? "flex items-center gap-2" : "hidden"}>
              <button
                type="button"
                onClick={() => meta.set("monospace", !monospace)}
                className={`inline-flex h-9 items-center gap-2 rounded-full px-3 text-xs font-medium transition ${
                  monospace
                    ? "bg-strong text-on-strong"
                    : "bg-surface text-ink-muted hover:text-ink"
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

          {view === "chat" ? (
            <ChatPanel
              messages={chat.messages}
              loaded={chat.loaded}
              online={chat.online}
              typing={chat.typing}
              identity={identity}
              onSend={chat.send}
              onTyping={chat.notifyTyping}
              onFirstInteraction={() => void askNotificationsOnce()}
              files={filesState.files}
              maxFileSize={filesState.usage?.maxFileSize}
              onAttach={(files) =>
                filesState.upload(
                  files.map((file) => ({ file, name: file.name || "pasted-file" })),
                  { source: "chat" },
                )
              }
            />
          ) : null}
        </section>
        </div>

        <footer data-kb-hide className="mt-2 flex shrink-0 items-center justify-between gap-2 px-1 text-xs text-ink/75 sm:mt-3 sm:text-sm">
          <p className="truncate">
            {view === "files"
              ? "Files are shared with everyone who has this note’s link — each file also has its own link."
              : view === "chat"
                ? "Chat is shared with everyone who has this note’s link. Turn on notifications to hear about new messages."
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
