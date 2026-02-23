# Zynthetix Voice - PRD & Implementation Plan

## Product Overview
A WisprFlow-like macOS speech-to-text app that inserts transcribed text wherever the user's cursor is. Features a floating always-on-top pill widget with audio visualization, powered by Deepgram's real-time streaming API.

---

## v1 — Shipped ✅

### Stack
- **Platform:** macOS only
- **Tech:** Electron + React + TypeScript
- **STT Engine:** Deepgram API (nova-3, real-time streaming, smart formatting)
- **Text Insertion:** Clipboard + Cmd+V (works in any app)
- **Language:** English only

### Features Shipped
- Floating always-on-top pill widget (dark theme, purple/blue accent)
- Animated waveform (28 bars, real frequency data while recording, breathing idle animation)
- Right Option key: double-tap = toggle, hold = push-to-talk
- macOS Accessibility API keystroke injection
- Menu bar tray icon (toggle, settings, quit)
- Settings window (API key, language)
- Position persistence (drag pill anywhere, remembered on relaunch)
- Right-click context menu on pill

---

## v2 — In Development 🚧

### New Architecture
The Electron settings window is **replaced** with a full web dashboard served on a local port (`localhost:7789`). Port is printed clearly in terminal on launch. The dashboard provides all customization and monitoring in a rich browser UI.

### v2 Features

#### 1. Live Interim Text in Pill
- While speaking, Deepgram `interim_results` appear greyed-out in the pill
- Only final, clean transcript gets pasted to cursor
- Pill shows a ghost preview of what's being transcribed in real-time

#### 2. Transcription History
- Every final transcript saved with timestamp, word count, duration
- Viewable in dashboard History tab
- One-click copy button per entry
- Stored in `userData/history.json`, capped at 1000 entries

#### 3. Snippets / Text Shortcuts
- User defines trigger phrases → expansion text
- Example: "my email" → "karthik@zynthetix.com"
- After each final transcript, triggers are matched and auto-replaced before pasting
- Managed in dashboard Snippets tab

#### 4. Sound Feedback
- Soft start beep when recording begins
- Soft stop click when recording ends
- Generated via Web Audio API (no audio files needed)

#### 5. Usage Stats
- Total words dictated, total sessions, total recording time
- Estimated Deepgram API cost (based on audio duration @ $0.0059/min for nova-3)
- Shown in dashboard Stats tab, reset button available

#### 6. Bigger Pill + Dramatic Glow
- Pill scale-up animation when recording starts
- More intense multi-layered box-shadow glow
- Pulsing ring effect around pill while recording

### Web Dashboard (`localhost:7789`)
Single-page React app served by Express inside the Electron main process.
Real-time updates via WebSocket.

**Tabs:**
- **Settings** — API key, language, dashboard port
- **Snippets** — Add/edit/delete trigger→expansion pairs
- **History** — Live feed of all dictations, search, copy, clear
- **Stats** — Words, sessions, time, cost estimate

### WebSocket Events (`ws://localhost:7789`)
```
server → client:
  { type: 'status', recording: boolean }
  { type: 'interim', text: string }
  { type: 'final', text: string, wordCount: number }
  { type: 'history_update', entry: HistoryEntry }
  { type: 'stats_update', stats: Stats }
```

### REST API
```
GET/POST  /api/settings
GET/POST/PUT/DELETE  /api/snippets
GET/DELETE  /api/history
GET  /api/stats
POST /api/stats/reset
```

---

## Architecture

```
┌─────────────────────────────────────────┐
│  Electron Main Process                  │
│  ├─ uiohook (Right Option key)          │
│  ├─ Tray/menu bar                       │
│  ├─ Deepgram WebSocket (STT)            │
│  ├─ Snippets matching                   │
│  ├─ History & stats persistence         │
│  └─ Express + WebSocket server :7789    │
├─────────────────────────────────────────┤
│  Electron Renderer                      │
│  └─ Floating pill (always-on-top)       │
│     ├─ Waveform + interim text          │
│     └─ Sound feedback (Web Audio)       │
├─────────────────────────────────────────┤
│  Web Dashboard (localhost:7789)         │
│  ├─ Settings tab                        │
│  ├─ Snippets tab                        │
│  ├─ History tab (real-time WS)          │
│  └─ Stats tab (real-time WS)            │
├─────────────────────────────────────────┤
│  Deepgram WebSocket                     │
│  └─ nova-3, smart_format, interim       │
└─────────────────────────────────────────┘
```

## Key Packages
- `electron` + `electron-builder`
- `react` + `react-dom` + `typescript`
- `@deepgram/sdk`
- `electron-store` (settings, snippets, stats)
- `express` (dashboard HTTP server)
- `ws` (WebSocket for real-time dashboard)
- `uiohook-napi` (Right Option key detection)
