/** Types and helpers for the per-note media manager, shared by client and server. */

export type FileKind =
  | "image"
  | "video"
  | "audio"
  | "pdf"
  | "code"
  | "text"
  | "document"
  | "archive"
  | "other";

/** A file stored in a note's media manager. */
export type NoteFile = {
  id: string;
  name: string;
  mime: string;
  size: number;
  kind: FileKind;
  createdAt: string;
  /** Display name of whoever uploaded it, if they had set one. */
  uploadedBy?: string;
};

export type FilesUsage = {
  used: number;
  quota: number;
  count: number;
  maxCount: number;
  maxFileSize: number;
};

export type FileEvent =
  | { noteId: string; type: "added"; file: NoteFile; usage: FilesUsage; uploaderId?: string; viaChat?: boolean }
  | { noteId: string; type: "updated"; file: NoteFile }
  | { noteId: string; type: "removed"; fileId: string; usage: FilesUsage };

export const FILE_ID_PATTERN = /^[a-f0-9]{32}$/;

export function isValidFileId(id: unknown): id is string {
  return typeof id === "string" && FILE_ID_PATTERN.test(id);
}

export function fileRawUrl(id: string, download = false) {
  return `/api/files/${id}/raw${download ? "?download=1" : ""}`;
}

export function fileShareUrl(origin: string, id: string) {
  return `${origin}/f/${id}`;
}

const EXT_KIND: Record<string, FileKind> = {};
const add = (kind: FileKind, exts: string) => exts.split(" ").forEach((ext) => (EXT_KIND[ext] = kind));
add("image", "png jpg jpeg gif webp avif bmp ico svg");
add("video", "mp4 webm ogv mov m4v");
add("audio", "mp3 wav ogg oga m4a aac flac opus");
add("pdf", "pdf");
add("text", "txt log");
add("document", "doc docx odt rtf xls xlsx ods ppt pptx odp pages numbers key epub");
add("archive", "zip rar 7z tar gz tgz bz2 xz");
add(
  "code",
  "js mjs cjs jsx ts tsx json jsonc md mdx css scss sass less html htm xml yml yaml toml ini env " +
    "py rb php java kt kts swift go rs c h cc cpp hpp cs fs vb lua r dart scala sh bash zsh ps1 bat cmd " +
    "sql graphql gql vue svelte astro dockerfile makefile gradle csv tsv diff patch",
);

/** Language names understood by highlight.js, by extension. */
const EXT_LANGUAGE: Record<string, string> = {
  js: "javascript", mjs: "javascript", cjs: "javascript", jsx: "javascript",
  ts: "typescript", tsx: "typescript", json: "json", jsonc: "json",
  md: "markdown", mdx: "markdown", css: "css", scss: "scss", sass: "scss", less: "less",
  html: "xml", htm: "xml", xml: "xml", svg: "xml", vue: "xml", svelte: "xml", astro: "xml",
  yml: "yaml", yaml: "yaml", toml: "ini", ini: "ini", env: "ini",
  py: "python", rb: "ruby", php: "php", java: "java", kt: "kotlin", kts: "kotlin",
  swift: "swift", go: "go", rs: "rust", c: "c", h: "c", cc: "cpp", cpp: "cpp", hpp: "cpp",
  cs: "csharp", vb: "vbnet", lua: "lua", r: "r", dart: "dart", scala: "scala",
  sh: "bash", bash: "bash", zsh: "bash", ps1: "powershell", bat: "dos", cmd: "dos",
  sql: "sql", graphql: "graphql", gql: "graphql", dockerfile: "dockerfile", makefile: "makefile",
  gradle: "gradle", diff: "diff", patch: "diff", csv: "plaintext", tsv: "plaintext",
  txt: "plaintext", log: "plaintext",
};

export function fileExtension(name: string) {
  const lower = name.toLowerCase();
  if (lower === "dockerfile" || lower === "makefile") return lower;
  const dot = lower.lastIndexOf(".");
  return dot > 0 ? lower.slice(dot + 1) : "";
}

export function detectFileKind(name: string, mime: string): FileKind {
  const byExt = EXT_KIND[fileExtension(name)];
  if (byExt) return byExt;
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (mime === "application/pdf") return "pdf";
  if (mime.startsWith("text/")) return "text";
  return "other";
}

export function codeLanguage(name: string): string | undefined {
  return EXT_LANGUAGE[fileExtension(name)];
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

/** Strips path parts and control characters from a user-supplied file name. */
export function cleanFileName(name: string) {
  const base = name.split(/[\\/]/).pop() ?? "";
  const cleaned = base.replace(/[\u0000-\u001f\u007f<>:"|?*]/g, "").trim().slice(0, 180);
  return cleaned && cleaned !== "." && cleaned !== ".." ? cleaned : "file";
}

/** Can be embedded in the document editor. */
export function isEmbeddableKind(kind: FileKind) {
  return kind === "image" || kind === "video";
}
