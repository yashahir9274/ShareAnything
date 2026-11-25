"use client";

import { io, type Socket } from "socket.io-client";

let socket: Socket | null = null;

export function getSocketUrl() {
  if (process.env.NEXT_PUBLIC_SOCKET_URL) {
    return process.env.NEXT_PUBLIC_SOCKET_URL;
  }

  if (typeof window === "undefined") {
    return "http://localhost:3001";
  }

  const protocol = window.location.protocol === "https:" ? "https:" : "http:";
  const host = window.location.hostname;
  return `${protocol}//${host}:3001`;
}

export function getSocket() {
  if (typeof window === "undefined") {
    throw new Error("Socket is only available in the browser");
  }

  if (!socket) {
    socket = io(getSocketUrl(), {
      autoConnect: true,
      transports: ["websocket", "polling"],
    });
  }

  return socket;
}

export function createClientId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `client-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
