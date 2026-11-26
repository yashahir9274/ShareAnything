"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { createPortal } from "react-dom";

/* ---------------------------------------------------------------------------
   Compact editor toolbar pieces: dropdown menus that open on hover (mouse) or
   click/tap, menu items, a full colour picker, and the icons they use.
   Everything uses onMouseDown → preventDefault so the editor keeps its selection.
--------------------------------------------------------------------------- */

type MenuState = { open: string | null; pinned: boolean };
type MenuContextValue = { state: MenuState; setState: Dispatch<SetStateAction<MenuState>> };

const MenuContext = createContext<MenuContextValue | null>(null);

/** Wrap the toolbar: only one menu is open at a time. */
export function ToolbarMenus({ children }: { children: ReactNode }) {
  const [state, setState] = useState<MenuState>({ open: null, pinned: false });
  return <MenuContext.Provider value={{ state, setState }}>{children}</MenuContext.Provider>;
}

function useMenus() {
  const value = useContext(MenuContext);
  if (!value) throw new Error("ToolbarMenus missing");
  return value;
}

/** Closes whichever toolbar menu is open (for items inside a menu). */
export function useCloseMenu() {
  const { setState } = useMenus();
  return useCallback(() => setState({ open: null, pinned: false }), [setState]);
}

const HOVER_CLOSE_MS = 220;

export function ToolbarMenu({
  id,
  label,
  trigger,
  active = false,
  width = 220,
  children,
}: {
  id: string;
  /** Accessible name and tooltip. */
  label: string;
  /** What the button shows (icon / current value). A caret is added. */
  trigger: ReactNode;
  active?: boolean;
  width?: number;
  children: ReactNode;
}) {
  const { state, setState } = useMenus();
  const isOpen = state.open === id;
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<number | undefined>(undefined);
  const [position, setPosition] = useState<{ left: number; top?: number; bottom?: number; maxHeight: number } | null>(null);

  const place = useCallback(() => {
    const button = buttonRef.current;
    if (!button) return;
    const rect = button.getBoundingClientRect();
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
    const below = window.innerHeight - rect.bottom - 12;
    const above = rect.top - 12;
    // Open upward only when there's clearly more room above.
    setPosition(
      below < 260 && above > below
        ? { left, bottom: window.innerHeight - rect.top + 6, maxHeight: above }
        : { left, top: rect.bottom + 6, maxHeight: below },
    );
  }, [width]);

  const cancelClose = () => window.clearTimeout(closeTimer.current);
  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = window.setTimeout(() => {
      setState((current) => (current.open === id && !current.pinned ? { open: null, pinned: false } : current));
    }, HOVER_CLOSE_MS);
  };

  useEffect(() => () => window.clearTimeout(closeTimer.current), []);

  // Follow the button while scrolling/resizing; close on outside press or Escape.
  useEffect(() => {
    if (!isOpen) return;
    function onPointer(event: PointerEvent) {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setState({ open: null, pinned: false });
    }
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      setState({ open: null, pinned: false });
      buttonRef.current?.focus();
    }
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [isOpen, place, setState]);

  useLayoutEffect(() => {
    if (isOpen) place();
  }, [isOpen, place]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        title={label}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onPointerEnter={(event) => {
          if (event.pointerType !== "mouse") return;
          cancelClose();
          // Hovering opens it; moving between toolbar menus switches straight over.
          setState((current) => (current.open === id ? current : { open: id, pinned: false }));
        }}
        onPointerLeave={(event) => {
          if (event.pointerType === "mouse") scheduleClose();
        }}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          cancelClose();
          setState((current) =>
            current.open !== id
              ? { open: id, pinned: true }
              : current.pinned
                ? { open: null, pinned: false }
                : { open: id, pinned: true }, // opened by hover: a click keeps it open
          );
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setState({ open: id, pinned: true });
            requestAnimationFrame(() => panelRef.current?.querySelector<HTMLElement>("button, input")?.focus());
          }
        }}
        className={`inline-flex h-8 shrink-0 items-center gap-1 rounded-lg px-2 text-xs font-semibold transition ${
          isOpen
            ? "bg-surface text-ink ring-1 ring-line"
            : active
              ? "bg-accent-soft text-ink"
              : "text-ink-muted hover:bg-surface hover:text-ink"
        }`}
      >
        {trigger}
        <ChevronIcon className={`h-3 w-3 opacity-60 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {isOpen && position
        ? createPortal(
            <div
              ref={panelRef}
              role="menu"
              aria-label={label}
              onPointerEnter={cancelClose}
              onPointerLeave={(event) => {
                if (event.pointerType === "mouse") scheduleClose();
              }}
              // Using anything inside (e.g. the colour picker) keeps the menu open.
              onPointerDown={() => setState((current) => ({ ...current, pinned: true }))}
              style={{ left: position.left, top: position.top, bottom: position.bottom, width, maxHeight: position.maxHeight }}
              className="fixed z-[70] overflow-y-auto overscroll-contain rounded-2xl border border-line bg-surface p-1.5 text-ink shadow-[0_18px_48px_rgba(11,20,32,0.18)] animate-fade-up"
            >
              {children}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

/** A row in a toolbar menu. Runs the action and closes the menu. */
export function MenuItem({
  icon,
  label,
  hint,
  checked,
  onSelect,
  style,
}: {
  icon?: ReactNode;
  label: ReactNode;
  hint?: string;
  checked?: boolean;
  onSelect: () => void;
  style?: CSSProperties;
}) {
  const close = useCloseMenu();
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={checked ?? false}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => {
        onSelect();
        close();
      }}
      className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm transition hover:bg-paper focus-visible:bg-paper focus-visible:outline-none ${
        checked ? "font-semibold text-ink" : "text-ink"
      }`}
    >
      {icon ? <span className="flex h-5 w-5 shrink-0 items-center justify-center text-ink-muted">{icon}</span> : null}
      <span className="min-w-0 flex-1 truncate" style={style}>
        {label}
      </span>
      {hint ? <span className="shrink-0 text-[11px] text-ink-muted">{hint}</span> : null}
      <CheckIcon className={`h-4 w-4 shrink-0 text-accent ${checked ? "" : "invisible"}`} />
    </button>
  );
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <p className="px-2.5 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted first:pt-1">{children}</p>;
}

