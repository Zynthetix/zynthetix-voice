# Zynthetix Voice

A WisprFlow-like macOS speech-to-text app. Press a hotkey and speak — your words are typed wherever your cursor is. **Runs 100% locally using whisper.cpp — no API key, no internet, no subscription required.**

## Download

**[⬇ Download Zynthetix Voice-2.0.0-arm64.dmg](https://github.com/Zynthetix/zynthetix-voice/releases/download/v2.0.0/Zynthetix%20Voice-2.0.0-arm64.dmg)**

> Requires macOS with Apple Silicon (M1/M2/M3/M4). No Node.js or project setup needed — just download, open the DMG, and drag the app to your Applications folder.

### First launch (unsigned build)
Since this build is not notarized, macOS will block it on first open. To bypass:
1. Right-click **Zynthetix Voice.app** → **Open**
2. Click **Open** in the dialog

You only need to do this once.

---

## Features

- 🎤 Floating pill widget with animated audio waveform
- ⌥ Global hotkey (double-tap **Right ⌥** or hold to push-to-talk) works in any app
- 🧠 **Local speech-to-text via whisper.cpp** — fully offline, no API key needed
- 📥 Whisper model auto-downloads on first use (base model ~142 MB, from HuggingFace)
- 📝 Inserts text via clipboard paste (Cmd+V) using macOS Accessibility
- 🗂 Lives in the menu bar — no Dock icon
- 📊 Dashboard: transcription history, text snippets, stats, and settings
- 🔤 Text snippet expansion — say a trigger word → full text is inserted
- 🌍 Multi-language support (English, Spanish, French, German, Japanese, and more)

---

## Setup (after installing)

### 1. Grant permissions on first launch
1. The app lives in your **menu bar** — look for the 🎙 icon
2. Grant **Microphone** permission when prompted
3. Grant **Accessibility** permission when prompted (System Settings → Privacy & Security → Accessibility)
   - This is required to paste transcribed text into other apps

### 2. Whisper model auto-download
On first transcription, Zynthetix Voice automatically downloads the **base** Whisper model (~142 MB) from HuggingFace. The tray icon shows download progress (`🎙 45%`). You only need internet once — after that, everything is offline.

To change the model, open **Settings** from the tray menu. Available models:
| Model  | Size    | Speed   | Accuracy |
| ------ | ------- | ------- | -------- |
| Tiny   | ~75 MB  | Fastest | Good     |
| Base   | ~142 MB | Fast    | Better   |
| Small  | ~462 MB | Medium  | Great    |
| Medium | ~1.5 GB | Slower  | Best     |

### 3. Dictate
1. Click anywhere you want to type (text field, browser, Slack, etc.)
2. **Double-tap Right ⌥** to start recording (pill animates)
3. Speak naturally
4. **Double-tap Right ⌥** again to stop — text is pasted at your cursor

> **Push-to-talk:** Hold **Right ⌥** while speaking, release to insert.

## Permissions Required
| Permission    | Why                                            |
| ------------- | ---------------------------------------------- |
| Microphone    | Capture your voice                             |
| Accessibility | Paste transcribed text into other apps (Cmd+V) |

---

## Developer Setup

For contributors or local development:

### Install dependencies
```bash
npm install
# Rebuilds native modules (better-sqlite3, uiohook-napi) for Electron
```

### Run in development
```bash
# Vite hot-reload + Electron
npm run dev
```

### Build for production
```bash
npm run build
npm run start
```

### Build distributable DMG
```bash
npm run dist
# Output: release/Zynthetix Voice-2.0.0-arm64.dmg
```

### Download & build Whisper model (for dev)
```bash
# Download base model (~142 MB)
npm run whisper:download

# Build whisper.cpp binary (required on first setup)
npm run whisper:build
```

## Project Structure
```
src/
  main/
    main.ts       — Electron main: hotkeys, tray, Whisper transcription, text injection
    preload.ts    — IPC bridge between main and renderer
    db.ts         — SQLite (history, snippets, stats) via better-sqlite3
    server.ts     — Local HTTP + WebSocket server for dashboard (port 7789)
  renderer/
    components/
      PillApp.tsx     — Floating pill with live waveform visualization
      SettingsApp.tsx — Settings window (model, language)
    pill.html / pill.tsx
    settings.html / settings.tsx
  dashboard/
    App.tsx       — Dashboard SPA (history, snippets, stats, settings)
    index.html / main.tsx
```

## Architecture Notes
- **Transcription**: `whisper.cpp` binary runs as a child process on a temp WAV file; output is cleaned of timestamp markers before insertion
- **Text injection**: Writes to clipboard then triggers `osascript cmd+v` paste — no direct keystroke simulation
- **Dashboard**: React SPA served by Express at `http://localhost:7789`; works in a regular browser too
- **Settings persistence**: `electron-store` (JSON) stores `whisperModel`, `language`, `pillX`, `pillY`
