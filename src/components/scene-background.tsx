"use client";

import { useEffect, useRef } from "react";

/**
 * Page background. The gradient is plain CSS and shows immediately; the
 * Three.js "share network" is loaded separately after the page is up, so it
 * never delays the editor. Without WebGL, the gradient alone remains.
 */
export function SceneBackground() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    let cleanup: (() => void) | undefined;

    const load = () =>
      import("./scene/share-network-scene")
        .then(({ createShareNetworkScene }) => {
          if (disposed) return;
          cleanup = createShareNetworkScene(host, () => {
            host.dataset.ready = "true";
          });
        })
        .catch(() => {
          // No WebGL or failed chunk: keep the static gradient.
        });

    // Let the editor finish loading first.
    const idle = window.requestIdleCallback
      ? window.requestIdleCallback(() => void load(), { timeout: 1500 })
      : window.setTimeout(() => void load(), 300);

    return () => {
      disposed = true;
      if (window.cancelIdleCallback) window.cancelIdleCallback(idle);
      else window.clearTimeout(idle);
      cleanup?.();
    };
  }, []);

  return (
    <div className="scene" aria-hidden="true">
      <div ref={hostRef} className="scene-canvas" />
    </div>
  );
}
