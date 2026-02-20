# Zynthetix Voice

A WisprFlow-like macOS speech-to-text app. Press a hotkey and speak — your words appear wherever your cursor is.

## Features
- 🎤 Floating pill widget with animated audio waveform
- ⌨️ Global hotkey (`Cmd+Shift+Space`) works in any app
- 🧠 Deepgram real-time streaming STT with smart formatting
- 📝 Inserts text via macOS Accessibility API (types at cursor)
- 🔧 Settings window for API key, shortcut, and language
- 🗂 Menu bar tray icon

## Quick Start

### 1. Install dependencies
```bash
npm install
```

### 2. Get a Deepgram API key
Sign up free at [console.deepgram.com](https://console.deepgram.com) — you get $200 free credits.

### 3. Build & run
```bash
# Production (uses built files)
npm run build
npm run start

# Development (Vite hot-reload + Electron)
npm run dev
```

### 4. First launch setup
1. The app lives in your **menu bar** (no dock icon)
2. Click the tray icon → **Settings**
3. Paste your Deepgram API key
4. Grant **Accessibility** permission when prompted (System Settings → Privacy & Security → Accessibility)
5. Grant **Microphone** permission when prompted

### 5. Dictate
1. Click anywhere you want to type (text field, browser, Slack, etc.)
2. Press **⌘⇧Space** to start recording (pill turns purple + waveform animates)
3. Speak naturally
4. Press **⌘⇧Space** again to stop — text is typed at your cursor

## Permissions Required
| Permission | Why |
|---|---|
| Microphone | Capture your voice |
| Accessibility | Type text into other apps |

## Project Structure
```
src/
  main/
    main.ts       — Electron main process (shortcuts, tray, STT, keystroke injection)
    preload.ts    — IPC bridge between main and renderer
  renderer/
    components/
      PillApp.tsx     — Floating pill with waveform visualization
      SettingsApp.tsx — Settings window
    pill.html / pill.tsx
    settings.html / settings.tsx
```

## Build for distribution
```bash
npm run dist
# Output: release/Zynthetix Voice-1.0.0.dmg
```
