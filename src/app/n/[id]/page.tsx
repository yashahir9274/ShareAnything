import { Suspense } from "react";
import { Notepad } from "@/components/notepad";

type NotePageProps = {
  params: Promise<{ id: string }>;
};

async function NoteEditor({ params }: NotePageProps) {
  const { id } = await params;
  return <Notepad noteId={id} />;
}

function NoteFallback() {
  return (
    <div className="atmosphere flex min-h-dvh items-center justify-center">
      <p className="font-display text-2xl text-ink-muted animate-soft-pulse">
        Opening your note…
      </p>
    </div>
  );
}

export async function generateMetadata({ params }: NotePageProps) {
  const { id } = await params;
  return {
    title: `ShareAnything / ${id}`,
    description: "A shared note on ShareAnything.",
  };
}

export default function NotePage({ params }: NotePageProps) {
  return (
    <Suspense fallback={<NoteFallback />}>
      <NoteEditor params={params} />
    </Suspense>
  );
}
