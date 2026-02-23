# Electron + macOS Tahoe (26.x) Fix

## Symptoms

- Electron crashes immediately on launch with `SIGABRT` or `SIGSEGV`
- `process.type` is `undefined` instead of `'browser'`
- `require('electron')` returns a string path instead of the API (`app`, `ipcMain`, etc.)
- uiohook-napi crashes with `Accessibility API is disabled!`

## Root Causes & Fixes

### 1. `ELECTRON_RUN_AS_NODE=1` inherited from parent process

When running inside an Electron-based parent app (e.g. Antigravity, VS Code), the env var `ELECTRON_RUN_AS_NODE=1` is inherited by child processes. This makes Electron behave as plain Node.js — no `app`, no `ipcMain`, nothing.

**Fix:** Explicitly unset it in `package.json` scripts:

```json
"dev:main": "wait-on tcp:5173 && ELECTRON_RUN_AS_NODE= NODE_ENV=development electron .",
"start": "ELECTRON_RUN_AS_NODE= NODE_ENV=production electron ."
```

### 2. uiohook-napi crashes if Accessibility is not granted

uiohook-napi calls C-level `abort()` (not a JS exception) if macOS Accessibility API access is denied — a try/catch won't save you. On macOS Tahoe, `systemPreferences.isTrustedAccessibilityClient()` can return `true` even when the low-level API still rejects.

**Fix:** Use a two-phase check before calling `uIOhook.start()`, retrying every 5 s until both pass:

1. `systemPreferences.isTrustedAccessibilityClient(true)` — prompts the user
2. A real `osascript` test against System Events — catches Tahoe false-positives

See `tryStartUIOhook()` and `isAccessibilityReallyAvailable()` in `src/main/main.ts`.

Grant access via **System Settings → Privacy & Security → Accessibility**.

### 3. Vite port collision

If port 5173 is already in use Vite silently moves to 5174, breaking all hardcoded `localhost:5173` URLs in the main process.

**Fix:** Add `strictPort: true` to `vite.config.ts` so Vite errors out instead of silently switching:

```ts
server: {
  port: 5173,
  strictPort: true
}
```

To free a stuck port: `lsof -ti :5173 | xargs kill -9`

### 4. Missing `whisper-cli` binary

The whisper-cli binary must be compiled locally — it is not shipped as a pre-built artifact.

**Fix:**

```bash
npm run whisper:build
```

This runs cmake to build `whisper-cli` inside `node_modules/nodejs-whisper/cpp/whisper.cpp/build/bin/`.

The base model also needs to be downloaded on first run — the app handles this automatically, or run `npm run whisper:download`.
