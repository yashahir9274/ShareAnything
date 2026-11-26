"use client";

import Collaboration from "@tiptap/extension-collaboration";
import Placeholder from "@tiptap/extension-placeholder";
import type { EditorView } from "@tiptap/pm/view";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import type { Editor } from "@tiptap/react";
import { useEffect, useRef, type ChangeEvent } from "react";
import type * as Y from "yjs";
import { useDialogs } from "@/components/dialogs";
import { BODY_FIELD, createEditorExtensions } from "@/lib/editor-extensions";
import { isSafeMediaUrl } from "@/lib/upload-rules";
import {
  AlignCenterIcon,
  AlignJustifyIcon,
  AlignLeftIcon,
  AlignRightIcon,
  BulletListIcon,
  ClearFormatIcon,
  CodeBlockIcon,
  ColorPicker,
  DividerIcon,
  GlobeIcon,
  HighlighterIcon,
  ImageIcon,
  LinkIcon,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MoreIcon,
  NumberListIcon,
  PlusIcon,
  QuoteIcon,
  RedoIcon,
  ToolbarButton,
  ToolbarDivider,
  ToolbarMenu,
  ToolbarMenus,
  UndoIcon,
  VideoIcon,
  YoutubeIcon,
} from "@/components/editor-toolbar-ui";

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

/** Text colours: neutrals, then vivid, deep and light shades of each hue. */
const TEXT_PALETTE = [
  ["#000000", "#1f2937", "#374151", "#4b5563", "#6b7280", "#9ca3af", "#d1d5db", "#e5e7eb", "#f3f4f6", "#ffffff"],
  ["#dc2626", "#ea580c", "#f59e0b", "#eab308", "#16a34a", "#0d9488", "#0891b2", "#2563eb", "#7c3aed", "#db2777"],
  ["#991b1b", "#9a3412", "#b45309", "#a16207", "#166534", "#115e59", "#155e75", "#1e40af", "#5b21b6", "#9d174d"],
  ["#fca5a5", "#fdba74", "#fcd34d", "#fde047", "#86efac", "#5eead4", "#67e8f9", "#93c5fd", "#c4b5fd", "#f9a8d4"],
] as const;

/** Highlights: soft marker colours that keep text readable. */
const HIGHLIGHT_PALETTE = [
  ["#fef08a", "#fde68a", "#fed7aa", "#fecaca", "#fbcfe8", "#e9d5ff", "#c7d2fe", "#bfdbfe", "#a5f3fc", "#bbf7d0"],
  ["#fde047", "#fcd34d", "#fdba74", "#fca5a5", "#f9a8d4", "#d8b4fe", "#a5b4fc", "#93c5fd", "#67e8f9", "#86efac"],
] as const;

const BLOCK_STYLES = [
  { key: "paragraph", label: "Normal text", className: "text-sm" },
  { key: "heading1", label: "Heading 1", className: "font-display text-xl" },
  { key: "heading2", label: "Heading 2", className: "font-display text-lg" },
  { key: "heading3", label: "Heading 3", className: "text-base font-semibold" },
  { key: "blockquote", label: "Quote", className: "text-sm italic" },
  { key: "codeBlock", label: "Code block", className: "font-mono text-xs" },
] as const;

