"use client";

import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import {
  fileRawUrl,
  formatBytes,
  isEmbeddableKind,
  type FileKind,
  type FilesUsage,
  type NoteFile,
} from "@/lib/files";
import type { UploadItem } from "@/lib/use-note-files";
import { useDialogs } from "@/components/dialogs";
import { FileIcon, kindLabel } from "./file-icon";
import { FilePreview, FileThumb } from "./file-preview";
import { Modal } from "./modal";
import { ShareDialog } from "./share-dialog";

type Filter = "all" | "image" | "video" | "audio" | "docs" | "code" | "other";

const FILTERS: Array<{ id: Filter; label: string; kinds: FileKind[] }> = [
  { id: "all", label: "All", kinds: [] },
  { id: "image", label: "Images", kinds: ["image"] },
  { id: "video", label: "Videos", kinds: ["video"] },
  { id: "audio", label: "Audio", kinds: ["audio"] },
  { id: "docs", label: "Docs", kinds: ["pdf", "document", "text"] },
  { id: "code", label: "Code", kinds: ["code"] },
  { id: "other", label: "Other", kinds: ["archive", "other"] },
];

const SNIPPET_LANGUAGES = [
  ["js", "JavaScript"], ["ts", "TypeScript"], ["tsx", "TSX"], ["py", "Python"], ["java", "Java"],
  ["go", "Go"], ["rs", "Rust"], ["cpp", "C++"], ["cs", "C#"], ["php", "PHP"], ["rb", "Ruby"],
  ["html", "HTML"], ["css", "CSS"], ["json", "JSON"], ["sql", "SQL"], ["sh", "Shell"],
  ["md", "Markdown"], ["yaml", "YAML"], ["txt", "Plain text"],
] as const;

export type MediaManagerProps = {
  files: NoteFile[];
  usage: FilesUsage | null;
  loaded: boolean;
  uploads: UploadItem[];
  active: boolean;
  onUpload: (input: Array<{ file: File | Blob; name: string }>) => Promise<Array<NoteFile | Error>>;
  onDismissUpload: (key: string) => void;
  onDelete: (fileId: string) => Promise<string | null>;
  onRename: (fileId: string, name: string) => Promise<string | null>;
  onInsert: (file: NoteFile) => void;
};

function timeAgo(iso: string) {
  const seconds = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(iso).toLocaleDateString();
}

function IconButton({
  label,
  onClick,
  href,
  download,
  children,
  tone = "default",
}: {
  label: string;
  onClick?: () => void;
  href?: string;
  download?: boolean;
  children: React.ReactNode;
  tone?: "default" | "danger";
}) {
  const className = `flex h-8 w-8 items-center justify-center rounded-full bg-white/95 shadow-sm ring-1 ring-line transition ${
    tone === "danger" ? "text-danger hover:bg-[#fee2e2]" : "text-ink hover:bg-white hover:text-accent"
  }`;
  const icon = (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {children}
    </svg>
  );
  if (href) {
    return (
      <a href={href} download={download} title={label} aria-label={label} className={className} onClick={(event) => event.stopPropagation()}>
        {icon}
      </a>
    );
  }
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className={className}
      onClick={(event) => {
        event.stopPropagation();
        onClick?.();
      }}
    >
      {icon}
    </button>
  );
}

const ICONS = {
  share: <><circle cx="18" cy="5" r="2.5" /><circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="19" r="2.5" /><path d="m8.2 10.8 7.6-4.4M8.2 13.2l7.6 4.4" /></>,
  download: <path d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14" />,
  insert: <path d="M12 5v14M5 12h14" />,
  rename: <path d="M4 20h4L19 9l-4-4L4 16zM14 6l4 4" />,
  delete: <path d="M5 7h14M10 11v6m4-6v6M8 7l1-3h6l1 3m-9 0 1 13h8l1-13" />,
};

