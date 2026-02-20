# Zynthetix Voice - PRD & Implementation Plan

## Product Overview
A WisprFlow-like macOS speech-to-text app that inserts transcribed text wherever the user's cursor is. Features a floating always-on-top pill widget with audio visualization, powered by Deepgram's real-time streaming API.

## Core Requirements

### Platform & Stack
- **Platform:** macOS only
- **Tech:** Electron + React + TypeScript
- **STT Engine:** Deepgram API (real-time streaming with built-in smart formatting)
- **Text Insertion:** macOS Accessibility API (simulate keystrokes — works in any app)
- **Language:** English only (MVP)

### UI/UX
- **Floating Pill Widget:** Always-on-top, dark theme with accent color (purple/blue), shows animated waveform/pulse when recording, static mic icon when idle
- **Menu Bar (Tray) Icon:** Quick access to settings, toggle recording, quit
- **Settings Window:** API key input, keyboard shortcut config, language selection
- **Activation:** Global keyboard shortcut (default: Cmd+Shift+Space)

### Core Functionality
1. **Global Hotkey** → toggles recording on/off from any app
2. **Audio Capture** → capture microphone input via Web Audio API / node-audio
3. **Real-time Streaming** → stream audio to Deepgram, get transcription back in real-time
4. **Smart Formatting** → Deepgram's built-in: auto-punctuation, filler word removal, smart casing
5. **Keystroke Injection** → use macOS Accessibility API to type transcribed text at cursor position in any app
6. **Audio Visualization** → animated waveform/pulse in the floating pill during recording

### Permissions Required
- **Microphone Access** — for audio capture
- **Accessibility Access** — for keystroke injection into other apps
- **Screen Recording** (optional) — may be needed for some cursor position detection

## Architecture

```
┌─────────────────────────────────────────┐
│  Electron Main Process                  │
│  ├─ Global shortcut registration        │
│  ├─ Tray/menu bar management            │
│  ├─ Accessibility API (keystroke inject) │
│  ├─ Settings store (electron-store)     │
│  └─ Audio capture (mic → PCM stream)    │
├─────────────────────────────────────────┤
│  Electron Renderer (React + TS)         │
│  ├─ Floating pill window (BrowserWindow)│
│  ├─ Audio waveform visualization        │
│  ├─ Settings window                     │
│  └─ State management                   │
├─────────────────────────────────────────┤
│  Deepgram WebSocket                     │
│  └─ Real-time streaming STT            │
└─────────────────────────────────────────┘
```

## Implementation Todos

1. **project-setup** — Initialize Electron + React + TypeScript project with build tooling
2. **floating-pill-ui** — Create the floating always-on-top pill window with dark theme, mic icon, waveform animation
3. **tray-icon** — Add menu bar tray icon with toggle, settings, quit options
4. **global-shortcut** — Register global keyboard shortcut (Cmd+Shift+Space) to toggle recording
5. **audio-capture** — Capture microphone audio as PCM stream in Electron main process
6. **deepgram-streaming** — Connect to Deepgram WebSocket, stream audio, receive real-time transcription
7. **keystroke-injection** — Use macOS Accessibility API (via native module / AppleScript) to type text at cursor
8. **settings-window** — Settings UI for API key, shortcut config, language selection (persisted via electron-store)
9. **wiring-integration** — Wire all pieces together: shortcut → capture → stream → transcribe → inject
10. **packaging** — Package as .dmg for macOS distribution

## Dependencies (key packages)
- `electron` + `electron-builder`
- `react` + `react-dom` + `typescript`
- `@deepgram/sdk` (or raw WebSocket)
- `electron-store` (settings persistence)
- `node-global-shortcut` (built into Electron)
- Native module or AppleScript bridge for keystroke injection

## Notes
- Accessibility permission prompt must be handled gracefully on first launch
- The floating pill should be frameless, transparent, and not appear in the dock/taskbar
- Audio visualization can use Web Audio API's AnalyserNode for frequency data
- Deepgram's `smart_format=true` handles punctuation, filler removal, and casing
