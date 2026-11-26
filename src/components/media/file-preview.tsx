"use client";

import { fileRawUrl, formatBytes, type NoteFile } from "@/lib/files";
import { CodeViewer } from "./code-viewer";
import { FileIcon, kindLabel } from "./file-icon";

/** Full preview of a stored file, chosen by its kind. */
export function FilePreview({ file }: { file: NoteFile }) {
  const src = fileRawUrl(file.id);

  switch (file.kind) {
    case "image":
      return (
        <div className="flex h-full min-h-0 items-center justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element -- user uploads of any size/origin */}
          <img src={src} alt={file.name} className="max-h-full max-w-full rounded-2xl object-contain shadow-sm" />
        </div>
      );
    case "video":
      return (
        <div className="flex h-full min-h-0 items-center justify-center">
          <video src={src} controls playsInline preload="metadata" className="max-h-full max-w-full rounded-2xl bg-ink" />
        </div>
      );
    case "audio":
      return (
        <div className="flex h-full flex-col items-center justify-center gap-6">
          <FileIcon kind="audio" name={file.name} className="h-28 w-28" />
          <audio src={src} controls preload="metadata" className="w-full max-w-md" />
        </div>
      );
    case "pdf":
      return (
        <iframe
          src={src}
          title={file.name}
          className="h-full min-h-[60vh] w-full rounded-2xl border border-line bg-white"
        />
      );
    case "code":
    case "text":
      return <CodeViewer src={src} name={file.name} />;
    default:
      return (
        <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
          <FileIcon kind={file.kind} name={file.name} className="h-28 w-28" />
          <div>
            <p className="font-medium text-ink">{kindLabel(file.kind)} · {formatBytes(file.size)}</p>
            <p className="mt-1 text-sm text-ink-muted">No preview for this type — download it to open.</p>
          </div>
          <a
            href={fileRawUrl(file.id, true)}
            className="rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-ink/90"
          >
            Download
          </a>
        </div>
      );
  }
}

/** Small thumbnail for grid cards. */
export function FileThumb({ file }: { file: NoteFile }) {
  if (file.kind === "image") {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- user uploads
      <img
        src={fileRawUrl(file.id)}
        alt=""
        loading="lazy"
        decoding="async"
        className={
          file.name.toLowerCase().endsWith(".svg")
            ? "h-full w-full bg-white object-contain p-6"
            : "h-full w-full object-cover"
        }
      />
    );
  }
  if (file.kind === "video") {
    return (
      <div className="relative h-full w-full bg-ink">
        <video src={`${fileRawUrl(file.id)}#t=0.5`} muted preload="metadata" className="h-full w-full object-cover opacity-90" />
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent text-white shadow-lg">
            <svg viewBox="0 0 24 24" className="ml-0.5 h-4 w-4" fill="currentColor" aria-hidden>
              <path d="M8 5v14l11-7z" />
            </svg>
          </span>
        </span>
      </div>
    );
  }
  return (
    <div className="flex h-full w-full items-center justify-center bg-paper">
      <FileIcon kind={file.kind} name={file.name} className="h-20 w-20" />
    </div>
  );
}
