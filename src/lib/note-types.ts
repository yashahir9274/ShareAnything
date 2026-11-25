export type Note = {
  id: string;
  title: string;
  content: string;
  passwordHash: string | null;
  monospace: boolean;
  createdAt: string;
  updatedAt: string;
};

export type NoteUpdatePayload = {
  clientId: string;
  note: Note;
};

export function createEmptyNote(id: string): Note {
  const now = new Date().toISOString();
  return {
    id,
    title: "",
    content: "",
    passwordHash: null,
    monospace: false,
    createdAt: now,
    updatedAt: now,
  };
}
