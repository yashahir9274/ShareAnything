import { getSchema } from "@tiptap/core";
import * as Y from "yjs";
import {
  BODY_FIELD,
  META_FIELD,
  TITLE_FIELD,
  createEditorExtensions,
} from "../src/lib/editor-extensions";
import { NOTE_LIMITS } from "../src/lib/note-types";

/**
 * Checks a note's Yjs document before the server accepts a change. Viewers
 * render whatever is in the shared doc, so this is where hostile content
 * (javascript: links, CSS injection, unknown node types) gets stopped.
 */

const schema = getSchema(createEditorExtensions());
const NODE_NAMES = new Set(Object.keys(schema.nodes));
const MARK_NAMES = new Set(Object.keys(schema.marks));
const ROOT_FIELDS = new Set([BODY_FIELD, TITLE_FIELD, META_FIELD]);
const META_KEYS: Record<string, (value: unknown) => boolean> = {
  monospace: (value) => typeof value === "boolean",
};

/** A CSS value that cannot break out of its declaration or load anything. */
function isSafeCssValue(value: unknown) {
  if (value === null || value === undefined) return true;
  if (typeof value !== "string" || value.length > 120) return false;
  return !/[;{}<>\\]/.test(value) && !/url\s*\(|expression\s*\(|@import/i.test(value);
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isUploadPath(value: string) {
  return (
    /^\/api\/uploads\/[a-f0-9]{32}\.[a-z0-9]{2,4}$/.test(value) ||
    /^\/api\/files\/[a-f0-9]{32}\/raw$/.test(value)
  );
}

const URL_RULES: Record<string, (value: string) => boolean> = {
  image: (src) => isHttpUrl(src) || isUploadPath(src) || /^data:image\/[a-z0-9.+-]+;base64,/i.test(src),
  video: (src) => isHttpUrl(src) || isUploadPath(src),
  youtube: (src) =>
    isHttpUrl(src) && /^(www\.|m\.)?(youtube\.com|youtube-nocookie\.com|youtu\.be)$/i.test(new URL(src).hostname),
};

function isSafeHref(href: unknown) {
  if (href === null || href === undefined || href === "") return true;
  if (typeof href !== "string" || href.length > 2048) return false;
  if (href.startsWith("/") && !href.startsWith("//")) return true;
  if (href.startsWith("#")) return true;
  try {
    return ["http:", "https:", "mailto:"].includes(new URL(href).protocol);
  } catch {
    return false;
  }
}

function checkPrimitive(value: unknown) {
  return (
    value === null ||
    value === undefined ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value)) ||
    (typeof value === "string" && value.length <= 4096)
  );
}

function checkNodeAttrs(nodeName: string, attrs: Record<string, unknown>): string | null {
  for (const [key, value] of Object.entries(attrs)) {
    if (key === "src") {
      if (value === null || value === undefined) continue;
      const rule = URL_RULES[nodeName];
      if (typeof value !== "string" || !rule || value.length > 10 * 1024 * 1024 || !rule(value)) {
        return `Blocked ${nodeName} source`;
      }
      continue;
    }
    if (key === "textAlign") {
      if (value !== null && !["left", "center", "right", "justify"].includes(String(value))) {
        return "Invalid alignment";
      }
      continue;
    }
    if (!checkPrimitive(value)) return `Invalid ${nodeName} attribute`;
  }
  return null;
}

function checkMark(rawName: string, attrs: unknown): string | null {
  // y-prosemirror suffixes overlapping marks with --<hash>.
  const name = rawName.split("--")[0];
  if (!MARK_NAMES.has(name)) return `Unknown formatting: ${name}`;
  if (attrs === null || attrs === undefined || attrs === true) return null;
  if (typeof attrs !== "object") return "Invalid formatting";
  for (const [key, value] of Object.entries(attrs as Record<string, unknown>)) {
    if (name === "link" && key === "href") {
      if (!isSafeHref(value)) return "Blocked link";
      continue;
    }
    if (["color", "fontFamily", "fontSize", "backgroundColor"].includes(key)) {
      if (!isSafeCssValue(value)) return "Blocked style";
      continue;
    }
    if (!checkPrimitive(value)) return "Invalid formatting";
  }
  return null;
}

function checkText(text: Y.XmlText): string | null {
  for (const op of text.toDelta() as Array<{ insert: unknown; attributes?: Record<string, unknown> }>) {
    if (typeof op.insert !== "string") return "Unsupported embedded content";
    for (const [mark, attrs] of Object.entries(op.attributes ?? {})) {
      const error = checkMark(mark, attrs);
      if (error) return error;
    }
  }
  return null;
}

function checkFragment(fragment: Y.XmlFragment | Y.XmlElement, depth: number): string | null {
  if (depth > 64) return "Document is nested too deeply";
  for (const child of fragment.toArray()) {
    if (child instanceof Y.XmlText) {
      const error = checkText(child);
      if (error) return error;
    } else if (child instanceof Y.XmlElement) {
      if (!NODE_NAMES.has(child.nodeName)) return `Unknown block: ${child.nodeName}`;
      const error =
        checkNodeAttrs(child.nodeName, child.getAttributes() as Record<string, unknown>) ??
        checkFragment(child, depth + 1);
      if (error) return error;
    } else {
      return "Unsupported content";
    }
  }
  return null;
}

/** Returns an error message if the document holds anything the editor schema doesn't allow. */
export function validateNoteDoc(doc: Y.Doc): string | null {
  for (const name of doc.share.keys()) {
    if (!ROOT_FIELDS.has(name)) return `Unknown field: ${name}`;
  }
  const title = doc.getText(TITLE_FIELD);
  if (title.length > NOTE_LIMITS.titleMax) return "Title is too long";
  for (const op of title.toDelta() as Array<{ insert: unknown; attributes?: object }>) {
    if (typeof op.insert !== "string" || op.attributes) return "Invalid title";
  }
  const meta = doc.getMap(META_FIELD);
  for (const [key, value] of meta.entries()) {
    const check = META_KEYS[key];
    if (!check || !check(value)) return `Invalid setting: ${key}`;
  }
  return checkFragment(doc.getXmlFragment(BODY_FIELD), 0);
}

export { schema as editorSchema };
