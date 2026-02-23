# Installation Issues — Root Causes & Fixes

Tracked issues discovered during v2.0.0 → v2.0.1 stabilization pass.

---

## Issue 1 — `postinstall` never compiled `whisper-cli`

**Severity:** Critical (transcription broken on every fresh install)

**Symptom**
```
Transcription error: Error: spawn …/nodejs-whisper/cpp/whisper.cpp/build/bin/whisper-cli ENOENT
```
The binary simply did not exist. Running `npm install` left the project in a state where the app started correctly but crashed the moment any audio was recorded.

**Root cause**
`postinstall` only ran `electron-rebuild` to rebuild the two native `.node` addons (`better-sqlite3`, `uiohook-napi`) for the Electron ABI. It never triggered the cmake compile of `whisper.cpp` that produces the `whisper-cli` binary.

**Fix (v2.0.1)**
`postinstall` now runs `npm run whisper:build` after `electron-rebuild`. The whisper build step is wrapped in `|| echo …` so that `npm install` does not fail on a machine without cmake (e.g. bare CI runners) — it prints a warning and continues. The binary must be present before packaging (see Issue 3).

---

## Issue 2 — `whisper:build` script had wrong cmake flags

**Severity:** High (Metal GPU disabled, build may not produce `whisper-cli`)

**Symptom**
- Transcription was slow (CPU-only) even on Apple Silicon M-series chips.
- On newer whisper.cpp versions, `whisper-cli` might not be built at all since the examples target was not explicitly requested.

**Root cause**
The `whisper:build` npm script used:
```
cmake -B build -DGGML_METAL=OFF -DWHISPER_ACCELERATE=ON
```
Problems:
| Flag                                    | Issue                                                                                          |
| --------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `-DGGML_METAL=OFF`                      | Explicitly disabled Metal GPU — all inference ran on CPU                                       |
| Missing `-DWHISPER_BUILD_EXAMPLES=ON`   | The `whisper-cli` binary lives in the `examples/` subtree; without this flag it may be skipped |
| Missing `-DCMAKE_BUILD_TYPE=Release`    | Defaulted to `Debug` builds — significantly larger binary, much slower at runtime              |
| Missing `--parallel` on `cmake --build` | Build used a single core, making it ~8× slower on M-series chips                               |

**Fix (v2.0.1)**
```
cmake -B build \
  -DGGML_METAL=ON \
  -DWHISPER_ACCELERATE=ON \
  -DWHISPER_BUILD_EXAMPLES=ON \
  -DCMAKE_BUILD_TYPE=Release \
&& cmake --build build --config Release --parallel
```

---

## Issue 3 — DMG packaged without `whisper-cli` binary

**Severity:** Critical (transcription broken for every DMG end-user)

**Symptom**
Every user who downloaded the v2.0.0 `.dmg` and tried to transcribe got:
```
Transcription error: Error: spawn …/app.asar.unpacked/node_modules/nodejs-whisper/…/whisper-cli ENOENT
```

**Root cause**
The `dist` and `pack` npm scripts called `electron-builder` without first ensuring the `whisper-cli` binary existed:
```json
"dist": "npm run build && electron-builder --mac"
```
`electron-builder`'s `asarUnpack` correctly copies `node_modules/nodejs-whisper/**/*` into `app.asar.unpacked/` — but it only copies what is *already on disk*. If the cmake build was never run (or run with broken flags — see Issue 2), the `build/bin/whisper-cli` path simply didn't exist, so nothing was unpacked. End users received a completely broken app.

**Fix (v2.0.1)**
`dist` and `pack` now explicitly compile whisper before building:
```json
"dist": "npm run whisper:build && npm run build && electron-builder --mac",
"pack": "npm run whisper:build && npm run build && electron-builder --mac --dir"
```
Unlike `postinstall`, this step is **not** wrapped in `|| true` — if cmake fails, the packaging step fails, preventing a broken DMG from being produced.

---

## TypeScript — Duplicate `ElectronAPI` declarations

**Severity:** Build-blocking (CI type-check failure)

**Symptom**
```
error TS2300: Duplicate identifier 'ElectronAPI'
error TS2339: Property 'electronAPI' does not exist on type 'Window & typeof globalThis'
error TS7006: Parameter 's' implicitly has an 'any' type
```

**Root cause**
Both `PillApp.tsx` and `SettingsApp.tsx` each declared a **local** `interface ElectronAPI` and augmented `Window` with it. TypeScript merges the two `Window` augmentations but treats the two `ElectronAPI` interfaces as separate types — the merged `electronAPI` property has an unresolvable type, making it effectively `any`.

Additionally, the two local interfaces were out of sync:
- `PillApp.tsx`'s `ElectronAPI` was missing `getSettings` / `saveSettings`
- `SettingsApp.tsx`'s `ElectronAPI` was missing all the audio/IPC methods

**Fix (v2.0.1)**
- Created `src/renderer/electron.d.ts` as the single source of truth, containing the **complete** interface matching `src/main/preload.ts` exactly.
- `export {}` at the top of the file makes it a TypeScript module, which is required for `declare global {}` to be syntactically valid.
- Removed all local `interface ElectronAPI` / `declare global` blocks from `PillApp.tsx` and `SettingsApp.tsx`.
- Added explicit callback type `(s: { whisperModel: string; language: string })` to the `.then()` in `SettingsApp.tsx` to satisfy `strict: true` / `noImplicitAny`.

---

## Checklist for contributors building a release DMG

Before running `npm run dist`, confirm:

- [ ] Xcode Command Line Tools installed (`xcode-select --install`)
- [ ] cmake ≥ 3.12 available (`cmake --version`)
- [ ] `npm install` completed (builds native addons + whisper-cli via `postinstall`)
- [ ] `node_modules/nodejs-whisper/cpp/whisper.cpp/build/bin/whisper-cli` exists
- [ ] `assets/icons/icon.icns` exists (run `iconutil` if regenerating)
- [ ] `npm run dist` — output in `release/`
