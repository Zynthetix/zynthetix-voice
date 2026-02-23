# Changelog

All notable changes to Zynthetix Voice are documented here.

---

## [2.0.0] — 2024

### 🔄 Breaking Change: Deepgram → Local whisper.cpp
The cloud STT engine was replaced entirely with whisper.cpp running on-device. No API key or internet connection required after the initial model download.

### Added
- **Local transcription** via whisper.cpp with Metal GPU acceleration on Apple Silicon
- **Whisper model auto-download** on first use (base ~142 MB from HuggingFace); selectable in Settings
- **Web Dashboard** at `http://localhost:7789` — replaces the Electron settings window
- **Transcription History** tab — SQLite-backed, searchable, copy per entry
- **Snippets** tab — define trigger → expansion pairs; applied before pasting
- **Stats** tab — total words, sessions, recording time
- **Escape key** to cancel an active recording without transcribing
- **Live recording indicator** in dashboard (WebSocket `recording-state` events)
- **Model download progress bar** in dashboard Settings page
- **Auto-launch at login** toggle in Settings
- **History search** — client-side filter in History tab
- Tray icon changes to 🔴 while recording
- Port conflict dialog if port 7789 is already in use
- Whisper stderr logged for easier debugging
- Model name whitelist validation to prevent path issues
- Clipboard restored after each text injection

### Changed
- Settings are now managed via the web dashboard (no Electron settings window for model/language)
- Database moved from JSON files to SQLite (WAL mode) for reliability
- Whisper build now uses `-DGGML_METAL=ON` for GPU acceleration (previously disabled)

### Removed
- Deepgram API integration and `@deepgram/sdk` dependency
- API key setting
- Estimated cost display (no longer applicable — fully offline)

---

## [1.0.0] — 2024

### Added
- Floating always-on-top pill widget with animated waveform
- Real-time speech-to-text via Deepgram API (nova-3, smart formatting)
- Right Option key: double-tap = toggle recording, hold = push-to-talk
- Text injection via clipboard + `osascript` Cmd+V paste
- macOS menu bar tray icon with context menu
- Electron settings window (Deepgram API key, language)
- Pill position persistence via electron-store
- Right-click context menu on pill
