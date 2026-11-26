<p><img src="public/logo.svg" alt="ShareAnything" height="48"></p>

# ShareAnything

A modern take on [notepad.pw](https://notepad.pw/) — instant shared notes with a cleaner writing experience.

## What notepad.pw does

- Opens a blank notepad in the browser (no install, no required account)
- Auto-saves what you type
- Gives every note a shareable URL
- Optional password protection
- Extras like markdown/code views, word count, themes, and tools

## What ShareAnything ships in this setup

- Next.js App Router + TypeScript + Tailwind CSS
- Instant note creation at `/` → redirects to `/[id]`
- One Node process (`server/index.ts`) serving Next.js and Socket.io on the same port
- Server-persisted notes (`.data/notes`), media uploads (`.data/uploads`)
- Real-time collaborative editing with Yjs (CRDT): people typing at the same time all keep their changes; body, title and settings live in one shared Yjs document relayed over Socket.io
- TipTap document editor (fonts, sizes, colors, highlight, align, images, video/YouTube)
- Every incoming change is checked on the server against the editor schema (allowed blocks and formatting, safe link/media URLs, safe CSS values) before it is stored or relayed
- Password lock enforced on the server (scrypt hashes, per-note access tokens, unlock rate limit)
- Share-link copy, monospace mode, word/character counts
- **Files tab (media manager)** per note: upload anything (drag & drop, paste, multi-select) or create code snippets; previews for images, video, audio, PDF and syntax-highlighted code; search, filters, grid/list; rename/delete; insert images/videos into the document. Images and videos added in the editor are stored here too
- Every file gets a public share page (`/f/<id>`) with a copy-link button, QR code, system share sheet and download. Files in a locked note can only be listed or changed after unlocking; a file's own share link works for anyone who has it until the file is deleted
- Modern “digital napkin” visual system (paper atmosphere, Fraunces brand type, coral accent)

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), then open the same `/...` link in two browsers to see live sync.

Production: `npm run build` then `npm start`.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | Port for the web app and Socket.io |
| `HOST` | all interfaces | Address to listen on (e.g. `127.0.0.1` behind a local proxy) |
| `PUBLIC_URL` | `http://localhost:3000` | Your public address (e.g. `https://share.example.com`); used for link-preview images |
| `TRUST_PROXY` | off | Set to `1` only behind your own reverse proxy, so rate limits use the real client IP from `X-Forwarded-For` |
| `SHAREANYTHING_SECRET` | random, saved in `.data/secret.key` | Signs note access tokens; changing it locks everyone out of protected notes until they re-enter the password |
| `SHAREANYTHING_MAX_FILE_MB` | `100` | Largest single file in the media manager |
| `SHAREANYTHING_NOTE_QUOTA_MB` | `500` | Total file storage per note (max 300 files) |
| `SOCKET_CORS_ORIGIN` | none (same origin only) | Comma-separated extra origins allowed to open a socket |

## Limits

- Note size: 4 MB of encoded Yjs state (images and video are uploaded separately)
- Files: up to 100 MB each, 500 MB and 300 files per note (configurable). Any type is accepted; HTML, SVG and unknown types are served as plain text or downloads with a sandboxing Content-Security-Policy, so uploads can't run scripts on the site
- Unlock attempts: 10 per 5 minutes per client and note

## Storage format

Notes are saved as `.data/notes/<id>.json` with the Yjs document base64-encoded (`version: 2`), about a second after each change and on shutdown. Notes saved by earlier versions (HTML `content`) are converted automatically the first time they are opened.

Files are stored as `.data/files/<id>.bin` with metadata in `<id>.json`, and each note's list in `.data/notes/<id>.files.json`.

## Deploy

ShareAnything is one long-running Node.js server (pages, live sync over WebSockets, and file storage on disk). It needs:

- a host that keeps a process running and supports WebSockets — a VPS, Docker host, Railway, Render, Fly.io, etc. (not serverless platforms like Vercel/Netlify functions);
- a persistent disk for `.data/` (notes, files, and the token secret);
- HTTPS in front (your platform's, or a reverse proxy such as Caddy/Nginx — make sure it forwards WebSocket upgrades for `/socket.io/`, and allows request bodies up to your file limit).

### Docker

```bash
docker build -t shareanything .
docker run -d --name shareanything -p 3000:3000   -v shareanything-data:/app/.data   -e PUBLIC_URL=https://share.example.com   -e SHAREANYTHING_SECRET="$(openssl rand -hex 32)"   shareanything
```

### Without Docker

```bash
npm ci
npm run build
PORT=3000 PUBLIC_URL=https://share.example.com SHAREANYTHING_SECRET=... npm start
```

Health check: `GET /healthz` returns `ok`. On `SIGTERM` the server stops accepting connections and saves pending notes before exiting. Back up the `.data/` folder (or volume) regularly.

## Brand assets

The logo mark is `src/app/icon.svg`. After changing it, run `npm run brand` to regenerate `favicon.ico`, `apple-icon.png`, the install icons in `public/`, and the link-preview images.
