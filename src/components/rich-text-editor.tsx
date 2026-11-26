"use client";

import Collaboration from "@tiptap/extension-collaboration";
import Placeholder from "@tiptap/extension-placeholder";
import type { EditorView } from "@tiptap/pm/view";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import type { Editor } from "@tiptap/react";
import { useEffect, useRef, type ChangeEvent, type ReactNode } from "react";
import type * as Y from "yjs";
import { useDialogs } from "@/components/dialogs";
import { BODY_FIELD, createEditorExtensions } from "@/lib/editor-extensions";
import { isSafeMediaUrl } from "@/lib/upload-rules";

export type EditorStats = {
  words: number;
  chars: number;
};

/** Stores a dropped/pasted/picked file and returns the URL to embed. */
export type UploadFn = (file: File) => Promise<string>;

type RichTextEditorProps = {
  doc: Y.Doc;
  monospace?: boolean;
  onStats?: (stats: EditorStats) => void;
  /** Where images/videos added in the editor are stored (the note's Files). */
  uploadFile: UploadFn;
  onEditorReady?: (editor: Editor | null) => void;
};

const FONT_FAMILIES = [
  { label: "Default", value: "" },
  { label: "Jakarta", value: "var(--font-jakarta), sans-serif" },
  { label: "Fraunces", value: "var(--font-fraunces), Georgia, serif" },
  { label: "Plex Mono", value: "var(--font-plex), monospace" },
  { label: "Arial", value: "Arial, Helvetica, sans-serif" },
  { label: "Georgia", value: "Georgia, serif" },
  { label: "Times", value: '"Times New Roman", Times, serif' },
  { label: "Verdana", value: "Verdana, Geneva, sans-serif" },
  { label: "Courier", value: '"Courier New", Courier, monospace' },
] as const;

const FONT_SIZES = [
  "12px",
  "14px",
  "16px",
  "18px",
  "20px",
  "24px",
  "28px",
  "32px",
  "36px",
  "48px",
] as const;

const TEXT_COLORS = [
  "#0b1420",
  "#5a6675",
  "#ff5c35",
  "#0f766e",
  "#c2410c",
  "#1d4ed8",
  "#7c3aed",
  "#be185d",
  "#ffffff",
] as const;

const HIGHLIGHT_COLORS = [
  "#ffe8e1",
  "#d9f3ef",
  "#fef3c7",
  "#dbeafe",
  "#f3e8ff",
  "#fce7f3",
  "#e2e8f0",
] as const;

