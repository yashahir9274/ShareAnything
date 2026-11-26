"use client";

import { FileIcon } from "@/components/media/file-icon";
import { FileThumb } from "@/components/media/file-preview";
import type { ChatAttachment } from "@/lib/chat";
import { fileRawUrl, formatBytes, type NoteFile } from "@/lib/files";

/** Files attached to a chat message: image/video previews, cards for everything else. */
export function MessageAttachments({
  attachments,
  available,
  mine,
  onOpen,
}: {
  attachments: ChatAttachment[];
  /** Files still in the note (deleted ones show as removed). */
  available: Map<string, NoteFile>;
  mine: boolean;
  onOpen: (file: NoteFile) => void;
}) {
  return (
    <div className={`mt-1 flex max-w-full flex-col gap-1.5 ${mine ? "items-end" : "items-start"}`}>
      {attachments.map((attachment) => {
        const file = available.get(attachment.id);
        if (!file) {
          return (
            <div
              key={attachment.id}
              className="flex items-center gap-2 rounded-2xl border border-dashed border-line bg-surface/70 px-3 py-2 text-xs text-ink-muted"
            >
              <FileIcon kind={attachment.kind} name={attachment.name} showExtension={false} className="h-8 w-8 rounded-lg opacity-50" />
              <span className="truncate line-through">{attachment.name}</span>
              <span>· removed</span>
            </div>
          );
        }
        if (file.kind === "image" || file.kind === "video") {
          return (
            <button
              key={file.id}
              type="button"
              onClick={() => onOpen(file)}
              title={file.kind === "image" ? `View ${file.name}` : `Play ${file.name}`}
              className="group/att relative block h-44 w-64 max-w-full overflow-hidden rounded-2xl border border-line bg-paper shadow-sm transition hover:brightness-95"
            >
              <FileThumb file={file} />
            </button>
          );
        }
        return (
          <div
            key={file.id}
            className="flex w-64 max-w-full items-center gap-3 rounded-2xl border border-line bg-surface p-2.5 text-left shadow-sm"
          >
            <button type="button" onClick={() => onOpen(file)} className="flex min-w-0 flex-1 items-center gap-3" title={`Open ${file.name}`}>
              <FileIcon kind={file.kind} name={file.name} showExtension={false} className="h-10 w-10 shrink-0 rounded-xl" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-ink">{file.name}</span>
                <span className="block text-[11px] text-ink-muted">{formatBytes(file.size)}</span>
              </span>
            </button>
            <a
              href={fileRawUrl(file.id, true)}
              download
              title="Download"
              aria-label={`Download ${file.name}`}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-paper text-ink transition hover:text-accent"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden>
                <path d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14" />
              </svg>
            </a>
          </div>
        );
      })}
    </div>
  );
}

export type PendingAttachment = {
  key: string;
  name: string;
  status: "uploading" | "ready" | "error";
  file?: NoteFile;
  error?: string;
};

/** Files picked for the next message, shown above the message box. */
export function PendingAttachments({
  items,
  onRemove,
}: {
  items: PendingAttachment[];
  onRemove: (key: string) => void;
}) {
  if (!items.length) return null;
  return (
    <div className="mb-2 flex flex-wrap gap-1.5">
      {items.map((item) => (
        <span
          key={item.key}
          className={`inline-flex max-w-56 items-center gap-1.5 rounded-full border py-1 pl-1.5 pr-1 text-xs ${
            item.status === "error" ? "border-danger/40 bg-danger/10 text-danger" : "border-line bg-surface text-ink"
          }`}
          title={item.error ?? item.name}
        >
          {item.status === "uploading" ? (
            <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-accent border-t-transparent" aria-label="Uploading" />
          ) : item.file ? (
            <FileIcon kind={item.file.kind} name={item.file.name} showExtension={false} className="h-5 w-5 shrink-0 rounded-md" />
          ) : null}
          <span className="truncate">{item.status === "error" ? `${item.name}: ${item.error}` : item.name}</span>
          <button
            type="button"
            onClick={() => onRemove(item.key)}
            aria-label={`Remove ${item.name}`}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-ink-muted transition hover:bg-paper hover:text-ink"
          >
            ×
          </button>
        </span>
      ))}
    </div>
  );
}
