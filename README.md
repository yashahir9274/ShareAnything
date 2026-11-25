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
- Instant note creation at `/` → redirects to `/n/[id]`
- Server-persisted notes (`.data/notes`) + REST API
- Live Socket.io sync (debounced ~450ms after typing)
- Share-link copy, password lock UI, monospace mode, word/character counts
- Modern “digital napkin” visual system (paper atmosphere, Fraunces brand type, coral accent)

## Run locally

```bash
npm install
npm run dev
```

This starts:
- Web app on [http://localhost:3000](http://localhost:3000)
- Socket server on [http://localhost:3001](http://localhost:3001)

Open the same `/n/...` link in two browsers to see live sync.

Optional: set `NEXT_PUBLIC_SOCKET_URL` if the socket host/port differs.