export function MediaManager({
  files,
  usage,
  loaded,
  uploads,
  active,
  onUpload,
  onDismissUpload,
  onDelete,
  onRename,
  onInsert,
}: MediaManagerProps) {
  const dialogs = useDialogs();
  const inputRef = useRef<HTMLInputElement>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [dragging, setDragging] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [shareId, setShareId] = useState<string | null>(null);
  const [snippetOpen, setSnippetOpen] = useState(false);
  const [error, setError] = useState("");
  const dragDepth = useRef(0);

  const counts = useMemo(() => {
    const result = {} as Record<Filter, number>;
    for (const entry of FILTERS) {
      result[entry.id] = entry.id === "all" ? files.length : files.filter((file) => entry.kinds.includes(file.kind)).length;
    }
    return result;
  }, [files]);

  const visible = useMemo(() => {
    const kinds = FILTERS.find((entry) => entry.id === filter)!.kinds;
    const q = query.trim().toLowerCase();
    return files.filter(
      (file) => (filter === "all" || kinds.includes(file.kind)) && (!q || file.name.toLowerCase().includes(q)),
    );
  }, [files, filter, query]);

  const previewFile = files.find((file) => file.id === previewId) ?? null;
  const shareFile = files.find((file) => file.id === shareId) ?? null;

  function startUpload(list: FileList | File[]) {
    const items = Array.from(list).map((file) => ({ file, name: file.name || "pasted-file" }));
    if (items.length) void onUpload(items);
  }

  // Paste files straight into the manager while it's open.
  useEffect(() => {
    if (!active) return;
    function onPaste(event: ClipboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable=true]")) return;
      const pasted = Array.from(event.clipboardData?.files ?? []);
      if (!pasted.length) return;
      event.preventDefault();
      startUpload(pasted);
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  });

  function onDragEnter(event: DragEvent) {
    if (!event.dataTransfer.types.includes("Files")) return;
    dragDepth.current += 1;
    setDragging(true);
  }
  function onDragLeave() {
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (!dragDepth.current) setDragging(false);
  }
  function onDrop(event: DragEvent) {
    event.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    if (event.dataTransfer.files.length) startUpload(event.dataTransfer.files);
  }

  async function remove(file: NoteFile) {
    const ok = await dialogs.confirm({
      title: "Delete file?",
      message: (
        <>
          <strong className="font-semibold text-ink">{file.name}</strong> will be deleted. Its share link will stop
          working, and if it’s used in the document it will disappear there too. This can’t be undone.
        </>
      ),
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    const problem = await onDelete(file.id);
    if (problem) setError(problem);
    else if (previewId === file.id) setPreviewId(null);
  }

  async function rename(file: NoteFile) {
    const name = await dialogs.prompt({
      title: "Rename file",
      label: "File name",
      defaultValue: file.name,
      confirmLabel: "Rename",
      validate: (value) => (value ? null : "Enter a name."),
    });
    if (!name || name === file.name) return;
    const problem = await onRename(file.id, name);
    if (problem) setError(problem);
  }

  const usedPercent = usage ? Math.min(100, (usage.used / usage.quota) * 100) : 0;

  function actionsFor(file: NoteFile, inPreview = false) {
    return (
      <>
        <IconButton label="Share" onClick={() => setShareId(file.id)}>{ICONS.share}</IconButton>
        <IconButton label="Download" href={fileRawUrl(file.id, true)} download>{ICONS.download}</IconButton>
        {isEmbeddableKind(file.kind) ? (
          <IconButton
            label="Insert into document"
            onClick={() => {
              if (inPreview) setPreviewId(null);
              onInsert(file);
            }}
          >
            {ICONS.insert}
          </IconButton>
        ) : null}
        <IconButton label="Rename" onClick={() => void rename(file)}>{ICONS.rename}</IconButton>
        <IconButton label="Delete" tone="danger" onClick={() => void remove(file)}>{ICONS.delete}</IconButton>
      </>
    );
  }

  return (
    <div
      className="relative flex min-h-0 flex-1 flex-col"
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={(event) => event.preventDefault()}
      onDrop={onDrop}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(event) => {
          if (event.target.files) startUpload(event.target.files);
          event.target.value = "";
        }}
      />

      {/* Header */}
      <div className="shrink-0 space-y-3 border-b border-line/80 px-4 py-3 sm:px-6 sm:py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-display text-2xl tracking-tight text-ink sm:text-3xl">Files</h2>
            <p className="text-xs text-ink-muted sm:text-sm">
              Code, images, videos, documents — anything. Every file gets its own share link.
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={() => setSnippetOpen(true)}
              className="inline-flex h-10 items-center gap-2 rounded-full border border-line bg-white px-3.5 text-sm font-medium text-ink transition hover:border-ink/20"
            >
              <span className="font-mono text-xs">{"</>"}</span>
              <span className="hidden sm:inline">New snippet</span>
            </button>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="inline-flex h-10 items-center gap-2 rounded-full bg-accent px-4 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(255,92,53,0.25)] transition hover:brightness-105"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M12 16V4m0 0-4 4m4-4 4 4M5 20h14" />
              </svg>
              Upload
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="toolbar-row flex w-full min-w-0 items-center gap-1.5 sm:w-auto sm:flex-1">
            {FILTERS.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => setFilter(entry.id)}
                className={`inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition ${
                  filter === entry.id ? "bg-ink text-white" : "bg-white text-ink-muted hover:text-ink"
                }`}
              >
                {entry.label}
                <span className={filter === entry.id ? "text-white/60" : "text-ink/30"}>{counts[entry.id]}</span>
              </button>
            ))}
          </div>
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search files"
              className="h-8 min-w-0 flex-1 rounded-full border border-line bg-white px-3 text-xs text-ink outline-none transition focus:border-accent sm:w-44 sm:flex-none sm:focus:w-52"
            />
            <div className="flex rounded-full bg-white p-0.5 ring-1 ring-line">
              {(["grid", "list"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setView(mode)}
                  aria-pressed={view === mode}
                  className={`h-7 rounded-full px-2.5 text-xs font-medium capitalize transition ${
                    view === mode ? "bg-ink text-white" : "text-ink-muted hover:text-ink"
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Uploads in progress */}
      {uploads.length ? (
        <div className="shrink-0 space-y-1.5 border-b border-line/80 px-4 py-2.5 sm:px-6">
          {uploads.map((item) => {
            const percent = item.size ? Math.round((item.loaded / item.size) * 100) : 100;
            return (
              <div key={item.key} className="flex items-center gap-3 text-xs">
                <span className="min-w-0 flex-1 truncate text-ink">{item.name}</span>
                {item.status === "error" ? (
                  <>
                    <span className="text-danger">{item.error}</span>
                    <button type="button" onClick={() => onDismissUpload(item.key)} className="text-ink-muted hover:text-ink">
                      Dismiss
                    </button>
                  </>
                ) : (
                  <>
                    <span className="h-1.5 w-28 overflow-hidden rounded-full bg-line sm:w-40">
                      <span
                        className={`block h-full rounded-full transition-[width] ${item.status === "done" ? "bg-teal" : "bg-accent"}`}
                        style={{ width: `${percent}%` }}
                      />
                    </span>
                    <span className="w-10 text-right tabular-nums text-ink-muted">
                      {item.status === "done" ? "Done" : `${percent}%`}
                    </span>
                  </>
                )}
              </div>
            );
          })}
        </div>
      ) : null}

      {error ? (
        <div className="shrink-0 border-b border-line/80 bg-[#fee2e2]/60 px-4 py-2 text-xs text-danger sm:px-6">
          {error}{" "}
          <button type="button" className="underline" onClick={() => setError("")}>
            Dismiss
          </button>
        </div>
      ) : null}

      {/* File list */}
      <div className="editor-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6">
        {!loaded ? (
          <p className="py-10 text-center text-sm text-ink-muted animate-soft-pulse">Loading files…</p>
        ) : !files.length ? (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex h-full min-h-56 w-full flex-col items-center justify-center gap-3 rounded-3xl border-2 border-dashed border-line bg-white/60 p-8 text-center transition hover:border-accent/50 hover:bg-white"
          >
            <span className="flex gap-2">
              <FileIcon kind="code" name="app.tsx" className="h-14 w-14 -rotate-6" />
              <FileIcon kind="image" name="photo.png" className="h-14 w-14" />
              <FileIcon kind="pdf" name="doc.pdf" className="h-14 w-14 rotate-6" />
            </span>
            <span className="font-display text-xl text-ink">Drop files here to share them</span>
            <span className="max-w-sm text-sm text-ink-muted">
              Or click to choose, paste with Ctrl+V, or create a code snippet. Up to{" "}
              {usage ? formatBytes(usage.maxFileSize) : "100 MB"} per file.
            </span>
          </button>
        ) : !visible.length ? (
          <p className="py-10 text-center text-sm text-ink-muted">No files match.</p>
        ) : view === "grid" ? (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {visible.map((file) => (
              <li key={file.id}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setPreviewId(file.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") setPreviewId(file.id);
                  }}
                  className="group relative block w-full cursor-pointer overflow-hidden rounded-2xl border border-line bg-white text-left shadow-[0_1px_0_rgba(11,20,32,0.03)] transition hover:-translate-y-0.5 hover:shadow-[0_14px_30px_rgba(11,20,32,0.10)] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <div className="aspect-[4/3] overflow-hidden">
                    <FileThumb file={file} />
                  </div>
                  <div className="px-3 py-2.5">
                    <p className="truncate text-sm font-medium text-ink" title={file.name}>
                      {file.name}
                    </p>
                    <p className="text-[11px] text-ink-muted">
                      {kindLabel(file.kind)} · {formatBytes(file.size)} · {timeAgo(file.createdAt)}
                    </p>
                  </div>
                  <div className="absolute right-2 top-2 flex gap-1 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                    <IconButton label="Share" onClick={() => setShareId(file.id)}>{ICONS.share}</IconButton>
                    <IconButton label="Download" href={fileRawUrl(file.id, true)} download>{ICONS.download}</IconButton>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <ul className="divide-y divide-line/80 overflow-hidden rounded-2xl border border-line bg-white">
            {visible.map((file) => (
              <li
                key={file.id}
                className="flex cursor-pointer items-center gap-3 px-3 py-2.5 transition hover:bg-paper-elevated"
                onClick={() => setPreviewId(file.id)}
              >
                <FileIcon kind={file.kind} name={file.name} className="h-10 w-10 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{file.name}</p>
                  <p className="text-[11px] text-ink-muted">
                    {kindLabel(file.kind)} · {formatBytes(file.size)} · {timeAgo(file.createdAt)}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">{actionsFor(file)}</div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Storage */}
      {usage ? (
        <div className="flex shrink-0 items-center gap-3 border-t border-line/80 px-4 py-2 text-[11px] text-ink-muted sm:px-6">
          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
            <span
              className={`block h-full rounded-full ${usedPercent > 90 ? "bg-danger" : "bg-teal"}`}
              style={{ width: `${Math.max(usedPercent, usage.used ? 1 : 0)}%` }}
            />
          </span>
          <span className="shrink-0 tabular-nums">
            {formatBytes(usage.used)} of {formatBytes(usage.quota)} · {usage.count} files
          </span>
        </div>
      ) : null}

      {dragging ? (
        <div className="pointer-events-none absolute inset-2 z-20 flex flex-col items-center justify-center gap-2 rounded-3xl border-2 border-dashed border-accent bg-white/90">
          <p className="font-display text-2xl text-ink">Drop to upload</p>
          <p className="text-sm text-ink-muted">Files are shared with everyone who has this note’s link.</p>
        </div>
      ) : null}

      {previewFile ? (
        <Modal
          title={previewFile.name}
          size="lg"
          onClose={() => setPreviewId(null)}
          actions={<div className="hidden gap-1 sm:flex">{actionsFor(previewFile, true)}</div>}
        >
          <div className="flex h-[70dvh] min-h-0 flex-col gap-3 p-3 sm:p-5">
            <div className="min-h-0 flex-1">
              <FilePreview file={previewFile} />
            </div>
            <div className="flex shrink-0 items-center justify-between gap-2 text-xs text-ink-muted">
              <span>
                {kindLabel(previewFile.kind)} · {formatBytes(previewFile.size)} · added {timeAgo(previewFile.createdAt)}
              </span>
              <div className="flex gap-1 sm:hidden">{actionsFor(previewFile, true)}</div>
            </div>
          </div>
        </Modal>
      ) : null}

      {shareFile ? <ShareDialog file={shareFile} onClose={() => setShareId(null)} /> : null}

      {snippetOpen ? (
        <SnippetDialog
          onClose={() => setSnippetOpen(false)}
          onSave={async (name, text) => {
            const [saved] = await onUpload([{ file: new Blob([text], { type: "text/plain" }), name }]);
            if (saved && !(saved instanceof Error)) {
              setSnippetOpen(false);
              setShareId(saved.id);
            }
          }}
        />
      ) : null}
    </div>
  );
}

function SnippetDialog({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (name: string, text: string) => Promise<void>;
}) {
  const [base, setBase] = useState("snippet");
  const [ext, setExt] = useState<string>("js");
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!text.trim() || saving) return;
    setSaving(true);
    await onSave(`${base.trim() || "snippet"}.${ext}`, text);
    setSaving(false);
  }

  return (
    <Modal title="New code snippet" onClose={onClose} size="md">
      <div className="space-y-3 p-5 sm:p-6">
        <div className="flex gap-2">
          <input
            value={base}
            onChange={(event) => setBase(event.target.value.replace(/[\\/]/g, ""))}
            className="min-w-0 flex-1 rounded-2xl border border-line bg-white px-4 py-2.5 font-mono text-sm text-ink outline-none focus:border-accent"
            aria-label="File name"
          />
          <select
            value={ext}
            onChange={(event) => setExt(event.target.value)}
            className="rounded-2xl border border-line bg-white px-3 text-sm text-ink outline-none focus:border-accent"
            aria-label="Language"
          >
            {SNIPPET_LANGUAGES.map(([value, label]) => (
              <option key={value} value={value}>
                {label} (.{value})
              </option>
            ))}
          </select>
        </div>
        <textarea
          data-autofocus
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Tab") {
              event.preventDefault();
              const el = event.currentTarget;
              const start = el.selectionStart;
              setText(`${text.slice(0, start)}  ${text.slice(el.selectionEnd)}`);
              requestAnimationFrame(() => el.setSelectionRange(start + 2, start + 2));
            }
          }}
          spellCheck={false}
          placeholder="Paste or write code…"
          className="h-[45dvh] w-full resize-none rounded-2xl border border-line bg-[#0b1420] p-4 font-mono text-[13px] leading-6 text-[#e6edf3] outline-none placeholder:text-white/30 focus:border-accent"
        />
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-full px-4 py-2.5 text-sm font-medium text-ink-muted hover:text-ink">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={!text.trim() || saving}
            className="rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-105 disabled:opacity-40"
          >
            {saving ? "Saving…" : "Save & share"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
