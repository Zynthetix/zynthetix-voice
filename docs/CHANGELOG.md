# Changelog

All notable changes to Zynthetix Voice are documented here.

---

## [2.0.1] — 2026-02-23

### Fixed

- **`whisper-cli` ENOENT on fresh install** — `postinstall` now compiles `whisper.cpp` via cmake after
  rebuilding native Node modules. Previously, only `better-sqlite3` and `uiohook-napi` were rebuilt;
  the `whisper-cli` binary was never produced, causing a fatal ENOENT on every transcription attempt
  after a clean `npm install`. The build step is non-fatal (wrapped in `|| echo`) so installs on CI
  runners without cmake still succeed with a warning.

- **`dist` / `pack` shipped DMG without `whisper-cli`** — `dist` and `pack` scripts now run
  `npm run whisper:build` as a mandatory first step before `electron-builder`. Previously, if the cmake
  build had never run (or ran with broken flags), `electron-builder`'s `asarUnpack` would copy an empty
  directory into `app.asar.unpacked`, producing a release where every end-user got ENOENT on transcription.

- **`whisper:build` cmake flags** — Fixed three flag problems in the `whisper:build` script:
  - `-DGGML_METAL=OFF` → `-DGGML_METAL=ON` (re-enables Metal GPU acceleration on Apple Silicon)
  - Added `-DWHISPER_BUILD_EXAMPLES=ON` (ensures `whisper-cli` binary is built; it lives in the
    `examples/` cmake target which may be skipped without this flag)
  - Added `-DCMAKE_BUILD_TYPE=Release` (was defaulting to `Debug`; Release is ~3× faster at runtime)
  - Added `--parallel` to `cmake --build` (utilises all CPU cores; cuts build time from ~4 min → ~45 s
    on M-series chips)

- **Duplicate `ElectronAPI` TypeScript declarations** — `PillApp.tsx` and `SettingsApp.tsx` each
  declared their own local `interface ElectronAPI` and augmented `Window`, with the two interfaces
  being out of sync. This caused `TS2300` (duplicate identifier), `TS2339` (property does not exist on
  `Window`), and `TS7006`/`TS7031` (implicit `any`) errors that blocked CI. Fixed by introducing a
  single `src/renderer/electron.d.ts` as the authoritative type source (matching `preload.ts`
  exactly) and removing all local declarations from both components.

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
