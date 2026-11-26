import { Suspense } from "react";
import { notFound } from "next/navigation";
import { NoteShell } from "@/components/note-shell";
import { Notepad } from "@/components/notepad";
import { isValidNoteId } from "@/lib/note-types";

type NotePageProps = {
  params: Promise<{ id: string }>;
};

async function NoteEditor({ params }: NotePageProps) {
  const { id } = await params;
  if (!isValidNoteId(id)) notFound();
  return <Notepad key={id} noteId={id} />;
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
    <Suspense fallback={<NoteShell />}>
      <NoteEditor params={params} />
    </Suspense>
  );
}
