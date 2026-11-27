import { readFileSync } from "fs";
import { createServer } from "http";
import path from "path";
import next from "next";
import { handleEmojiRequest } from "./emoji-http";
import { handleGifRequest } from "./gif-http";
import { handleFileRequest } from "./file-http";
import { handleNewNoteRequest } from "./new-note-http";
import { flushAllNotes } from "./note-store";
import { attachSocketServer } from "./socket";

// One process, one port: Next.js pages/API and Socket.io share an origin,
// so there's no separate socket host or CORS to configure when deploying.
const dev = !process.argv.includes("--prod") && process.env.NODE_ENV !== "production";
const port = Number(process.env.PORT || 3000);
// HOST, not HOSTNAME: Docker sets HOSTNAME to the container id. Unset = listen on every interface.
const host = process.env.HOST || undefined;

const httpServer = createServer();
const app = next({ dev, hostname: host ?? "localhost", port, httpServer });
const handle = app.getRequestHandler();

// The service worker must never be cached (by the browser or Cloudflare), or phones keep
// an old one after a deploy — e.g. one that can't receive push notifications.
const serviceWorker = readFileSync(path.join(process.cwd(), "public", "sw.js"));

app
  .prepare()
  .then(() => {
    const io = attachSocketServer(httpServer);
    httpServer.on("request", (req, res) => {
      // Socket.io answers its own polling requests on this server.
      if (req.url?.startsWith("/socket.io/")) return;
      // Health check for load balancers / container platforms.
      if (req.url === "/healthz") {
        res.writeHead(200, { "Content-Type": "text/plain", "Cache-Control": "no-store" });
        res.end("ok");
        return;
      }
      if (req.url === "/sw.js" || req.url?.startsWith("/sw.js?")) {
        res.writeHead(200, {
          "Content-Type": "application/javascript; charset=utf-8",
          "Cache-Control": "no-store, max-age=0",
          "CDN-Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        });
        res.end(req.method === "HEAD" ? undefined : dev ? readFileSync(path.join(process.cwd(), "public", "sw.js")) : serviceWorker);
        return;
      }
      // Fluent emoji images (self-hosted).
      if (handleEmojiRequest(req, res)) return;
      // GIF search (GIPHY, key kept on the server).
      if (handleGifRequest(req, res)) return;
      // Media manager uploads/downloads (streamed; they never touch Next.js).
      if (handleFileRequest(req, res)) return;
      // "/" and "New note": unique ids are handed out here, never in the browser.
      if (handleNewNoteRequest(req, res)) return;
      void handle(req, res);
    });
    httpServer.listen(port, host, () => {
      console.log(`ShareAnything ready on http://${host ?? "localhost"}:${port} (${dev ? "dev" : "production"})`);
    });

    // Graceful shutdown: stop taking connections, save every pending note, then exit.
    let shuttingDown = false;
    for (const signal of ["SIGINT", "SIGTERM"] as const) {
      process.once(signal, () => {
        if (shuttingDown) return;
        shuttingDown = true;
        console.log(`${signal} received, saving notes…`);
        const forceExit = setTimeout(() => process.exit(1), 10_000);
        forceExit.unref();
        io.close();
        httpServer.close();
        void flushAllNotes().finally(() => process.exit(0));
      });
    }
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