export function MenuSeparator() {
  return <div className="my-1 h-px bg-line" role="separator" />;
}

/** A small icon button on the toolbar (bold, link, …). */
export function ToolbarButton({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(event) => {
        event.preventDefault();
        if (!disabled) onClick();
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onClick();
        }
      }}
      className={`inline-flex h-8 min-w-8 shrink-0 items-center justify-center rounded-lg px-1.5 text-sm transition disabled:opacity-35 ${
        active ? "bg-strong text-on-strong" : "text-ink-muted hover:bg-surface hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

export function ToolbarDivider() {
  return <span className="mx-1 h-5 w-px shrink-0 bg-line" aria-hidden />;
}

/* ---- colour picker ------------------------------------------------------ */

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

function normalizeHex(value: string): string | null {
  const match = value.trim().match(HEX);
  if (!match) return null;
  let hex = match[1].toLowerCase();
  if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("");
  return `#${hex}`;
}

function readRecent(key: string): string[] {
  try {
    const list = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(list) ? list.filter((c) => typeof c === "string" && HEX.test(c)).slice(0, 10) : [];
  } catch {
    return [];
  }
}

function saveRecent(key: string, color: string) {
  try {
    const list = [color, ...readRecent(key).filter((c) => c !== color)].slice(0, 10);
    localStorage.setItem(key, JSON.stringify(list));
  } catch {
    // ignore
  }
}

/**
 * Preset palette + any colour (system picker and hex), recent colours and "none".
 * Picking a preset closes the menu; the custom picker applies when you confirm it.
 */
export function ColorPicker({
  palette,
  value,
  recentKey,
  clearLabel,
  onPick,
  onClear,
}: {
  palette: readonly (readonly string[])[];
  value: string;
  recentKey: string;
  clearLabel: string;
  onPick: (color: string) => void;
  onClear: () => void;
}) {
  const close = useCloseMenu();
  const [recent, setRecent] = useState<string[]>(() => readRecent(recentKey));
  const [draft, setDraft] = useState(() => normalizeHex(value) ?? "#ff5c35");
  const [hexText, setHexText] = useState(draft);
  const nativeRef = useRef<HTMLInputElement>(null);
  const current = normalizeHex(value);

  function apply(color: string, keepOpen = false) {
    const hex = normalizeHex(color);
    if (!hex) return;
    onPick(hex);
    saveRecent(recentKey, hex);
    setRecent(readRecent(recentKey));
    if (!keepOpen) close();
  }

  // The system picker fires "change" when you confirm a colour (and "input" while dragging).
  useEffect(() => {
    const input = nativeRef.current;
    if (!input) return;
    const onChange = () => apply(input.value, true);
    input.addEventListener("change", onChange);
    return () => input.removeEventListener("change", onChange);
  });

  const swatch = (color: string) => (
    <button
      key={color}
      type="button"
      title={color}
      aria-label={color}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => apply(color)}
      className={`h-[22px] w-[22px] rounded-md border transition hover:scale-110 focus-visible:outline-2 focus-visible:outline-accent ${
        current === color ? "border-ink ring-2 ring-accent/50" : "border-ink/15"
      }`}
      style={{ backgroundColor: color }}
    />
  );

  return (
    <div className="space-y-2.5 p-1">
      <div className="grid grid-cols-10 gap-1">{palette.flat().map(swatch)}</div>

      {recent.length ? (
        <div>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted">Recent</p>
          <div className="grid grid-cols-10 gap-1">{recent.map(swatch)}</div>
        </div>
      ) : null}

      <div className="rounded-xl border border-line bg-paper p-2">
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted">Custom colour</p>
        <div className="flex items-center gap-2">
          <label
            className="relative h-8 w-10 shrink-0 cursor-pointer overflow-hidden rounded-lg border border-line"
            style={{ backgroundColor: draft }}
            title="Pick any colour"
          >
            <input
              ref={nativeRef}
              type="color"
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value);
                setHexText(event.target.value);
              }}
              aria-label="Pick any colour"
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            />
          </label>
          <input
            type="text"
            value={hexText}
            onChange={(event) => {
              setHexText(event.target.value);
              const hex = normalizeHex(event.target.value);
              if (hex) setDraft(hex);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                apply(hexText);
              }
            }}
            spellCheck={false}
            maxLength={7}
            aria-label="Hex colour"
            placeholder="#ff5c35"
            className="h-8 min-w-0 flex-1 rounded-lg border border-line bg-surface px-2 font-mono text-xs text-ink outline-none focus:border-accent"
          />
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => apply(hexText)}
            disabled={!normalizeHex(hexText)}
            className="h-8 shrink-0 rounded-lg bg-strong px-3 text-xs font-semibold text-on-strong transition disabled:opacity-40"
          >
            Apply
          </button>
        </div>
      </div>

      <button
        type="button"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          onClear();
          close();
        }}
        className="flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left text-xs font-medium text-ink-muted transition hover:bg-paper hover:text-ink"
      >
        <span className="relative h-4 w-4 rounded border border-line">
          <span className="absolute left-1/2 top-[-2px] h-[20px] w-px -translate-x-1/2 rotate-45 bg-danger" />
        </span>
        {clearLabel}
      </button>
    </div>
  );
}

