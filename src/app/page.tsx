"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { createNoteId } from "@/lib/id";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    router.replace(`/n/${createNoteId()}`);
  }, [router]);

  return (
    <div className="atmosphere flex min-h-dvh items-center justify-center px-6">
      <div className="text-center animate-fade-up">
        <p className="font-display text-4xl tracking-tight text-ink sm:text-5xl">
          ShareAnything
        </p>
        <p className="mt-3 text-sm text-ink-muted animate-soft-pulse">
          Opening a fresh note…
        </p>
      </div>
    </div>
  );
}