type BlockKey = (typeof BLOCK_STYLES)[number]["key"];

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
      link: current.isActive("link"),
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

  const block: BlockKey = state.heading1
    ? "heading1"
    : state.heading2
      ? "heading2"
      : state.heading3
        ? "heading3"
        : state.codeBlock
          ? "codeBlock"
          : state.blockquote
            ? "blockquote"
            : "paragraph";

  function setBlock(key: BlockKey) {
    const chain = editor.chain().focus();
    if (key === "heading1") chain.setHeading({ level: 1 }).run();
    else if (key === "heading2") chain.setHeading({ level: 2 }).run();
    else if (key === "heading3") chain.setHeading({ level: 3 }).run();
    else if (key === "codeBlock") chain.setCodeBlock().run();
    else if (key === "blockquote") (state.blockquote ? chain : chain.setParagraph().toggleBlockquote()).run();
    else if (state.blockquote) chain.toggleBlockquote().setParagraph().run();
    else chain.setParagraph().run();
  }

  const align = state.alignCenter ? "center" : state.alignRight ? "right" : state.alignJustify ? "justify" : "left";
  const AlignIcon = { left: AlignLeftIcon, center: AlignCenterIcon, right: AlignRightIcon, justify: AlignJustifyIcon }[align];
  const fontLabel = FONT_FAMILIES.find((font) => font.value === state.fontFamily)?.label ?? "Font";
  const blockLabel = BLOCK_STYLES.find((style) => style.key === block)?.label ?? "Normal text";

  return (
    <div className="editor-toolbar shrink-0 border-b border-line/80 px-2 py-1.5 sm:px-4">
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

      <ToolbarMenus>
        <div className="toolbar-row flex items-center gap-0.5">
          <ToolbarButton label="Undo (Ctrl+Z)" disabled={!state.canUndo} onClick={() => editor.chain().focus().undo().run()}>
            <UndoIcon />
          </ToolbarButton>
          <ToolbarButton label="Redo (Ctrl+Y)" disabled={!state.canRedo} onClick={() => editor.chain().focus().redo().run()}>
            <RedoIcon />
          </ToolbarButton>

          <ToolbarDivider />

          <ToolbarMenu
            id="block"
            label="Text style"
            width={210}
            active={block !== "paragraph"}
            trigger={<span className="w-[4.6rem] truncate text-left">{blockLabel}</span>}
          >
            {BLOCK_STYLES.map((style) => (
              <MenuItem
                key={style.key}
                label={<span className={style.className}>{style.label}</span>}
                checked={block === style.key}
                onSelect={() => setBlock(style.key)}
              />
            ))}
          </ToolbarMenu>

          <ToolbarMenu
            id="font"
            label="Font"
            width={200}
            active={Boolean(state.fontFamily)}
            trigger={<span className="w-[3.6rem] truncate text-left">{fontLabel}</span>}
          >
            {FONT_FAMILIES.map((font) => (
              <MenuItem
                key={font.label}
                label={font.label}
                style={{ fontFamily: font.value || undefined }}
                checked={state.fontFamily === font.value}
                onSelect={() => {
                  if (!font.value) editor.chain().focus().unsetFontFamily().run();
                  else editor.chain().focus().setMark("textStyle", { fontFamily: font.value }).run();
                }}
              />
            ))}
          </ToolbarMenu>

          <ToolbarMenu
            id="size"
            label="Font size"
            width={150}
            active={Boolean(state.fontSize)}
            trigger={<span className="w-7 text-left">{state.fontSize ? state.fontSize.replace("px", "") : "Size"}</span>}
          >
            <MenuItem
              label="Default"
              checked={!state.fontSize}
              onSelect={() => editor.chain().focus().setMark("textStyle", { fontSize: null }).removeEmptyTextStyle().run()}
            />
            {FONT_SIZES.map((size) => (
              <MenuItem
                key={size}
                label={size.replace("px", "")}
                hint="px"
                checked={state.fontSize === size}
                onSelect={() => editor.chain().focus().setMark("textStyle", { fontSize: size }).run()}
              />
            ))}
          </ToolbarMenu>

          <ToolbarDivider />

          <ToolbarButton label="Bold (Ctrl+B)" active={state.bold} onClick={() => editor.chain().focus().toggleBold().run()}>
            <span className="font-bold">B</span>
          </ToolbarButton>
          <ToolbarButton label="Italic (Ctrl+I)" active={state.italic} onClick={() => editor.chain().focus().toggleItalic().run()}>
            <span className="font-serif italic">I</span>
          </ToolbarButton>
          <ToolbarButton label="Underline (Ctrl+U)" active={state.underline} onClick={() => editor.chain().focus().toggleUnderline().run()}>
            <span className="underline underline-offset-2">U</span>
          </ToolbarButton>
          <ToolbarMenu id="marks" label="More formatting" width={220} active={state.strike || state.code} trigger={<MoreIcon />}>
            <MenuItem
              icon={<span className="line-through">S</span>}
              label="Strikethrough"
              checked={state.strike}
              onSelect={() => editor.chain().focus().toggleStrike().run()}
            />
            <MenuItem
              icon={<span className="font-mono text-[10px]">{"</>"}</span>}
              label="Inline code"
              checked={state.code}
              onSelect={() => editor.chain().focus().toggleCode().run()}
            />
            <MenuSeparator />
            <MenuItem
              icon={<ClearFormatIcon />}
              label="Clear formatting"
              onSelect={() => editor.chain().focus().unsetAllMarks().run()}
            />
          </ToolbarMenu>

          <ToolbarDivider />

          <ToolbarMenu
            id="color"
            label="Text colour"
            width={292}
            active={Boolean(state.color)}
            trigger={
              <span className="flex flex-col items-center leading-none">
                <span className="text-[13px] font-bold">A</span>
                <span
                  className="mt-0.5 h-[3px] w-4 rounded-full"
                  style={{ backgroundColor: state.color || "var(--ink)" }}
                />
              </span>
            }
          >
            <ColorPicker
              palette={TEXT_PALETTE}
              value={state.color}
              recentKey="shareanything:recent-colors:text"
              clearLabel="Default colour"
              onPick={(color) => editor.chain().focus().setMark("textStyle", { color }).run()}
              onClear={() => editor.chain().focus().setMark("textStyle", { color: null }).removeEmptyTextStyle().run()}
            />
          </ToolbarMenu>

          <ToolbarMenu
            id="highlight"
            label="Highlight"
            width={292}
            active={Boolean(state.highlight)}
            trigger={
              <span className="flex flex-col items-center leading-none">
                <HighlighterIcon className="h-3.5 w-3.5" />
                <span
                  className="mt-0.5 h-[3px] w-4 rounded-full border border-line"
                  style={{ backgroundColor: state.highlight || "transparent" }}
                />
              </span>
            }
          >
            <ColorPicker
              palette={HIGHLIGHT_PALETTE}
              value={state.highlight}
              recentKey="shareanything:recent-colors:highlight"
              clearLabel="No highlight"
              onPick={(color) => editor.chain().focus().setHighlight({ color }).run()}
              onClear={() => editor.chain().focus().unsetHighlight().run()}
            />
          </ToolbarMenu>

          <ToolbarDivider />

          <ToolbarMenu id="align" label="Alignment" width={190} trigger={<AlignIcon />}>
            {(
              [
                ["left", "Align left", AlignLeftIcon],
                ["center", "Center", AlignCenterIcon],
                ["right", "Align right", AlignRightIcon],
                ["justify", "Justify", AlignJustifyIcon],
              ] as const
            ).map(([value, text, Icon]) => (
              <MenuItem
                key={value}
                icon={<Icon />}
                label={text}
                checked={align === value}
                onSelect={() => editor.chain().focus().setTextAlign(value).run()}
              />
            ))}
          </ToolbarMenu>

          <ToolbarMenu
            id="lists"
            label="Lists"
            width={200}
            active={state.bulletList || state.orderedList}
            trigger={state.orderedList ? <NumberListIcon /> : <BulletListIcon />}
          >
            <MenuItem
              icon={<BulletListIcon />}
              label="Bullet list"
              checked={state.bulletList}
              onSelect={() => editor.chain().focus().toggleBulletList().run()}
            />
            <MenuItem
              icon={<NumberListIcon />}
              label="Numbered list"
              checked={state.orderedList}
              onSelect={() => editor.chain().focus().toggleOrderedList().run()}
            />
          </ToolbarMenu>

          <ToolbarButton label="Link (add or edit)" active={state.link} onClick={() => void setLink()}>
            <LinkIcon />
          </ToolbarButton>

          <ToolbarDivider />

          <ToolbarMenu
            id="insert"
            label="Insert"
            width={230}
            trigger={
              <span className="flex items-center gap-1">
                <PlusIcon className="h-3.5 w-3.5" />
                Insert
              </span>
            }
          >
            <MenuLabel>Image</MenuLabel>
            <MenuItem icon={<ImageIcon />} label="Upload image" onSelect={() => imageInputRef.current?.click()} />
            <MenuItem icon={<GlobeIcon />} label="Image from link" onSelect={() => void addImageFromUrl()} />
            <MenuLabel>Video</MenuLabel>
            <MenuItem icon={<VideoIcon />} label="Upload video" onSelect={() => videoInputRef.current?.click()} />
            <MenuItem icon={<GlobeIcon />} label="Video from link" onSelect={() => void addVideoFromUrl()} />
            <MenuItem icon={<YoutubeIcon />} label="YouTube video" onSelect={() => void addYoutube()} />
            <MenuSeparator />
            <MenuItem
              icon={<QuoteIcon />}
              label="Quote"
              checked={state.blockquote}
              onSelect={() => setBlock(state.blockquote ? "paragraph" : "blockquote")}
            />
            <MenuItem
              icon={<CodeBlockIcon />}
              label="Code block"
              checked={state.codeBlock}
              onSelect={() => setBlock(state.codeBlock ? "paragraph" : "codeBlock")}
            />
            <MenuItem icon={<DividerIcon />} label="Divider line" onSelect={() => editor.chain().focus().setHorizontalRule().run()} />
          </ToolbarMenu>
        </div>
      </ToolbarMenus>
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
