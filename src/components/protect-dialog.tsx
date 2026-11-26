"use client";

import { useState } from "react";
import { useDialogs } from "@/components/dialogs";
import { Modal } from "@/components/media/modal";
import { SelectMenu, type SelectOption } from "@/components/ui/select-menu";
import { NOTE_LIMITS } from "@/lib/note-types";

const PRESETS: Array<{ label: string; minutes: number | null; group?: string }> = [
  { label: "Never", minutes: null },
  { label: "5 minutes", minutes: 5, group: "Minutes" },
  { label: "10 minutes", minutes: 10, group: "Minutes" },
  { label: "15 minutes", minutes: 15, group: "Minutes" },
  { label: "30 minutes", minutes: 30, group: "Minutes" },
  { label: "45 minutes", minutes: 45, group: "Minutes" },
  { label: "1 hour", minutes: 60, group: "Hours" },
  { label: "2 hours", minutes: 120, group: "Hours" },
  { label: "3 hours", minutes: 180, group: "Hours" },
  { label: "4 hours", minutes: 240, group: "Hours" },
  { label: "6 hours", minutes: 360, group: "Hours" },
  { label: "8 hours", minutes: 480, group: "Hours" },
  { label: "12 hours", minutes: 720, group: "Hours" },
  { label: "1 day", minutes: 1440, group: "Days" },
  { label: "2 days", minutes: 2880, group: "Days" },
  { label: "7 days", minutes: 10080, group: "Days" },
];

const RELOCK_OPTIONS: SelectOption[] = [
  ...PRESETS.map((preset, index) => ({ value: String(index), label: preset.label, group: preset.group })),
  { value: "custom", label: "Custom…", group: "Custom", hint: "Any time up to 30 days" },
];

type Unit = "minutes" | "hours" | "days";
const UNIT_MINUTES: Record<Unit, number> = { minutes: 1, hours: 60, days: 1440 };

/** "1 hour 30 minutes", "2 days" … */
export function describeMinutes(total: number) {
  const days = Math.floor(total / 1440);
  const hours = Math.floor((total % 1440) / 60);
  const minutes = total % 60;
  const parts = [
    days ? `${days} day${days === 1 ? "" : "s"}` : "",
    hours ? `${hours} hour${hours === 1 ? "" : "s"}` : "",
    minutes ? `${minutes} minute${minutes === 1 ? "" : "s"}` : "",
  ].filter(Boolean);
  return parts.join(" ") || "0 minutes";
}

function initialChoice(relock: number | null) {
  const preset = PRESETS.findIndex((p) => p.minutes === relock);
  if (preset >= 0) return { choice: String(preset), amount: "1", unit: "hours" as Unit };
  const minutes = relock ?? 60;
  const unit: Unit = minutes % 1440 === 0 ? "days" : minutes % 60 === 0 ? "hours" : "minutes";
  return { choice: "custom", amount: String(minutes / UNIT_MINUTES[unit]), unit };
}

