"use client";

import { useEffect, useRef, useState } from "react";
import { setThemePreference, useThemePreference, type ThemePreference } from "@/lib/theme";

const OPTIONS: Array<{ value: ThemePreference; label: string }> = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

function ThemeIcon({ value, className = "h-4 w-4" }: { value: ThemePreference; className?: string }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className,
    "aria-hidden": true,
  };
  if (value === "light") {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
    );
  }
  if (value === "dark") {
    return (
      <svg {...common}>
        <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" />
    </svg>
  );
}

/** Theme dropdown: System (default) / Light / Dark. */
export function ThemeMenu() {
  const preference = useThemePreference();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointer(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const current = OPTIONS.find((option) => option.value === preference) ?? OPTIONS[0];

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Theme: ${current.label}`}
        title={`Theme: ${current.label}`}
        className="inline-flex h-10 items-center gap-1.5 rounded-full border border-line bg-surface/85 px-3 text-sm font-medium text-ink transition hover:border-ink/20 hover:bg-surface"
      >
        <ThemeIcon value={preference} />
        <svg viewBox="0 0 24 24" className="hidden h-3.5 w-3.5 text-ink-muted sm:block" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open ? (
        <div
          role="menu"
          aria-label="Theme"
          className="absolute right-0 top-full z-40 mt-2 w-40 overflow-hidden rounded-2xl border border-line bg-surface p-1 shadow-xl animate-fade-up"
        >
          {OPTIONS.map((option) => {
            const selected = option.value === preference;
            return (
              <button
                key={option.value}
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                onClick={() => {
                  setThemePreference(option.value);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm transition ${
                  selected ? "bg-paper font-semibold text-ink" : "text-ink-muted hover:bg-paper hover:text-ink"
                }`}
              >
                <ThemeIcon value={option.value} />
                <span className="flex-1">{option.label}</span>
                {selected ? (
                  <svg viewBox="0 0 24 24" className="h-4 w-4 text-accent" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden>
                    <path d="m5 12 5 5L20 7" />
                  </svg>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
