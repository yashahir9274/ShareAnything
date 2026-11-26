import { fileExtension, type FileKind } from "@/lib/files";

const KIND_STYLE: Record<FileKind, { bg: string; fg: string; label: string }> = {
  image: { bg: "bg-teal-soft", fg: "text-teal", label: "Image" },
  video: { bg: "bg-accent-soft", fg: "text-accent", label: "Video" },
  audio: { bg: "bg-[#f3e8ff]", fg: "text-[#7c3aed]", label: "Audio" },
  pdf: { bg: "bg-[#fee2e2]", fg: "text-[#b91c1c]", label: "PDF" },
  code: { bg: "bg-[#0b1420]", fg: "text-[#7dd3c0]", label: "Code" },
  text: { bg: "bg-surface", fg: "text-ink-muted", label: "Text" },
  document: { bg: "bg-[#dbeafe]", fg: "text-[#1d4ed8]", label: "Document" },
  archive: { bg: "bg-[#fef3c7]", fg: "text-[#b45309]", label: "Archive" },
  other: { bg: "bg-surface", fg: "text-ink-muted", label: "File" },
};

export function kindLabel(kind: FileKind) {
  return KIND_STYLE[kind].label;
}

function Glyph({ kind }: { kind: FileKind }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className: "h-1/2 w-1/2",
    "aria-hidden": true,
  };
  switch (kind) {
    case "image":
      return (
        <svg {...common}>
          <rect x="3" y="4" width="18" height="16" rx="3" />
          <circle cx="9" cy="10" r="2" />
          <path d="m21 17-5-5-9 8" />
        </svg>
      );
    case "video":
      return (
        <svg {...common}>
          <rect x="3" y="5" width="14" height="14" rx="3" />
          <path d="m17 10 4-2.5v9L17 14" />
        </svg>
      );
    case "audio":
      return (
        <svg {...common}>
          <path d="M9 18V6l11-2v12" />
          <circle cx="6" cy="18" r="3" />
          <circle cx="17" cy="16" r="3" />
        </svg>
      );
    case "code":
      return (
        <svg {...common}>
          <path d="m8 8-5 4 5 4M16 8l5 4-5 4M14 5l-4 14" />
        </svg>
      );
    case "archive":
      return (
        <svg {...common}>
          <rect x="4" y="3" width="16" height="18" rx="3" />
          <path d="M12 3v2m0 2v2m0 2v2m-2 2h4v3h-4z" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
          <path d="M14 3v5h5M9 13h6M9 17h4" />
        </svg>
      );
  }
}

export function FileIcon({
  kind,
  name,
  className = "",
  showExtension = true,
}: {
  kind: FileKind;
  name: string;
  className?: string;
  /** Small icons (list rows) skip the badge; the name already shows the extension. */
  showExtension?: boolean;
}) {
  const style = KIND_STYLE[kind];
  const ext = fileExtension(name).slice(0, 5);
  return (
    <div
      className={`relative flex items-center justify-center rounded-2xl border border-line/70 ${style.bg} ${style.fg} ${className}`}
    >
      <Glyph kind={kind} />
      {ext && showExtension ? (
        <span className="absolute bottom-1.5 right-1.5 rounded-md bg-surface/90 px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase text-ink">
          {ext}
        </span>
      ) : null}
    </div>
  );
}
