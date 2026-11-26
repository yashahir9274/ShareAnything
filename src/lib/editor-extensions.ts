import type { Extensions } from "@tiptap/core";
import Highlight from "@tiptap/extension-highlight";
import Image from "@tiptap/extension-image";
import TextAlign from "@tiptap/extension-text-align";
import { Color, FontFamily, FontSize, TextStyle } from "@tiptap/extension-text-style";
import Youtube from "@tiptap/extension-youtube";
import StarterKit from "@tiptap/starter-kit";
import { Video } from "../components/editor-video";

/** Name of the Yjs XmlFragment that holds the document body. */
export const BODY_FIELD = "default";
/** Name of the Yjs Text that holds the note title. */
export const TITLE_FIELD = "title";
/** Name of the Yjs Map that holds note settings (monospace). */
export const META_FIELD = "meta";

/**
 * Editor schema shared by the browser editor and the server (which uses it to
 * convert notes saved as HTML before Yjs, and to validate incoming changes).
 * Undo/redo comes from the Collaboration extension, so StarterKit's is off.
 */
export function createEditorExtensions(): Extensions {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      undoRedo: false,
      link: {
        openOnClick: false,
        autolink: true,
        defaultProtocol: "https",
      },
    }),
    TextStyle,
    Color,
    FontFamily,
    FontSize,
    TextAlign.configure({
      types: ["heading", "paragraph"],
    }),
    Highlight.configure({
      multicolor: true,
    }),
    Image.configure({
      allowBase64: true,
      resize: {
        enabled: true,
        alwaysPreserveAspectRatio: true,
        minWidth: 80,
        minHeight: 80,
      },
      HTMLAttributes: {
        class: "editor-image",
      },
    }),
    Youtube.configure({
      controls: true,
      nocookie: true,
      width: 640,
      height: 360,
      HTMLAttributes: {
        class: "editor-youtube",
      },
    }),
    Video,
  ];
}
