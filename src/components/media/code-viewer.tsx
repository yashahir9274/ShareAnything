"use client";

import { useEffect, useState } from "react";
import { codeLanguage } from "@/lib/files";

const PREVIEW_LIMIT = 512 * 1024;
const HIGHLIGHT_LIMIT = 200 * 1024;

type State =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; text: string; html: string | null; truncated: boolean; language: string };

/** Fetches a text/code file and shows it with line numbers and syntax highlighting. */
export function CodeViewer({ src, name }: { src: string; name: string }) {
  const [state, setState] = useState<State>({ status: "loading" });
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(src, { headers: { Range: `bytes=0-${PREVIEW_LIMIT - 1}` } });
        if (!response.ok) throw new Error();
        const total = Number(response.headers.get("content-range")?.split("/")[1] ?? 0);
        const text = await response.text();
        const truncated = response.status === 206 && total > PREVIEW_LIMIT;
        let language = codeLanguage(name) ?? "plaintext";
        let html: string | null = null;
        if (text.length <= HIGHLIGHT_LIMIT && language !== "plaintext") {
          // Loaded only when a code file is opened.
          const hljs = (await import("highlight.js/lib/common")).default;
          if (hljs.getLanguage(language)) {
            // highlight.js escapes the source, so its output is safe to insert as HTML.
            html = hljs.highlight(text, { language, ignoreIllegals: true }).value;
          } else {
            language = "plaintext";
          }
        }
        if (!cancelled) setState({ status: "ready", text, html, truncated, language });
      } catch {
        if (!cancelled) setState({ status: "error" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [src, name]);

  if (state.status === "loading") {
    return <div className="p-6 text-sm text-ink-muted animate-soft-pulse">Loading file…</div>;
  }
  if (state.status === "error") {
    return <div className="p-6 text-sm text-danger">Couldn’t load this file.</div>;
  }

  // A trailing newline ends the last line; it doesn't start a new one.
  const lines = Math.max(1, state.text.replace(/\r?\n$/, "").split("\n").length);

  async function copy() {
    if (state.status !== "ready") return;
    await navigator.clipboard.writeText(state.text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="code-viewer flex h-full min-h-0 flex-col overflow-hidden rounded-2xl bg-[#0b1420] text-[#e6edf3]">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 px-4 py-2 text-xs text-white/60">
        <span className="font-mono">
          {state.language} · {lines.toLocaleString()} lines
          {state.truncated ? " · preview truncated" : ""}
        </span>
        <button
          type="button"
          onClick={() => void copy()}
          className="rounded-full bg-white/10 px-3 py-1 font-medium text-white transition hover:bg-white/20"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <pre className="flex min-w-max font-mono text-[13px] leading-6">
          <code
            aria-hidden
            className="sticky left-0 select-none border-r border-white/10 bg-[#0b1420] px-3 text-right text-white/30"
          >
            {Array.from({ length: lines }, (_, i) => i + 1).join("\n")}
          </code>
          {state.html !== null ? (
            <code className="hljs px-4" dangerouslySetInnerHTML={{ __html: state.html }} />
          ) : (
            <code className="px-4">{state.text}</code>
          )}
        </pre>
      </div>
    </div>
  );
}
