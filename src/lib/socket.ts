"use client";

import { io, type Socket } from "socket.io-client";

let socket: Socket | null = null;

/** Shared connection to the Socket.io server, which runs on the same origin as the app. */
export function getSocket() {
  if (typeof window === "undefined") {
    throw new Error("Socket is only available in the browser");
  }
  socket ??= io({ transports: ["websocket", "polling"] });
  return socket;
}

export function subscribeToConnection(onChange: () => void) {
  const current = getSocket();
  current.on("connect", onChange);
  current.on("disconnect", onChange);
  return () => {
    current.off("connect", onChange);
    current.off("disconnect", onChange);
  };
}

export function isSocketConnected() {
  return getSocket().connected;
}
