# Contributing to Zynthetix Voice

Thanks for your interest in contributing! This document covers how to set up the development environment, build the project, and submit changes.

---

## Prerequisites

- **macOS** with Apple Silicon (M1/M2/M3/M4)
- **Node.js** 18+ and npm
- **Xcode Command Line Tools** (`xcode-select --install`) — required for native module compilation and whisper.cpp build

---

## Setup

### 1. Clone and install

```bash
git clone https://github.com/Zynthetix/zynthetix-voice.git
cd zynthetix-voice
npm install
# Rebuilds native modules (better-sqlite3, uiohook-napi) for Electron
```

`npm install` automatically runs `postinstall` which calls `electron-rebuild`. This must succeed before the app will run.

### 2. Build whisper.cpp

The whisper binary is not bundled — you must compile it once:

```bash
npm run whisper:build
# Compiles whisper.cpp with Metal GPU acceleration for Apple Silicon
# Output: node_modules/nodejs-whisper/cpp/whisper.cpp/build/bin/whisper-cli
```

### 3. Download a Whisper model

```bash
npm run whisper:download
# Downloads the base model (~142 MB) to the models directory
# The app also auto-downloads on first transcription if not present
```

### 4. Run in development

```bash
npm run dev
# Starts Vite (HMR) + Electron concurrently
```

The dashboard is available at `http://localhost:7789`.

---

## Project Structure

```
src/
  main/
    main.ts       — Electron main: hotkeys, tray, Whisper, text injection
    preload.ts    — IPC bridge (contextBridge) between main and renderer
    db.ts         — SQLite via better-sqlite3 (history, snippets, stats)
    server.ts     — Express + WebSocket server on port 7789
  renderer/
    components/
      PillApp.tsx     — Floating pill widget with waveform
      SettingsApp.tsx — Electron settings window (model, language)
    pill.html / pill.tsx
    settings.html / settings.tsx
  dashboard/
    App.tsx       — Dashboard SPA (history, snippets, stats, settings)
    index.html / main.tsx
```

---

## Build Commands

```bash
npm run build          # Build renderer (Vite) + main (tsc)
npm run build:renderer # Vite build → dist/renderer/
npm run build:main     # tsc → dist/main/
npm run start          # Build + launch Electron (production mode)
npm run pack           # Build distributable .app (no DMG)
npm run dist           # Build distributable .dmg → release/
```

---

## TypeScript

Two separate TypeScript configs:

| Config | Scope | Output |
|---|---|---|
| `tsconfig.json` | Renderer + Dashboard | noEmit (Vite handles bundling) |
| `tsconfig.main.json` | Main process only | `dist/main/` (CommonJS) |

Always check both before submitting a PR:

```bash
npx tsc -p tsconfig.main.json --noEmit
npx tsc -p tsconfig.json --noEmit
```

---

## Native Modules

`better-sqlite3` and `uiohook-napi` are native Node addons that must be compiled against the Electron Node ABI. After any `npm install` (including updating Electron), run:

```bash
npm run postinstall
# Equivalent to: electron-rebuild -f -w better-sqlite3,uiohook-napi
```

---

## Submitting a PR

1. Fork the repo and create a branch: `git checkout -b feature/your-feature`
2. Make your changes with minimal scope
3. Verify TypeScript: `npx tsc -p tsconfig.main.json --noEmit && npx tsc -p tsconfig.json --noEmit`
4. Test the app: `npm run dev`
5. Submit a PR with a clear description of what changed and why

---

## Code Style

- TypeScript strict mode is enabled — no implicit `any`
- Keep changes minimal and surgical
- Comment non-obvious logic; avoid commenting obvious code
- Follow the existing module boundaries: no Electron imports in renderer code, no DOM APIs in main process code