function ToolbarButton({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(event) => {
        event.preventDefault();
        onClick();
      }}
      className={`inline-flex h-8 min-w-8 items-center justify-center rounded-lg px-2 text-xs font-semibold transition disabled:opacity-35 ${
        active
          ? "bg-ink text-white"
          : "bg-transparent text-ink-muted hover:bg-white hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

function ToolbarDivider() {
  return <span className="mx-0.5 h-5 w-px shrink-0 bg-line" aria-hidden />;
}

function ToolbarSelect({
  label,
  value,
  onChange,
  children,
  className = "",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className="sr-only-group inline-flex items-center" title={label}>
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onMouseDown={(event) => event.stopPropagation()}
        onChange={(event) => onChange(event.target.value)}
        className={`h-8 rounded-lg border border-line bg-white px-2 text-xs text-ink outline-none transition focus:border-accent ${className}`}
      >
        {children}
      </select>
    </label>
  );
}

function ColorSwatch({
  label,
  colors,
  value,
  onPick,
  onClear,
}: {
  label: string;
  colors: readonly string[];
  value?: string;
  onPick: (color: string) => void;
  onClear: () => void;
}) {
  return (
    <div className="inline-flex items-center gap-1 rounded-lg border border-line bg-white px-1.5 py-1">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
        {label}
      </span>
      {colors.map((color) => (
        <button
          key={color}
          type="button"
          title={color}
          aria-label={`${label} ${color}`}
          onMouseDown={(event) => {
            event.preventDefault();
            onPick(color);
          }}
          className={`h-4 w-4 rounded-full border transition ${
            value === color ? "border-ink scale-110" : "border-black/10"
          }`}
          style={{ backgroundColor: color }}
        />
      ))}
      <button
        type="button"
        title={`Clear ${label.toLowerCase()}`}
        aria-label={`Clear ${label}`}
        onMouseDown={(event) => {
          event.preventDefault();
          onClear();
        }}
        className="ml-0.5 text-[10px] font-semibold text-ink-muted hover:text-ink"
      >
        ×
      </button>
    </div>
  );
}

type Notify = (message: string, tone?: "error" | "info") => void;

function uploadErrorMessage(file: File, error: unknown) {
  const reason = error instanceof Error ? error.message : "Upload failed";
  return `Couldn’t add “${file.name}”: ${reason}`;
}

const LINK_PROTOCOLS = /^(https?:\/\/|mailto:)/i;

/** Accepts "example.com" as https://example.com; rejects anything that isn't http(s) or mailto. */
function normalizeLink(value: string): string | null {
  const candidate = LINK_PROTOCOLS.test(value) || value.startsWith("/") || value.startsWith("#")
    ? value
    : `https://${value}`;
  try {
    const url = new URL(candidate, window.location.origin);
    return ["http:", "https:", "mailto:"].includes(url.protocol) ? candidate : null;
  } catch {
    return null;
  }
}

const YOUTUBE_HOST = /^(www\.|m\.)?(youtube\.com|youtube-nocookie\.com|youtu\.be)$/i;

function EditorToolbar({ editor, uploadFile }: { editor: Editor; uploadFile: UploadFn }) {
  const dialogs = useDialogs();
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      bold: current.isActive("bold"),
      italic: current.isActive("italic"),
      underline: current.isActive("underline"),
      strike: current.isActive("strike"),
      code: current.isActive("code"),
      heading1: current.isActive("heading", { level: 1 }),
      heading2: current.isActive("heading", { level: 2 }),
      heading3: current.isActive("heading", { level: 3 }),
      bulletList: current.isActive("bulletList"),
      orderedList: current.isActive("orderedList"),
      blockquote: current.isActive("blockquote"),
      codeBlock: current.isActive("codeBlock"),
      alignLeft: current.isActive({ textAlign: "left" }),
      alignCenter: current.isActive({ textAlign: "center" }),
      alignRight: current.isActive({ textAlign: "right" }),
      alignJustify: current.isActive({ textAlign: "justify" }),
      fontFamily: (current.getAttributes("textStyle").fontFamily as string) || "",
      fontSize: (current.getAttributes("textStyle").fontSize as string) || "",
      color: (current.getAttributes("textStyle").color as string) || "",
      highlight:
        (current.getAttributes("highlight").color as string) ||
        (current.isActive("highlight") ? "#fef3c7" : ""),
      canUndo: current.can().undo(),
      canRedo: current.can().redo(),
    }),
  });

  async function setLink() {
    const previous = editor.getAttributes("link").href as string | undefined;
    const { empty } = editor.state.selection;
    const next = await dialogs.prompt({
      title: previous ? "Edit link" : "Add link",
      label: "Link address",
      defaultValue: previous ?? "",
      placeholder: "https://example.com",
      inputType: "url",
      confirmLabel: previous ? "Update" : "Add link",
      extraAction: previous ? { label: "Remove link", value: "" } : undefined,
      validate: (value) => (!value || normalizeLink(value) ? null : "Use a web address (https://…) or an email (mailto:…)."),
    });
    if (next === null) return;
    if (!next) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    const href = normalizeLink(next)!;
    if (empty && !previous) {
      // Nothing selected: insert the address itself as a link.
      editor
        .chain()
        .focus()
        .insertContent({ type: "text", text: next, marks: [{ type: "link", attrs: { href } }] })
        .run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
  }

  async function promptMediaUrl(title: string, placeholder: string) {
    return dialogs.prompt({
      title,
      label: "Address",
      placeholder,
      inputType: "url",
      confirmLabel: "Insert",
      validate: (value) => (value && isSafeMediaUrl(value) ? null : "Use an http:// or https:// link."),
    });
  }

  async function addImageFromUrl() {
    const url = await promptMediaUrl("Image from URL", "https://example.com/photo.jpg");
    if (!url) return;
    editor.chain().focus().setImage({ src: url }).run();
  }

  async function onImageFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    for (const file of files) {
      if (!file.type.startsWith("image/")) continue;
      try {
        const src = await uploadFile(file);
        editor.chain().focus().setImage({ src, alt: file.name }).run();
      } catch (error) {
        dialogs.notify(uploadErrorMessage(file, error), "error");
      }
    }
  }

  async function addYoutube() {
    const url = await dialogs.prompt({
      title: "Embed a YouTube video",
      label: "YouTube link",
      placeholder: "https://www.youtube.com/watch?v=…",
      inputType: "url",
      confirmLabel: "Embed",
      validate: (value) => {
        try {
          return YOUTUBE_HOST.test(new URL(value).hostname) ? null : "That isn’t a YouTube link.";
        } catch {
          return "That isn’t a YouTube link.";
        }
      },
    });
    if (!url) return;
    const inserted = editor.chain().focus().setYoutubeVideo({ src: url }).run();
    if (!inserted) dialogs.notify("Couldn’t embed that video — check the link.", "error");
  }

  async function addVideoFromUrl() {
    const url = await promptMediaUrl("Video from URL", "https://example.com/clip.mp4");
    if (!url) return;
    editor.chain().focus().setVideo({ src: url }).run();
  }

  async function onVideoFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    for (const file of files) {
      if (!file.type.startsWith("video/")) continue;
      try {
        const src = await uploadFile(file);
        editor.chain().focus().setVideo({ src }).run();
      } catch (error) {
        dialogs.notify(uploadErrorMessage(file, error), "error");
      }
    }
  }

  return (
    <div className="editor-toolbar shrink-0 space-y-2 border-b border-line/80 px-3 py-2 sm:px-5 sm:py-2.5">
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(event) => void onImageFiles(event)}
      />
      <input
        ref={videoInputRef}
        type="file"
        accept="video/*"
        multiple
        className="hidden"
        onChange={(event) => void onVideoFiles(event)}
      />

      <div className="toolbar-row flex items-center gap-1.5">
        <ToolbarButton
          label="Undo"
          disabled={!state.canUndo}
          onClick={() => editor.chain().focus().undo().run()}
        >
          ↶
        </ToolbarButton>
        <ToolbarButton
          label="Redo"
          disabled={!state.canRedo}
          onClick={() => editor.chain().focus().redo().run()}
        >
          ↷
        </ToolbarButton>

        <ToolbarDivider />

        <ToolbarSelect
          label="Font"
          value={state.fontFamily}
          className="min-w-[7.5rem]"
          onChange={(value) => {
            if (!value) {
              editor.commands.unsetFontFamily();
              return;
            }
            editor.chain().focus().setMark("textStyle", { fontFamily: value }).run();
          }}
        >
          {FONT_FAMILIES.map((font) => (
            <option key={font.label} value={font.value} style={{ fontFamily: font.value || undefined }}>
              {font.label}
            </option>
          ))}
        </ToolbarSelect>

        <ToolbarSelect
          label="Font size"
          value={state.fontSize}
          className="min-w-[4.5rem]"
          onChange={(value) => {
            if (!value) {
              editor
                .chain()
                .focus()
                .setMark("textStyle", { fontSize: null })
                .removeEmptyTextStyle()
                .run();
              return;
            }
            editor.chain().focus().setMark("textStyle", { fontSize: value }).run();
          }}
        >
          <option value="">Size</option>
          {FONT_SIZES.map((size) => (
            <option key={size} value={size}>
              {size.replace("px", "")}
            </option>
          ))}
        </ToolbarSelect>

        <ColorSwatch
          label="Color"
          colors={TEXT_COLORS}
          value={state.color}
          onPick={(color) =>
            editor.chain().focus().setMark("textStyle", { color }).run()
          }
          onClear={() =>
            editor
              .chain()
              .focus()
              .setMark("textStyle", { color: null })
              .removeEmptyTextStyle()
              .run()
          }
        />

        <ColorSwatch
          label="Mark"
          colors={HIGHLIGHT_COLORS}
          value={state.highlight}
          onPick={(color) =>
            editor.chain().focus().toggleHighlight({ color }).run()
          }
          onClear={() => editor.chain().focus().unsetHighlight().run()}
        />
      </div>

      <div className="toolbar-row flex items-center gap-0.5">
        <ToolbarButton
          label="Bold"
          active={state.bold}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <span className="font-bold">B</span>
        </ToolbarButton>
        <ToolbarButton
          label="Italic"
          active={state.italic}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <span className="italic">I</span>
        </ToolbarButton>
        <ToolbarButton
          label="Underline"
          active={state.underline}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          <span className="underline">U</span>
        </ToolbarButton>
        <ToolbarButton
          label="Strikethrough"
          active={state.strike}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        >
          <span className="line-through">S</span>
        </ToolbarButton>
        <ToolbarButton
          label="Inline code"
          active={state.code}
          onClick={() => editor.chain().focus().toggleCode().run()}
        >
          {"</>"}
        </ToolbarButton>

        <ToolbarDivider />

        <ToolbarButton
          label="Align left"
          active={state.alignLeft}
          onClick={() => editor.chain().focus().setTextAlign("left").run()}
        >
          ⬅
        </ToolbarButton>
        <ToolbarButton
          label="Align center"
          active={state.alignCenter}
          onClick={() => editor.chain().focus().setTextAlign("center").run()}
        >
          ↔
        </ToolbarButton>
        <ToolbarButton
          label="Align right"
          active={state.alignRight}
          onClick={() => editor.chain().focus().setTextAlign("right").run()}
        >
          ➡
        </ToolbarButton>
        <ToolbarButton
          label="Justify"
          active={state.alignJustify}
          onClick={() => editor.chain().focus().setTextAlign("justify").run()}
        >
          ≡
        </ToolbarButton>

        <ToolbarDivider />

        <ToolbarButton
          label="Heading 1"
          active={state.heading1}
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        >
          H1
        </ToolbarButton>
        <ToolbarButton
          label="Heading 2"
          active={state.heading2}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          H2
        </ToolbarButton>
        <ToolbarButton
          label="Heading 3"
          active={state.heading3}
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        >
          H3
        </ToolbarButton>

        <ToolbarDivider />

        <ToolbarButton
          label="Bullet list"
          active={state.bulletList}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          • List
        </ToolbarButton>
        <ToolbarButton
          label="Numbered list"
          active={state.orderedList}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          1. List
        </ToolbarButton>
        <ToolbarButton
          label="Quote"
          active={state.blockquote}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        >
          “ ”
        </ToolbarButton>
        <ToolbarButton
          label="Code block"
          active={state.codeBlock}
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        >
          Code
        </ToolbarButton>
        <ToolbarButton label="Link" onClick={() => void setLink()}>
          Link
        </ToolbarButton>
        <ToolbarButton
          label="Divider"
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
        >
          —
        </ToolbarButton>

        <ToolbarDivider />

        <ToolbarButton
          label="Upload image"
          onClick={() => imageInputRef.current?.click()}
        >
          Image
        </ToolbarButton>
        <ToolbarButton label="Image from URL" onClick={() => void addImageFromUrl()}>
          Img URL
        </ToolbarButton>
        <ToolbarButton
          label="Upload video"
          onClick={() => videoInputRef.current?.click()}
        >
          Video
        </ToolbarButton>
        <ToolbarButton label="Video from URL" onClick={() => void addVideoFromUrl()}>
          Vid URL
        </ToolbarButton>
        <ToolbarButton label="YouTube embed" onClick={() => void addYoutube()}>
          YouTube
        </ToolbarButton>
      </div>
    </div>
  );
}

