"use client";

import { useSyncExternalStore } from "react";

/** Light / Dark / System (follows the device). Default: System. */
export type ThemePreference = "system" | "light" | "dark";

import { THEME_EVENT, THEME_KEY } from "@/lib/theme-boot";

export { THEME_EVENT, THEME_KEY };

function systemPrefersDark() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function getThemePreference(): ThemePreference {
  try {
    const value = localStorage.getItem(THEME_KEY);
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return "system";
  }
}

/** The theme actually on screen. */
export function resolvedTheme(): "light" | "dark" {
  const preference = getThemePreference();
  return preference === "dark" || (preference === "system" && systemPrefersDark()) ? "dark" : "light";
}

function apply() {
  const theme = resolvedTheme();
  const root = document.documentElement;
  if (root.dataset.theme !== theme) {
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
  }
  window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: theme }));
}

export function setThemePreference(preference: ThemePreference) {
  try {
    if (preference === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, preference);
  } catch {
    // ignore
  }
  apply();
}

function subscribe(onChange: () => void) {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  // Follow the device when on "System"; follow other tabs when they change it.
  const onSystem = () => {
    if (getThemePreference() === "system") apply();
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key === THEME_KEY) apply();
  };
  media.addEventListener("change", onSystem);
  window.addEventListener("storage", onStorage);
  window.addEventListener(THEME_EVENT, onChange);
  return () => {
    media.removeEventListener("change", onSystem);
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(THEME_EVENT, onChange);
  };
}

export function useThemePreference(): ThemePreference {
  return useSyncExternalStore(subscribe, getThemePreference, () => "system" as ThemePreference);
}

/** Keeps "System" in sync with the device while the page is open. */
export function watchSystemTheme() {
  return subscribe(() => {});
}
