import { notFound } from "next/navigation";
import { Suspense } from "react";
import { SharedFileView } from "@/components/media/shared-file-view";
import { isValidFileId } from "@/lib/files";

type SharedFilePageProps = {
  params: Promise<{ fileId: string }>;
};

async function SharedFile({ params }: SharedFilePageProps) {
  const { fileId } = await params;
  if (!isValidFileId(fileId)) notFound();
  return <SharedFileView fileId={fileId} />;
}

export const metadata = {
  title: "Shared file — ShareAnything",
  description: "A file shared with you on ShareAnything.",
  robots: { index: false },
};

export default function SharedFilePage({ params }: SharedFilePageProps) {
  return (
    <Suspense
      fallback={
        <div className="atmosphere flex min-h-dvh items-center justify-center">
          <p className="font-display text-2xl text-ink-muted animate-soft-pulse">Opening file…</p>
        </div>
      }
    >
      <SharedFile params={params} />
    </Suspense>
  );
}
