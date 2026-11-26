/** Shared by the server layout (inline script) and the client theme code. */

export const THEME_KEY = "shareanything:theme";
export const THEME_EVENT = "shareanything:theme-change";

/**
 * Runs in <head> before the page paints, so dark-mode users never see a white flash.
 * Plain string (no imports) because it's inlined into the HTML.
 */
export const THEME_BOOT_SCRIPT = `(function(){try{var p=localStorage.getItem("${THEME_KEY}")||"system";var d=p==="dark"||(p==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);var r=document.documentElement;r.dataset.theme=d?"dark":"light";r.style.colorScheme=d?"dark":"light";}catch(e){}})();`;
