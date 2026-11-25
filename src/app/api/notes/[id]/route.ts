import { NextResponse } from "next/server";
import type { Note } from "@/lib/note-types";
import { getOrCreateServerNote, mergeNote, readNote } from "@/lib/server-note-store";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const note = await getOrCreateServerNote(id);
  return NextResponse.json(note);
}

export async function PUT(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const body = (await request.json()) as Partial<Note>;

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const existing = (await readNote(id)) ?? (await getOrCreateServerNote(id));
  const next: Note = {
    ...existing,
    title: typeof body.title === "string" ? body.title : existing.title,
    content: typeof body.content === "string" ? body.content : existing.content,
    passwordHash:
      body.passwordHash === undefined ? existing.passwordHash : body.passwordHash,
    monospace:
      typeof body.monospace === "boolean" ? body.monospace : existing.monospace,
    updatedAt: new Date().toISOString(),
  };

  const saved = await mergeNote(next);
  return NextResponse.json(saved);
}
