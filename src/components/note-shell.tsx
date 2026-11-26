import { LinkIcon, LockIcon, PlusIcon } from "@/components/icons";
import { Brand } from "@/components/logo";

function Bar({ className }: { className: string }) {
  return <span className={`block rounded-full bg-ink/[0.07] animate-soft-pulse ${className}`} />;
}

/**
 * The note page's layout with placeholders, shown while the note connects.
 * It mirrors the real Notepad layout (same sizes and spacing) so nothing
 * jumps when the content arrives. Works on the server and the client.
 */
export function NoteShell({ noteId, status = "Connecting…" }: { noteId?: string; status?: string }) {
  return (
    <div className="app-frame atmosphere relative flex flex-col" aria-busy="true">
      <header className="relative z-10 mx-auto flex w-full max-w-6xl shrink-0 items-center justify-between gap-4 px-5 pb-3 pt-4 sm:px-8 sm:pt-5">
        <div className="min-w-0">
          <Brand tagline="Write together live. Share anything." />
        </div>
        <div className="flex shrink-0 items-center gap-1.5 opacity-60 sm:gap-2" aria-hidden>
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-line bg-surface/85 text-ink sm:w-14">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
              <rect x="3" y="4" width="18" height="12" rx="2" />
              <path d="M8 20h8M12 16v4" />
            </svg>
          </span>
          <span className="inline-flex h-10 items-center gap-2 rounded-full border border-line bg-surface/85 px-3 text-sm font-medium text-ink">
            <PlusIcon className="h-4 w-4" />
            <span className="hidden sm:inline">New</span>
          </span>
          <span className="inline-flex h-10 items-center gap-2 rounded-full border border-line bg-surface/85 px-3 text-sm font-medium text-ink">
            <LockIcon className="h-4 w-4" />
            <span className="hidden sm:inline">Protect</span>
          </span>
          <span className="inline-flex h-10 items-center gap-2 rounded-full bg-accent px-3 text-sm font-semibold text-white sm:px-4">
            <LinkIcon className="h-4 w-4" />
            <span className="hidden min-[400px]:inline">Share</span>
          </span>
        </div>
      </header>

      <main className="relative z-10 mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col px-3 pb-3 sm:px-8 sm:pb-4">
        <div className="flex min-h-0 flex-1 flex-col gap-2.5 md:flex-row md:gap-4">
          <nav
            aria-hidden
            className="flex shrink-0 gap-1 rounded-[20px] border border-line bg-surface/95 p-1 md:w-52 md:flex-col md:gap-1.5 md:rounded-[24px] md:p-2"
          >
            {["Document", "Files", "Chat"].map((label, index) => (
              <span
                key={label}
                className={`flex flex-1 items-center gap-2.5 rounded-2xl px-3 py-2 md:flex-none md:py-2.5 ${
                  index === 0 ? "bg-strong text-on-strong" : "text-ink-muted"
                }`}
              >
                <span className="h-[18px] w-[18px] rounded-md border-[1.8px] border-current opacity-80" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">{label}</span>
                  <span className={`hidden text-[11px] md:block ${index === 0 ? "text-on-strong/60" : "text-ink/40"}`}>
                    {["Write together", "Share anything", "Talk with others"][index]}
                  </span>
                </span>
              </span>
            ))}
          </nav>

          <section className="editor-shell paper-grain flex min-h-0 flex-1 flex-col overflow-hidden rounded-[24px] border border-line bg-paper-elevated sm:rounded-[28px]">
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-line/80 px-4 py-2.5 sm:px-7 sm:py-3">
              <div className="flex items-center gap-3 text-sm text-ink-muted">
                {noteId ? (
                  <span className="rounded-full bg-surface px-3 py-1 font-mono text-xs text-ink">/{noteId}</span>
                ) : null}
                <span className="inline-flex items-center gap-2" role="status">
                  <span className="h-2 w-2 rounded-full bg-accent animate-soft-pulse" />
                  {status}
                </span>
              </div>
              <Bar className="hidden h-9 w-24 sm:block" />
            </div>

            <div className="shrink-0 px-4 pt-3 sm:px-7 sm:pt-5">
              <p className="font-display text-2xl tracking-tight text-ink/25 sm:text-4xl">Untitled note</p>
            </div>

            <div className="shrink-0 space-y-2 border-b border-line/80 px-3 py-2 sm:px-5 sm:py-2.5">
              <div className="flex gap-1.5">
                <Bar className="h-8 w-16" />
                <Bar className="h-8 w-28" />
                <Bar className="h-8 w-20" />
                <Bar className="hidden h-8 w-56 sm:block" />
              </div>
              <div className="flex gap-1.5">
                <Bar className="h-8 w-40" />
                <Bar className="h-8 w-32" />
                <Bar className="hidden h-8 w-64 sm:block" />
              </div>
            </div>

            <div className="min-h-0 flex-1 space-y-4 px-5 py-5 sm:px-7">
              <Bar className="h-3.5 w-3/4" />
              <Bar className="h-3.5 w-11/12" />
              <Bar className="h-3.5 w-2/3" />
            </div>
          </section>
        </div>

        <footer className="mt-2 flex shrink-0 items-center justify-between gap-2 px-1 text-xs text-ink/75 sm:mt-3 sm:text-sm">
          <p className="truncate">Everyone with the link edits together live; simultaneous changes merge.</p>
        </footer>
      </main>
    </div>
  );
}
