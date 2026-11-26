"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Modal } from "@/components/media/modal";

/**
 * In-app replacements for window.prompt / confirm / alert. Browser dialogs are
 * blocked in some browsers and embedded views ("prompt() is not supported"),
 * and they freeze the page; these don't.
 */

export type PromptOptions = {
  title: string;
  label?: string;
  defaultValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  inputType?: "text" | "url";
  /** Return an error message to keep the dialog open. */
  validate?: (value: string) => string | null;
  /** Extra button that resolves with a fixed value (e.g. "Remove link" → ""). */
  extraAction?: { label: string; value: string };
};

export type ConfirmOptions = {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
};

type Notice = { id: number; message: string; tone: "error" | "info" };

type DialogApi = {
  prompt: (options: PromptOptions) => Promise<string | null>;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  notify: (message: string, tone?: Notice["tone"]) => void;
};

const DialogContext = createContext<DialogApi | null>(null);

export function useDialogs(): DialogApi {
  const api = useContext(DialogContext);
  if (!api) throw new Error("useDialogs must be used inside <DialogProvider>");
  return api;
}

type Active =
  | { kind: "prompt"; options: PromptOptions; resolve: (value: string | null) => void }
  | { kind: "confirm"; options: ConfirmOptions; resolve: (value: boolean) => void };

export function DialogProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<Active | null>(null);
  const [notices, setNotices] = useState<Notice[]>([]);
  const noticeId = useRef(0);

  const prompt = useCallback(
    (options: PromptOptions) =>
      new Promise<string | null>((resolve) => setActive({ kind: "prompt", options, resolve })),
    [],
  );
  const confirm = useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => setActive({ kind: "confirm", options, resolve })),
    [],
  );
  const notify = useCallback((message: string, tone: Notice["tone"] = "info") => {
    const id = (noticeId.current += 1);
    setNotices((current) => [...current, { id, message, tone }]);
    window.setTimeout(() => setNotices((current) => current.filter((n) => n.id !== id)), 5000);
  }, []);

  const api = useMemo(() => ({ prompt, confirm, notify }), [prompt, confirm, notify]);

  function close(value: string | boolean | null) {
    if (!active) return;
    if (active.kind === "prompt") active.resolve(value as string | null);
    else active.resolve(Boolean(value));
    setActive(null);
  }

  return (
    <DialogContext.Provider value={api}>
      {children}

      {active?.kind === "prompt" ? (
        <PromptDialog options={active.options} onDone={(value) => close(value)} />
      ) : null}

      {active?.kind === "confirm" ? (
        <Modal title={active.options.title} size="sm" onClose={() => close(false)}>
          <div className="space-y-5 p-5 sm:p-6">
            <div className="text-sm leading-6 text-ink-muted">{active.options.message}</div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => close(false)}
                className="rounded-full px-4 py-2.5 text-sm font-medium text-ink-muted transition hover:text-ink"
              >
                Cancel
              </button>
              <button
                type="button"
                data-autofocus
                onClick={() => close(true)}
                className={`rounded-full px-5 py-2.5 text-sm font-semibold transition ${
                  active.options.danger ? "bg-danger text-white hover:brightness-110" : "bg-strong text-on-strong hover:bg-strong/90"
                }`}
              >
                {active.options.confirmLabel ?? "OK"}
              </button>
            </div>
          </div>
        </Modal>
      ) : null}

      {notices.length ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4" role="status" aria-live="polite">
          {notices.map((notice) => (
            <div
              key={notice.id}
              className={`pointer-events-auto max-w-md rounded-2xl px-4 py-3 text-sm shadow-lg animate-fade-up ${
                notice.tone === "error" ? "bg-danger text-white" : "bg-strong text-on-strong"
              }`}
            >
              {notice.message}
            </div>
          ))}
        </div>
      ) : null}
    </DialogContext.Provider>
  );
}

function PromptDialog({ options, onDone }: { options: PromptOptions; onDone: (value: string | null) => void }) {
  const [value, setValue] = useState(options.defaultValue ?? "");
  const [error, setError] = useState("");

  function submit() {
    const trimmed = value.trim();
    const problem = options.validate?.(trimmed) ?? null;
    if (problem) {
      setError(problem);
      return;
    }
    onDone(trimmed);
  }

  return (
    <Modal title={options.title} size="sm" onClose={() => onDone(null)}>
      <form
        noValidate
        className="space-y-4 p-5 sm:p-6"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <label className="block text-xs font-medium uppercase tracking-[0.14em] text-ink-muted">
          {options.label ?? options.title}
          <input
            data-autofocus
            // Plain text: the browser's own URL check would reject "example.com" before ours runs.
            type="text"
            inputMode={options.inputType === "url" ? "url" : undefined}
            autoComplete="off"
            spellCheck={false}
            value={value}
            placeholder={options.placeholder}
            onChange={(event) => {
              setValue(event.target.value);
              setError("");
            }}
            className="mt-2 w-full rounded-2xl border border-line bg-surface px-4 py-3 text-sm normal-case tracking-normal text-ink outline-none transition focus:border-accent"
          />
        </label>
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <div className="flex items-center justify-between gap-2">
          <div>
            {options.extraAction ? (
              <button
                type="button"
                onClick={() => onDone(options.extraAction!.value)}
                className="rounded-full px-3 py-2.5 text-sm font-medium text-danger transition hover:bg-danger/10"
              >
                {options.extraAction.label}
              </button>
            ) : null}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onDone(null)}
              className="rounded-full px-4 py-2.5 text-sm font-medium text-ink-muted transition hover:text-ink"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-105"
            >
              {options.confirmLabel ?? "OK"}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
