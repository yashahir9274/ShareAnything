"use client";

import { useEffect, useState } from "react";
import { fileRawUrl, fileShareUrl, formatBytes, type NoteFile } from "@/lib/files";
import { Modal } from "./modal";

/** Everything needed to send a file to someone: link, QR code, system share sheet, download. */
export function ShareDialog({ file, onClose }: { file: NoteFile; onClose: () => void }) {
  const [url] = useState(() => fileShareUrl(window.location.origin, file.id));
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const canNativeShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  useEffect(() => {
    let cancelled = false;
    import("qrcode")
      .then((QRCode) =>
        QRCode.toDataURL(url, { margin: 1, width: 360, color: { dark: "#0b1420", light: "#ffffff" } }),
      )
      .then((data) => {
        if (!cancelled) setQr(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [url]);

  async function copy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  async function nativeShare() {
    try {
      await navigator.share({ title: file.name, text: `${file.name} on ShareAnything`, url });
    } catch {
      // cancelled
    }
  }

  return (
    <Modal title="Share file" onClose={onClose} size="sm">
      <div className="space-y-5 p-5 sm:p-6">
        <div>
          <p className="truncate font-medium text-ink" title={file.name}>
            {file.name}
          </p>
          <p className="text-sm text-ink-muted">
            {formatBytes(file.size)} · anyone with the link can view and download it
          </p>
        </div>

        <div className="flex gap-2">
          <input
            readOnly
            value={url}
            onFocus={(event) => event.target.select()}
            className="min-w-0 flex-1 rounded-2xl border border-line bg-paper-elevated px-4 py-2.5 font-mono text-xs text-ink outline-none"
            aria-label="Share link"
          />
          <button
            type="button"
            onClick={() => void copy()}
            className="shrink-0 rounded-full bg-accent px-4 text-sm font-semibold text-white transition hover:brightness-105"
          >
            {copied ? "Copied" : "Copy link"}
          </button>
        </div>

        <div className="flex flex-col items-center gap-2 rounded-2xl border border-line bg-white p-4">
          {qr ? (
            // eslint-disable-next-line @next/next/no-img-element -- generated data URL
            <img src={qr} alt={`QR code for ${file.name}`} className="h-44 w-44" />
          ) : (
            <div className="h-44 w-44 animate-soft-pulse rounded-xl bg-paper" />
          )}
          <p className="text-xs text-ink-muted">Scan to open on another device</p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full border border-line bg-white px-4 py-2.5 text-center text-sm font-medium text-ink transition hover:border-ink/20"
          >
            Open share page
          </a>
          <a
            href={fileRawUrl(file.id, true)}
            className="rounded-full border border-line bg-white px-4 py-2.5 text-center text-sm font-medium text-ink transition hover:border-ink/20"
          >
            Download
          </a>
          {canNativeShare ? (
            <button
              type="button"
              onClick={() => void nativeShare()}
              className="col-span-2 rounded-full bg-ink px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-ink/90"
            >
              Share via apps…
            </button>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}
