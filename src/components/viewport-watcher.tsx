"use client";

import { useEffect } from "react";

function isTyping(element: Element | null) {
  if (!element) return false;
  if (element instanceof HTMLTextAreaElement) return true;
  if (element instanceof HTMLInputElement) return !["checkbox", "radio", "button", "submit", "range", "file", "color"].includes(element.type);
  return (element as HTMLElement).isContentEditable;
}

/**
 * Phones: keeps the app exactly as tall as the part of the screen you can see, so the
 * on-screen keyboard never covers the message box or pushes the page around, and
 * marks <html class="kb-open"> while typing so the layout can make room.
 *
 * Sets --app-height / --app-top (the visible area) for `.app-frame` on touch screens.
 * --app-top follows iOS, which scrolls the page under the keyboard instead of resizing it.
 */
export function ViewportWatcher() {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport || !window.matchMedia("(pointer: coarse)").matches) return;
    const root = document.documentElement;

    // Tallest visible height seen per orientation = the height without a keyboard.
    const tallest = new Map<string, number>();
    const orientation = () =>
      (screen.orientation?.type.startsWith("landscape") ?? screen.width > screen.height) ? "landscape" : "portrait";

    let frame = 0;
    function update() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        // Pinch-zoom also shrinks the visual viewport; undo that so only the keyboard counts.
        const height = viewport!.height * viewport!.scale;
        const key = orientation();
        const full = Math.max(tallest.get(key) ?? 0, height, window.innerHeight);
        tallest.set(key, full);

        root.style.setProperty("--app-height", `${Math.round(height)}px`);
        root.style.setProperty("--app-top", `${Math.round(viewport!.offsetTop)}px`);
        // Keyboard: typing somewhere and the visible area lost a big chunk of the screen.
        const keyboard = isTyping(document.activeElement) && height < full * 0.8;
        root.classList.toggle("kb-open", keyboard);
      });
    }

    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    window.addEventListener("orientationchange", update);
    document.addEventListener("focusin", update);
    document.addEventListener("focusout", update);
    return () => {
      cancelAnimationFrame(frame);
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
      window.removeEventListener("orientationchange", update);
      document.removeEventListener("focusin", update);
      document.removeEventListener("focusout", update);
      root.classList.remove("kb-open");
      root.style.removeProperty("--app-height");
      root.style.removeProperty("--app-top");
    };
  }, []);
  return null;
}
