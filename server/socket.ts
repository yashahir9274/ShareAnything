import { createServer } from "http";
import { Server } from "socket.io";
import {
  getOrCreateServerNote,
  mergeNote,
} from "../src/lib/server-note-store";
import type { Note, NoteUpdatePayload } from "../src/lib/note-types";

const PORT = Number(process.env.SOCKET_PORT || 3001);

const httpServer = createServer((_req, res) => {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ ok: true, service: "shareanything-socket" }));
});

const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

function roomName(noteId: string) {
  return `note:${noteId}`;
}

io.on("connection", (socket) => {
  socket.on("note:join", async (noteId: string) => {
    if (!noteId || typeof noteId !== "string") return;

    try {
      const note = await getOrCreateServerNote(noteId);
      await socket.join(roomName(noteId));
      socket.emit("note:state", note);
    } catch (error) {
      socket.emit("note:error", {
        message: error instanceof Error ? error.message : "Failed to join note",
      });
    }
  });

  socket.on("note:update", async (payload: NoteUpdatePayload) => {
    if (!payload?.note?.id || !payload.clientId) return;

    try {
      const saved = await mergeNote(payload.note);
      socket.to(roomName(saved.id)).emit("note:sync", {
        clientId: payload.clientId,
        note: saved,
      } satisfies NoteUpdatePayload);
      socket.emit("note:saved", saved);
    } catch (error) {
      socket.emit("note:error", {
        message: error instanceof Error ? error.message : "Failed to sync note",
      });
    }
  });

  socket.on("note:leave", async (noteId: string) => {
    if (!noteId) return;
    await socket.leave(roomName(noteId));
  });
});

httpServer.listen(PORT, () => {
  console.log(`ShareAnything socket server on http://localhost:${PORT}`);
});

export type { Note };
