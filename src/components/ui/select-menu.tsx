"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";

export type SelectOption = {
  value: string;
  label: string;
  /** Options with the same group are listed under that heading. */
  group?: string;
  /** Small text on the right (e.g. "Pick any time"). */
  hint?: string;
};

const ITEM_HEIGHT = 38;
const VISIBLE_ITEMS = 6;

/**
 * App-styled dropdown (listbox). Shows ~6 options at a time with a scrollbar,
 * grouped headings, a check on the selected one, and full keyboard support.
 * The list is rendered in a portal so it isn't clipped inside popups.
 */
export function SelectMenu({
  options,
  value,
  onChange,
  label,
  id,
}: {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  /** Accessible name (e.g. "Lock again after"). */
  label: string;
  id?: string;
}) {
  const autoId = useId();
  const listId = `${id ?? autoId}-list`;
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(() => Math.max(0, options.findIndex((o) => o.value === value)));
  const [position, setPosition] = useState<{ left: number; width: number; top?: number; bottom?: number } | null>(null);
  const typeahead = useRef({ text: "", at: 0 });

  const selected = options.find((option) => option.value === value) ?? options[0];

  const place = useCallback(() => {
    const button = buttonRef.current;
    if (!button) return;
    const rect = button.getBoundingClientRect();
    const listHeight = Math.min(options.length * ITEM_HEIGHT + 60, VISIBLE_ITEMS * ITEM_HEIGHT + 60);
    const spaceBelow = window.innerHeight - rect.bottom;
    // Open upward when there isn't room below.
    setPosition(
      spaceBelow < listHeight && rect.top > spaceBelow
        ? { left: rect.left, width: rect.width, bottom: window.innerHeight - rect.top + 6 }
        : { left: rect.left, width: rect.width, top: rect.bottom + 6 },
    );
  }, [options.length]);

  function openMenu() {
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    place();
    setOpen(true);
  }

  function close(focusButton = true) {
    setOpen(false);
    if (focusButton) buttonRef.current?.focus();
  }

  function choose(index: number) {
    const option = options[index];
    if (!option) return;
    onChange(option.value);
    close();
  }

  // Keep the list attached to the button while scrolling/resizing; close on outside clicks.
  useEffect(() => {
    if (!open) return;
    function onPointer(event: PointerEvent) {
      const target = event.target as Node;
      if (!buttonRef.current?.contains(target) && !listRef.current?.contains(target)) close(false);
    }
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open, place]);

  // Focus the list and bring the selected/active option into view when it opens or moves.
  useLayoutEffect(() => {
    if (!open) return;
    const list = listRef.current;
    if (!list) return;
    if (document.activeElement !== list) list.focus({ preventScroll: true });
    list.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  function onButtonKey(event: KeyboardEvent<HTMLButtonElement>) {
    if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
      event.preventDefault();
      openMenu();
    }
  }

  function onListKey(event: KeyboardEvent<HTMLUListElement>) {
    const last = options.length - 1;
    const move = (index: number) => {
      event.preventDefault();
      setActive(Math.min(last, Math.max(0, index)));
    };
    // Type to jump: "n" → "Never", "3 h" → "3 hours". A space only continues a search
    // that's already in progress; on its own, Space picks the highlighted option.
    const now = event.timeStamp;
    const searching = Boolean(typeahead.current.text) && now - typeahead.current.at < 700;
    const printable = event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey;
    if (printable && (event.key !== " " || searching)) {
      event.preventDefault();
      const text = (searching ? typeahead.current.text : "") + event.key.toLowerCase();
      typeahead.current = { text, at: now };
      const start = text.length === 1 ? active + 1 : active;
      for (let step = 0; step < options.length; step += 1) {
        const index = (start + step) % options.length;
        if (options[index].label.toLowerCase().startsWith(text)) return move(index);
      }
      return;
    }

    switch (event.key) {
      case "ArrowDown":
        return move(active + 1);
      case "ArrowUp":
        return move(active - 1);
      case "Home":
        return move(0);
      case "End":
        return move(last);
      case "PageDown":
        return move(active + VISIBLE_ITEMS);
      case "PageUp":
        return move(active - VISIBLE_ITEMS);
      case "Enter":
      case " ":
        event.preventDefault();
        return choose(active);
      case "Escape":
        // Close just the dropdown, not the popup it's in.
        event.preventDefault();
        event.stopPropagation();
        return close();
      case "Tab":
        return close(false);
    }
  }

  return (
    <>
      <button
        ref={buttonRef}
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={`${label}: ${selected?.label ?? ""}`}
        onClick={() => (open ? close() : openMenu())}
        onKeyDown={onButtonKey}
        className={`group flex w-full items-center gap-3 rounded-2xl border bg-surface px-4 py-3 text-left text-sm text-ink shadow-[0_1px_0_rgba(11,20,32,0.03)] outline-none transition ${
          open ? "border-accent ring-4 ring-accent/15" : "border-line hover:border-ink/25 focus-visible:border-accent focus-visible:ring-4 focus-visible:ring-accent/15"
        }`}
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-accent" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
        <span className="min-w-0 flex-1 truncate font-medium">{selected?.label}</span>
        {selected?.group ? <span className="shrink-0 text-xs text-ink-muted">{selected.group}</span> : null}
        <svg
          viewBox="0 0 24 24"
          className={`h-4 w-4 shrink-0 text-ink-muted transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          aria-hidden
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && position
        ? createPortal(
            <ul
              ref={listRef}
              id={listId}
              role="listbox"
              tabIndex={-1}
              aria-label={label}
              aria-activedescendant={`${listId}-${active}`}
              onKeyDown={onListKey}
              style={{
                left: position.left,
                width: position.width,
                top: position.top,
                bottom: position.bottom,
                maxHeight: VISIBLE_ITEMS * ITEM_HEIGHT + 56,
              }}
              className="select-menu fixed z-[70] overflow-y-auto overscroll-contain rounded-2xl border border-line bg-surface p-1.5 shadow-[0_24px_60px_rgba(11,20,32,0.22)] outline-none animate-fade-up"
            >
              {options.map((option, index) => {
                const isSelected = option.value === value;
                const isActive = index === active;
                const showGroup = option.group && option.group !== options[index - 1]?.group;
                return (
                  <li key={option.value} role="presentation">
                    {showGroup ? (
                      <p className="px-3 pb-1 pt-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted first:pt-1">
                        {option.group}
                      </p>
                    ) : null}
                    <div
                      id={`${listId}-${index}`}
                      data-index={index}
                      role="option"
                      aria-selected={isSelected}
                      onPointerMove={() => setActive(index)}
                      onClick={() => choose(index)}
                      style={{ minHeight: ITEM_HEIGHT - 2 }}
                      className={`flex cursor-pointer items-center gap-2.5 rounded-xl px-3 text-sm transition-colors ${
                        isActive ? "bg-accent-soft text-ink" : "text-ink"
                      } ${isSelected ? "font-semibold" : ""}`}
                    >
                      <span className="min-w-0 flex-1 truncate">{option.label}</span>
                      {option.hint ? <span className="shrink-0 text-xs text-ink-muted">{option.hint}</span> : null}
                      <svg
                        viewBox="0 0 24 24"
                        className={`h-4 w-4 shrink-0 text-accent ${isSelected ? "" : "invisible"}`}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden
                      >
                        <path d="m5 12 5 5L20 7" />
                      </svg>
                    </div>
                  </li>
                );
              })}
            </ul>,
            document.body,
          )
        : null}
    </>
  );
}
