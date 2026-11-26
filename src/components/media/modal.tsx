"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** Open dialogs, newest last: Escape only closes the top one. */
const openStack: symbol[] = [];

const SIZES = {
  sm: "max-w-md",
  md: "max-w-2xl",
  lg: "max-w-5xl",
} as const;

/** Accessible dialog rendered over the page; closes on Escape or backdrop click. */
export function Modal({
  title,
  onClose,
  children,
  size = "md",
  actions,
}: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  size?: keyof typeof SIZES;
  actions?: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  // What had focus before the dialog opened (read during the first render, before any
  // field inside the dialog autofocuses), so closing can hand focus back to it.
  const [returnFocusTo] = useState(() =>
    typeof document === "undefined" ? null : (document.activeElement as HTMLElement | null),
  );
  // Callers pass inline functions; keep the latest without re-running the setup below.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const self = Symbol("modal");
    openStack.push(self);
    // Focus the field marked data-autofocus (e.g. a prompt's input), otherwise the dialog itself.
    const panel = panelRef.current;
    const target = panel?.querySelector<HTMLElement>("[data-autofocus]") ?? panel;
    target?.focus({ preventScroll: true });
    if (target instanceof HTMLInputElement) target.select();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && openStack[openStack.length - 1] === self) {
        event.stopPropagation();
        onCloseRef.current();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => {
      openStack.splice(openStack.indexOf(self), 1);
      window.removeEventListener("keydown", onKey);
      if (returnFocusTo?.isConnected) returnFocusTo.focus({ preventScroll: true });
    };
  }, [returnFocusTo]);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 sm:items-center sm:p-6 animate-fade-in"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === "string" ? title : undefined}
        tabIndex={-1}
        className={`flex max-h-[92dvh] w-full ${SIZES[size]} flex-col overflow-hidden rounded-t-[28px] border border-line bg-paper-elevated shadow-2xl outline-none sm:rounded-[28px] animate-fade-up`}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line/80 px-5 py-3.5 sm:px-6">
          <div className="min-w-0 truncate font-display text-lg text-ink">{title}</div>
          <div className="flex shrink-0 items-center gap-2">
            {actions}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="flex h-9 w-9 items-center justify-center rounded-full text-ink-muted transition hover:bg-white hover:text-ink"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