async function insertMediaFiles(
  view: EditorView,
  files: File[],
  uploadMedia: UploadFn,
  notify: Notify,
  pos?: number,
) {
  let insertAt = pos ?? view.state.selection.from;
  for (const file of files) {
    if (
      !file.type.startsWith("image/") &&
      !file.type.startsWith("video/")
    ) {
      continue;
    }
    let src: string;
    try {
      src = await uploadMedia(file);
    } catch (error) {
      notify(uploadErrorMessage(file, error), "error");
      continue;
    }
    if (view.isDestroyed) return;
    const json =
      file.type.startsWith("image/")
        ? { type: "image", attrs: { src, alt: file.name } }
        : { type: "video", attrs: { src } };
    const node = view.state.schema.nodeFromJSON(json);
    // The document may have changed (remote edits) while uploading.
    insertAt = Math.min(insertAt, view.state.doc.content.size);
    view.dispatch(view.state.tr.insert(insertAt, node));
    insertAt += node.nodeSize;
  }
}

function countStats(editor: Editor): EditorStats {
  const text = editor.getText({ blockSeparator: "\n" }).trim();
  return {
    words: text ? text.split(/\s+/).length : 0,
    chars: text.length,
  };
}

export function RichTextEditor({
  doc,
  monospace = false,
  onStats,
  uploadFile,
  onEditorReady,
}: RichTextEditorProps) {
  // Editor handlers are created once per doc; read the latest upload function through a ref.
  const uploadRef = useRef(uploadFile);
  const { notify } = useDialogs();
  const notifyRef = useRef<Notify>(notify);
  useEffect(() => {
    uploadRef.current = uploadFile;
    notifyRef.current = notify;
  }, [uploadFile, notify]);

  const editor = useEditor(
    {
      extensions: [
        ...createEditorExtensions(),
        Placeholder.configure({
          placeholder:
            "Write a full document — fonts, colors, images, and video included. Share the link to edit together live.",
        }),
        // Body lives in the shared Yjs doc; edits from everyone merge instead of overwriting.
        Collaboration.configure({ document: doc, field: BODY_FIELD }),
      ],
      immediatelyRender: false,
      editorProps: {
        attributes: {
          class: "rich-editor-content outline-none font-sans",
        },
        handleDrop: (view, event, _slice, moved) => {
          if (moved || !event.dataTransfer?.files?.length) return false;
          const files = Array.from(event.dataTransfer.files).filter(
            (file) =>
              file.type.startsWith("image/") || file.type.startsWith("video/"),
          );
          if (!files.length) return false;
          event.preventDefault();
          const coordinates = view.posAtCoords({
            left: event.clientX,
            top: event.clientY,
          });
          void insertMediaFiles(view, files, uploadRef.current, notifyRef.current, coordinates?.pos);
          return true;
        },
        handlePaste: (view, event) => {
          const items = Array.from(event.clipboardData?.items ?? []);
          const files = items
            .filter(
              (item) =>
                item.type.startsWith("image/") || item.type.startsWith("video/"),
            )
            .map((item) => item.getAsFile())
            .filter((file): file is File => Boolean(file));
          if (!files.length) return false;
          event.preventDefault();
          void insertMediaFiles(view, files, uploadRef.current, notifyRef.current);
          return true;
        },
      },
      onCreate: ({ editor: current }) => onStats?.(countStats(current)),
      onUpdate: ({ editor: current }) => onStats?.(countStats(current)),
    },
    [doc],
  );

  useEffect(() => {
    onEditorReady?.(editor);
    return () => onEditorReady?.(null);
  }, [editor, onEditorReady]);

  useEffect(() => {
    if (!editor?.view?.dom) return;
    editor.view.dom.classList.toggle("font-mono", monospace);
    editor.view.dom.classList.toggle("text-[0.98rem]", monospace);
    editor.view.dom.classList.toggle("leading-7", monospace);
    editor.view.dom.classList.toggle("font-sans", !monospace);
  }, [editor, monospace]);

  if (!editor) {
    return (
      <div className="px-5 py-8 text-sm text-ink-muted sm:px-7">
        Loading editor…
      </div>
    );
  }

  return (
    <div className="rich-editor flex min-h-0 flex-1 flex-col">
      <EditorToolbar editor={editor} uploadFile={uploadFile} />
      {/* Only the writing area scrolls; header, title and toolbar stay put. */}
      <EditorContent editor={editor} className="editor-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain" />
    </div>
  );
}
