"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatBytes, type FileEvent, type FilesUsage, type NoteFile } from "@/lib/files";
import { getSocket } from "@/lib/socket";
import { getIdentity } from "@/lib/identity";
import { readToken } from "@/lib/use-note-sync";

export type UploadItem = {
  key: string;
  name: string;
  size: number;
  loaded: number;
  status: "uploading" | "done" | "error";
  error?: string;
};

type Ack = { ok: true } | { ok: false; error: string };

/** Uploads one file to a note's media manager, reporting progress. */
export function uploadNoteFile(
  noteId: string,
  file: File | Blob,
  name: string,
  onProgress?: (loaded: number) => void,
  source?: "chat",
): Promise<NoteFile> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", `/api/notes/${noteId}/files`);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.setRequestHeader("X-File-Name", encodeURIComponent(name));
    const token = readToken(noteId);
    if (token) xhr.setRequestHeader("X-Note-Token", token);
    // Lets others see who shared it ("Yash shared a file").
    const me = getIdentity();
    xhr.setRequestHeader("X-User-Id", me.id);
    xhr.setRequestHeader("X-User-Name", encodeURIComponent(me.name));
    if (source) xhr.setRequestHeader("X-Upload-Source", source);
    xhr.upload.onprogress = (event) => onProgress?.(event.loaded);
    xhr.onload = () => {
      let body: { error?: string } & Partial<NoteFile> = {};
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        // fall through
      }
      if (xhr.status === 201 && body.id) resolve(body as NoteFile);
      else reject(new Error(body.error || `Upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error("Network error"));
    xhr.send(file);
  });
}

/** Live list of a note's files, kept in sync for everyone viewing the note. */
export function useNoteFiles(
  noteId: string,
  enabled: boolean,
  connected: boolean,
  /** Called when someone else adds a file (for notifications). viaChat: sent as a chat attachment. */
  onOthersUpload?: (file: NoteFile, viaChat: boolean) => void,
) {
  const onOthersUploadRef = useRef(onOthersUpload);
  useEffect(() => {
    onOthersUploadRef.current = onOthersUpload;
  }, [onOthersUpload]);
  const [files, setFiles] = useState<NoteFile[]>([]);
  const [usage, setUsage] = useState<FilesUsage | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const counter = useRef(0);
  const usageRef = useRef<FilesUsage | null>(null);
  useEffect(() => {
    usageRef.current = usage;
  }, [usage]);

  useEffect(() => {
    if (!enabled || !connected) return;
    const socket = getSocket();
    let cancelled = false;

    socket.emit(
      "note:files",
      { noteId },
      (result: { ok: true; files: NoteFile[]; usage: FilesUsage } | { ok: false }) => {
        if (cancelled || !result.ok) return;
        setFiles(result.files);
        setUsage(result.usage);
        setLoaded(true);
      },
    );

    function handleEvent(event: FileEvent) {
      if (event.noteId !== noteId) return;
      if (event.type === "added") {
        if (event.uploaderId !== getIdentity().id) onOthersUploadRef.current?.(event.file, Boolean(event.viaChat));
        setFiles((current) =>
          current.some((file) => file.id === event.file.id) ? current : [event.file, ...current],
        );
        setUsage(event.usage);
      } else if (event.type === "updated") {
        setFiles((current) => current.map((file) => (file.id === event.file.id ? event.file : file)));
      } else {
        setFiles((current) => current.filter((file) => file.id !== event.fileId));
        setUsage(event.usage);
      }
    }

    socket.on("note:file-event", handleEvent);
    return () => {
      cancelled = true;
      socket.off("note:file-event", handleEvent);
    };
  }, [noteId, enabled, connected]);

  const patchUpload = useCallback((key: string, patch: Partial<UploadItem>) => {
    setUploads((current) => current.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  }, []);

  /**
   * Uploads files (two at a time). Resolves, in order, to the stored file or the
   * Error explaining why that file wasn't stored.
   */
  const upload = useCallback(
    async (
      input: Array<{ file: File | Blob; name: string }>,
      options: { source?: "chat" } = {},
    ): Promise<Array<NoteFile | Error>> => {
      // Check limits up front so an oversized file fails instantly with a clear reason
      // instead of after sending it all.
      const limits = usageRef.current;
      let room = limits ? limits.quota - limits.used : Infinity;
      const precheck = input.map(({ file }) => {
        if (limits && file.size > limits.maxFileSize) {
          return `Files must be under ${formatBytes(limits.maxFileSize)}`;
        }
        if (file.size > room) return "Not enough space left in this note";
        room -= file.size;
        return null;
      });

      const items: UploadItem[] = input.map(({ file, name }, index) => ({
        key: `u${(counter.current += 1)}`,
        name,
        size: file.size,
        loaded: 0,
        status: precheck[index] ? "error" : "uploading",
        error: precheck[index] ?? undefined,
      }));
      setUploads((current) => [...current.filter((item) => item.status === "uploading"), ...items]);

      const results: Array<NoteFile | Error> = precheck.map(
        (problem) => new Error(problem ?? "Upload failed"),
      );
      const queue = input.map((_, index) => index).filter((index) => !precheck[index]);
      let next = 0;
      const worker = async () => {
        while (next < queue.length) {
          const index = queue[next++];
          const item = items[index];
          try {
            const stored = await uploadNoteFile(
              noteId,
              input[index].file,
              input[index].name,
              (bytes) => patchUpload(item.key, { loaded: bytes }),
              options.source,
            );
            results[index] = stored;
            patchUpload(item.key, { status: "done", loaded: item.size });
            // Show it right away; the socket event for it is de-duplicated.
            setFiles((current) =>
              current.some((file) => file.id === stored.id) ? current : [stored, ...current],
            );
          } catch (error) {
            const message = error instanceof Error ? error.message : "Upload failed";
            results[index] = new Error(message);
            patchUpload(item.key, { status: "error", error: message });
          }
        }
      };
      await Promise.all([worker(), worker()]);
      // Clear finished rows after a moment; keep errors until dismissed.
      window.setTimeout(() => {
        setUploads((current) => current.filter((item) => item.status !== "done"));
      }, 2500);
      return results;
    },
    [noteId, patchUpload],
  );

  const dismissUpload = useCallback((key: string) => {
    setUploads((current) => current.filter((item) => item.key !== key));
  }, []);

  const remove = useCallback(
    (fileId: string) =>
      new Promise<string | null>((resolve) => {
        getSocket().emit("note:file-delete", { noteId, fileId }, (result: Ack) => {
          resolve(result.ok ? null : result.error);
        });
      }),
    [noteId],
  );

  const rename = useCallback(
    (fileId: string, name: string) =>
      new Promise<string | null>((resolve) => {
        getSocket().emit("note:file-rename", { noteId, fileId, name }, (result: Ack) => {
          resolve(result.ok ? null : result.error);
        });
      }),
    [noteId],
  );

  return { files, usage, loaded, uploads, upload, dismissUpload, remove, rename };
}

