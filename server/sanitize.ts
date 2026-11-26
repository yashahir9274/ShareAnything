import sanitizeHtml from "sanitize-html";

const HEX_COLOR = /^#[0-9a-f]{3,8}$/i;
const RGB_COLOR = /^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*(0|1|0?\.\d+)\s*)?\)$/i;
const FONT_FAMILY = /^[\w\s,"'()-]{1,120}$/;
const FONT_SIZE = /^\d{1,3}(\.\d+)?(px|em|rem|%)$/;

const colorStyles = [HEX_COLOR, RGB_COLOR, /^inherit$/];

/**
 * Allow only the markup the TipTap editor produces. Anything else (scripts,
 * event handlers, javascript: URLs, foreign iframes, arbitrary styles) is dropped
 * before a note is stored or sent to other viewers.
 */
const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    "p", "br", "h1", "h2", "h3", "strong", "b", "em", "i", "u", "s",
    "code", "pre", "blockquote", "ul", "ol", "li", "a", "hr", "span",
    "mark", "img", "video", "div", "iframe",
  ],
  allowedAttributes: {
    a: ["href", "target", "rel"],
    img: ["src", "alt", "title", "width", "height", "class"],
    video: ["src", "controls", "class"],
    iframe: ["src", "width", "height", "allowfullscreen", "frameborder", "allow"],
    div: ["data-youtube-video", "class"],
    mark: ["data-color", "style"],
    ol: ["start", "type"],
    code: ["class"],
    "*": ["style"],
  },
  allowedClasses: {
    img: ["editor-image"],
    video: ["editor-video"],
    div: ["editor-youtube"],
    code: ["language-*"],
  },
  allowedStyles: {
    "*": {
      "text-align": [/^(left|right|center|justify)$/],
      color: colorStyles,
      "background-color": colorStyles,
      "font-family": [FONT_FAMILY],
      "font-size": [FONT_SIZE],
    },
  },
  allowedSchemes: ["http", "https", "mailto"],
  allowedSchemesByTag: {
    // data: images are kept only so notes saved before uploads existed still render.
    img: ["http", "https", "data"],
    video: ["http", "https"],
    iframe: ["https"],
  },
  allowProtocolRelative: false,
  allowedIframeHostnames: [
    "www.youtube-nocookie.com",
    "youtube-nocookie.com",
    "www.youtube.com",
    "youtube.com",
  ],
  transformTags: {
    a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer nofollow" }),
  },
};

export function sanitizeNoteHtml(html: string): string {
  return sanitizeHtml(html, OPTIONS);
}
