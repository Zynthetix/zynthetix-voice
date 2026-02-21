# Zynthetix Voice

A WisprFlow-like macOS speech-to-text app. Press a hotkey and speak — your words are typed wherever your cursor is.

## Download

**[⬇ Download Zynthetix Voice-1.1.0-arm64.dmg](https://github.com/Zynthetix/zynthetix-voice/releases/latest/download/Zynthetix.Voice-1.1.0-arm64.dmg)**

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
- 🧠 Deepgram real-time streaming STT with smart formatting
- 📝 Inserts text via macOS Accessibility API (types at cursor)
- 🗂 Lives in the menu bar — no Dock icon
- 📊 Dashboard: transcription history, text snippets, stats, and settings
- 🔤 Text snippet expansion — say a trigger word → full text is inserted

---

## Setup (after installing)

### 1. Get a Deepgram API key
Sign up free at [console.deepgram.com](https://console.deepgram.com) — you get **$200 in free credits**, which is enough for **~1 year of regular use**.

> 💡 Go to [console.deepgram.com](https://console.deepgram.com) → Create a free account → Create a new project → Generate an API key. No credit card required. $200 covers roughly 560 hours of transcription at nova-3 pricing ($0.0059/min).

### 2. First launch
1. The app lives in your **menu bar** (no dock icon)
2. Click the tray icon → **Settings**
3. Paste your Deepgram API key
4. Grant **Accessibility** permission when prompted (System Settings → Privacy & Security → Accessibility)
5. Grant **Microphone** permission when prompted

### 3. Dictate
1. Click anywhere you want to type (text field, browser, Slack, etc.)
2. **Double-tap Right ⌥** to start recording (pill animates)
3. Speak naturally
4. **Double-tap Right ⌥** again to stop — text is typed at your cursor

> **Push-to-talk:** Hold **Right ⌥** while speaking, release to insert.

## Permissions Required
| Permission | Why |
|---|---|
| Microphone | Capture your voice |
| Accessibility | Type text into other apps |

---

## Developer Setup

For contributors or local development:

### Install dependencies
```bash
npm install
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
# Output: release/Zynthetix Voice-1.1.0-arm64.dmg
```

## Project Structure
```
src/
  main/
    main.ts       — Electron main process (hotkeys, tray, STT, keystroke injection)
    preload.ts    — IPC bridge between main and renderer
    db.ts         — SQLite database (history, snippets, stats)
    server.ts     — Local HTTP + WebSocket server for dashboard
  renderer/
    components/
      PillApp.tsx     — Floating pill with waveform visualization
      SettingsApp.tsx — Settings window
    pill.html / pill.tsx
    settings.html / settings.tsx
  dashboard/
    App.tsx       — Dashboard SPA (history, snippets, stats, settings)
    index.html / main.tsx
```