export function ProtectDialog({
  locked,
  relockMinutes,
  onSave,
  onRemove,
  onClose,
}: {
  locked: boolean;
  relockMinutes: number | null;
  /** password undefined = keep the current one. Resolves to an error message or null. */
  onSave: (password: string | undefined, relockMinutes: number | null) => Promise<string | null>;
  onRemove: () => Promise<string | null>;
  onClose: () => void;
}) {
  const dialogs = useDialogs();
  const initial = initialChoice(relockMinutes);
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [choice, setChoice] = useState(initial.choice);
  const [amount, setAmount] = useState(initial.amount);
  const [unit, setUnit] = useState<Unit>(initial.unit);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  function chosenMinutes(): number | null | "invalid" {
    if (choice !== "custom") return PRESETS[Number(choice)].minutes;
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) return "invalid";
    const minutes = Math.round(value * UNIT_MINUTES[unit]);
    return minutes >= 1 && minutes <= NOTE_LIMITS.relockMaxMinutes ? minutes : "invalid";
  }

  const minutes = chosenMinutes();

  async function save() {
    const trimmed = password.trim();
    if (!locked && !trimmed) return setError("Choose a password.");
    if (minutes === "invalid") return setError("Pick a time between 1 minute and 30 days.");
    setSaving(true);
    setError("");
    const problem = await onSave(trimmed || undefined, minutes);
    setSaving(false);
    if (problem) setError(problem);
    else onClose();
  }

  async function remove() {
    const ok = await dialogs.confirm({
      title: "Remove protection?",
      message: "Anyone with the link will be able to open this note without a password.",
      confirmLabel: "Remove",
      danger: true,
    });
    if (!ok) return;
    const problem = await onRemove();
    if (problem) setError(problem);
    else onClose();
  }

  return (
    <Modal title={locked ? "Password protection" : "Protect this note"} size="sm" onClose={onClose}>
      <form
        noValidate
        className="space-y-5 p-5 sm:p-6"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <label className="block text-xs font-medium uppercase tracking-[0.14em] text-ink-muted">
          {locked ? "New password" : "Password"}
          <span className="mt-2 flex items-center rounded-2xl border border-line bg-surface focus-within:border-accent">
            <input
              data-autofocus
              type={show ? "text" : "password"}
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                setError("");
              }}
              maxLength={NOTE_LIMITS.passwordMax}
              autoComplete="new-password"
              placeholder={locked ? "Leave blank to keep the current password" : "Anyone with the link will need this"}
              className="min-w-0 flex-1 bg-transparent px-4 py-3 text-sm normal-case tracking-normal text-ink outline-none placeholder:text-ink-muted/70"
            />
            <button
              type="button"
              onClick={() => setShow((value) => !value)}
              className="mr-1.5 rounded-xl px-2.5 py-1.5 text-xs font-medium normal-case tracking-normal text-ink-muted transition hover:bg-paper hover:text-ink"
            >
              {show ? "Hide" : "Show"}
            </button>
          </span>
        </label>

        <div>
          <p className="block text-xs font-medium uppercase tracking-[0.14em] text-ink-muted">Lock again after</p>
          <div className="mt-2">
            <SelectMenu
              id="relock-choice"
              label="Lock again after"
              options={RELOCK_OPTIONS}
              value={choice}
              onChange={(next) => {
                setChoice(next);
                setError("");
              }}
            />
          </div>
          {choice === "custom" ? (
            <div className="mt-2 flex gap-2">
              <input
                type="number"
                min={1}
                step="any"
                value={amount}
                onChange={(event) => {
                  setAmount(event.target.value);
                  setError("");
                }}
                aria-label="Custom time"
                className="w-24 rounded-2xl border border-line bg-surface px-4 py-3 text-sm text-ink outline-none transition focus:border-accent focus:ring-4 focus:ring-accent/15"
              />
              <div role="radiogroup" aria-label="Unit" className="flex flex-1 rounded-2xl border border-line bg-paper p-1">
                {(["minutes", "hours", "days"] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    role="radio"
                    aria-checked={unit === option}
                    onClick={() => {
                      setUnit(option);
                      setError("");
                    }}
                    className={`flex-1 rounded-xl px-2 text-sm capitalize transition ${
                      unit === option ? "bg-surface font-semibold text-ink shadow-sm" : "text-ink-muted hover:text-ink"
                    }`}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          <p className="mt-2 text-xs leading-5 text-ink-muted">
            {minutes === null
              ? "Once someone unlocks the note, it stays open for them until they close the tab."
              : minutes === "invalid"
                ? "Pick a time between 1 minute and 30 days."
                : `${describeMinutes(minutes)} after unlocking, everyone — including you — has to enter the password again.`}
          </p>
        </div>

        {error ? <p className="text-sm text-danger">{error}</p> : null}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            {locked ? (
              <button
                type="button"
                onClick={() => void remove()}
                className="rounded-full px-3 py-2.5 text-sm font-medium text-danger transition hover:bg-danger/10"
              >
                Remove protection
              </button>
            ) : null}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full px-4 py-2.5 text-sm font-medium text-ink-muted transition hover:text-ink"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-105 disabled:opacity-50"
            >
              {saving ? "Saving…" : locked ? "Save" : "Protect note"}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
