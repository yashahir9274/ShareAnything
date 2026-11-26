"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { MouseEvent, ReactNode } from "react";
import { requestNewNoteId } from "@/lib/new-note";

/**
 * Link that starts a new note. The id always comes from the server, which
 * guarantees it is unused. Opening it in a new tab hits "/", which the server
 * redirects to a fresh id as well. Prefetch is off so hovering never reserves ids.
 */
export function NewNoteLink({
  className,
  children,
  "aria-label": ariaLabel,
}: {
  className?: string;
  children: ReactNode;
  "aria-label"?: string;
}) {
  const router = useRouter();

  async function onClick(event: MouseEvent<HTMLAnchorElement>) {
    // Let modified clicks (new tab/window) go to "/" normally.
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    try {
      router.push(`/${await requestNewNoteId()}`);
    } catch {
      router.push("/");
    }
  }

  return (
    <Link href="/" prefetch={false} onClick={(event) => void onClick(event)} className={className} aria-label={ariaLabel}>
      {children}
    </Link>
  );
}