/* ---- icons --------------------------------------------------------------- */

type IconProps = { className?: string };

function Svg({ className = "h-4 w-4", children }: IconProps & { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {children}
    </svg>
  );
}

export const ChevronIcon = (p: IconProps) => <Svg {...p}><path d="m6 9 6 6 6-6" /></Svg>;
export const CheckIcon = (p: IconProps) => <Svg {...p}><path d="m5 12 5 5L20 7" /></Svg>;
export const UndoIcon = (p: IconProps) => <Svg {...p}><path d="M9 14 4 9l5-5" /><path d="M4 9h11a5 5 0 0 1 0 10h-3" /></Svg>;
export const RedoIcon = (p: IconProps) => <Svg {...p}><path d="m15 14 5-5-5-5" /><path d="M20 9H9a5 5 0 0 0 0 10h3" /></Svg>;
export const AlignLeftIcon = (p: IconProps) => <Svg {...p}><path d="M3 6h18M3 12h12M3 18h16" /></Svg>;
export const AlignCenterIcon = (p: IconProps) => <Svg {...p}><path d="M3 6h18M6 12h12M4 18h16" /></Svg>;
export const AlignRightIcon = (p: IconProps) => <Svg {...p}><path d="M3 6h18M9 12h12M5 18h16" /></Svg>;
export const AlignJustifyIcon = (p: IconProps) => <Svg {...p}><path d="M3 6h18M3 12h18M3 18h18" /></Svg>;
export const BulletListIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 6h12M9 12h12M9 18h12" />
    <path d="M4 6h.01M4 12h.01M4 18h.01" strokeWidth="3" />
  </Svg>
);
export const NumberListIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10 6h11M10 12h11M10 18h11" />
    <path d="M4 4h1v5M4 9h2M6 19H4c0-1.2 2-1.8 2-3a1 1 0 0 0-2-.3" strokeWidth="1.6" />
  </Svg>
);
export const LinkIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
  </Svg>
);
export const PlusIcon = (p: IconProps) => <Svg {...p}><path d="M12 5v14M5 12h14" /></Svg>;
export const ImageIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <circle cx="9" cy="9" r="2" />
    <path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21" />
  </Svg>
);
export const VideoIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="m16 13 5.2 3.5a.5.5 0 0 0 .8-.4V7.9a.5.5 0 0 0-.8-.4L16 10.5" />
    <rect x="2" y="6" width="14" height="12" rx="2" />
  </Svg>
);
export const YoutubeIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="2" y="5" width="20" height="14" rx="4" />
    <path d="m10 9 5 3-5 3z" />
  </Svg>
);
export const GlobeIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
  </Svg>
);
export const DividerIcon = (p: IconProps) => <Svg {...p}><path d="M3 12h18" /><path d="M8 7h8M8 17h8" strokeWidth="1.2" opacity=".5" /></Svg>;
export const HighlighterIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="m9 11-6 6v3h9l3-3" />
    <path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4" />
  </Svg>
);
export const MoreIcon = (p: IconProps) => <Svg {...p}><path d="M5 12h.01M12 12h.01M19 12h.01" strokeWidth="3" /></Svg>;
export const ClearFormatIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 7V4h16v3M9 20h6M12 4v16" />
    <path d="m15 15 5 5M20 15l-5 5" />
  </Svg>
);
export const QuoteIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7 7h4v4c0 3-2 5-4 6M14 7h4v4c0 3-2 5-4 6" />
  </Svg>
);
export const CodeBlockIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="m9 10-2 2 2 2M15 10l2 2-2 2" />
  </Svg>
);
