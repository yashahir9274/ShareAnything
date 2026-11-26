"use client";

import { useEffect } from "react";
import { watchSystemTheme } from "@/lib/theme";

/** Keeps "System" theme in step with the device (and other tabs) on every page. */
export function ThemeWatcher() {
  useEffect(() => watchSystemTheme(), []);
  return null;
}
