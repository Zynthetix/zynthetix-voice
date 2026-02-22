# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Dev (Vite HMR + Electron)
npm run dev

# Build only (no electron-builder packaging)
npm run build   # runs build:renderer then build:main

# Start production build
npm run start   # runs build first, then launches electron

# Package into .app (no DMG)
npm run pack

# Package into distributable DMG
npm run dist    # output: release/Zynthetix Voice-2.0.0-arm64.dmg

# After npm install, native modules must be rebuilt
npm run postinstall  # rebuilds better-sqlite3 and uiohook-napi for Electron
```

No test suite exists yet.

## Architecture

### Build system
Two separate TypeScript configs:
- `tsconfig.json` — renderer only (noEmit, bundler resolution, JSX)
- `tsconfig.main.json` — main process only (CommonJS emit to `dist/main/`)
- `vite.config.ts` — builds 3 HTML entry points to `dist/renderer/`

### Process boundary: IPC and preload
`src/main/preload.ts` is the **only** bridge between main and renderer. It exposes `window.electronAPI` via `contextBridge`. All IPC channels are declared here — any new main↔renderer communication must go through this file.

### Main process (`src/main/`)
- **`main.ts`** — Electron entry: manages BrowserWindow instances (pill, settings), Tray, global hotkey logic (uiohook-napi), recording state machine, Whisper transcription, and text injection via AppleScript (`osascript`).
- **`db.ts`** — SQLite via better-sqlite3. Singleton `getDb()` lazy-initializes and runs schema migrations inline. WAL mode enabled. Tables: `history`, `snippets`, `stats`.
- **`server.ts`** — Express + WebSocket server on port 7789. Serves the dashboard SPA as static files and exposes REST API (`/api/history`, `/api/snippets`, `/api/stats`, `/api/settings`). `broadcast()` pushes real-time events to all connected WebSocket clients.

### Renderer (`src/renderer/`)
- **Pill window** — Frameless, always-on-top, transparent overlay. `PillApp.tsx` captures audio via `MediaRecorder`, sends PCM chunks over IPC (`sendAudioChunk`), and displays a waveform animation.
- **Settings window** — Lightweight BrowserWindow opened on demand; reads/writes settings via `electronAPI.getSettings`/`saveSettings`.

### Dashboard (`src/dashboard/`)
- React SPA rendered by the Express server at `http://localhost:7789`. Does NOT use Electron IPC — communicates only via HTTP REST and WebSocket (`ws://localhost:7789`). This means it also works in a regular browser.

### Data flow for transcription
1. User triggers hotkey → `startRecording()` in main
2. Main sends `start-audio-capture` to pill renderer
3. Renderer captures audio with `MediaRecorder` → sends `audio-chunk` IPC messages
4. `stopRecording()` concatenates PCM buffers → writes temp WAV → calls `nodewhisper`
5. Transcript is snippet-expanded, typed via AppleScript, saved to SQLite, broadcast to dashboard WebSocket clients

### Settings persistence
`electron-store` (JSON file in userData) stores: `whisperModel`, `language`, `pillX`, `pillY`. The store instance is passed into `startServer()` so REST API can read/write settings without importing from main.

### Native modules
`better-sqlite3` and `uiohook-napi` are native Node addons that must be rebuilt against the Electron Node version via `electron-rebuild`. Run `npm run postinstall` after any `npm install`.

### macOS specifics
- Text injection: clipboard paste via `osascript` (`cmd+v`) — requires Accessibility permission
- Global hotkeys: `uiohook-napi` (system-level hook) — works across all apps
- App is menu-bar only (`skipTaskbar: true`, no Dock icon)
- Build is unsigned (`identity: null`, `hardenedRuntime: false`) — users must right-click → Open on first launch
