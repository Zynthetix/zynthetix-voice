import { spawn, spawnSync } from 'child_process';
import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
  screen,
  shell,
  Tray,
} from 'electron';
import Store from 'electron-store';
import fs from 'fs';
import https from 'https';
import os from 'os';
import path from 'path';
import { uIOhook, UiohookKey } from 'uiohook-napi';
import { applySnippets, incrementStats, initDb, insertHistory } from './db';
import { broadcast, DASHBOARD_PORT, startServer } from './server';

const isDev = process.env.NODE_ENV === 'development';
const store = new Store<{
  whisperModel: string;
  language: string;
  pillX: number;
  pillY: number;
}>();

let pillWindow: BrowserWindow | null = null;
let settingsWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

// ─── Model management ─────────────────────────────────────────────────────────
const MODEL_FILES: Record<string, string> = {
  tiny: 'ggml-tiny.bin',
  base: 'ggml-base.bin',
  small: 'ggml-small.bin',
  medium: 'ggml-medium.bin',
};

function getWhisperModelsDir(): string {
  // In packaged app, nodejs-whisper is in app.asar.unpacked (via asarUnpack).
  // In dev, it's a regular node_modules path.
  return app.isPackaged
    ? path.join(
        process.resourcesPath,
        'app.asar.unpacked',
        'node_modules',
        'nodejs-whisper',
        'cpp',
        'whisper.cpp',
        'models'
      )
    : path.join(
        __dirname,
        '../../node_modules/nodejs-whisper/cpp/whisper.cpp/models'
      );
}

function modelExists(modelName: string): boolean {
  const filename = MODEL_FILES[modelName] ?? `ggml-${modelName}.bin`;
  return fs.existsSync(path.join(getWhisperModelsDir(), filename));
}

async function downloadModel(modelName: string): Promise<void> {
  const filename = MODEL_FILES[modelName] ?? `ggml-${modelName}.bin`;
  const dest = path.join(getWhisperModelsDir(), filename);
  fs.mkdirSync(path.dirname(dest), { recursive: true });

  const url = `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/${filename}`;

  return new Promise((resolve, reject) => {
    const doDownload = (downloadUrl: string, redirectCount = 0) => {
      if (redirectCount > 5) {
        reject(new Error('Too many redirects'));
        return;
      }
      https
        .get(downloadUrl, (res) => {
          const loc = res.headers.location;
          if (
            (res.statusCode === 301 ||
              res.statusCode === 302 ||
              res.statusCode === 307 ||
              res.statusCode === 308) &&
            loc
          ) {
            doDownload(loc, redirectCount + 1);
            return;
          }
          if (res.statusCode !== 200) {
            reject(new Error(`Download failed: HTTP ${res.statusCode}`));
            return;
          }
          const total = parseInt(res.headers['content-length'] ?? '0', 10);
          let received = 0;
          const file = fs.createWriteStream(dest);
          res.on('data', (chunk: Buffer) => {
            received += chunk.length;
            if (total > 0 && tray) {
              const pct = Math.round((received / total) * 100);
              tray.setTitle(`🎙 ${pct}%`);
            }
          });
          res.pipe(file);
          file.on('finish', () => {
            file.close();
            tray?.setTitle('🎙');
            resolve();
          });
          file.on('error', (err) => {
            try {
              fs.unlinkSync(dest);
            } catch {
              /* ignore */
            }
            reject(err);
          });
        })
        .on('error', reject);
    };
    doDownload(url);
  });
}

async function ensureModelReady(modelName: string): Promise<void> {
  if (modelExists(modelName)) return;
  console.log(`[whisper] Model "${modelName}" not found — downloading…`);
  tray?.setTitle('🎙 DL…');
  pillWindow?.webContents.send('state-change', { state: 'processing' });
  try {
    await downloadModel(modelName);
    console.log(`[whisper] Model "${modelName}" ready.`);
  } catch (err) {
    console.error('[whisper] Model download failed:', err);
    pillWindow?.webContents.send('state-change', {
      state: 'error',
      message: `Model download failed: ${err}`,
    });
    setTimeout(
      () => pillWindow?.webContents.send('state-change', { state: 'idle' }),
      4000
    );
    throw err;
  } finally {
    tray?.setTitle('🎙');
    pillWindow?.webContents.send('state-change', { state: 'idle' });
  }
}

function getWhisperBinaryPath(): string {
  const bin = 'whisper-cli';
  return app.isPackaged
    ? path.join(
        process.resourcesPath,
        'app.asar.unpacked',
        'node_modules',
        'nodejs-whisper',
        'cpp',
        'whisper.cpp',
        'build',
        'bin',
        bin
      )
    : path.join(
        __dirname,
        '../../node_modules/nodejs-whisper/cpp/whisper.cpp/build/bin',
        bin
      );
}

function runWhisper(
  wavFile: string,
  modelName: string,
  language: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    const modelFile = path.join(
      getWhisperModelsDir(),
      MODEL_FILES[modelName] ?? `ggml-${modelName}.bin`
    );
    const proc = spawn(
      getWhisperBinaryPath(),
      ['-l', language, '-m', modelFile, '-f', wavFile],
      { stdio: ['ignore', 'pipe', 'ignore'] } // silence all binary output
    );
    let out = '';
    proc.stdout.on('data', (d: Buffer) => {
      out += d.toString();
    });
    proc.on('close', (code) => {
      if (code === 0) resolve(out);
      else reject(new Error(`whisper-cli exited with code ${code}`));
    });
    proc.on('error', reject);
  });
}

const audioBuffer: Buffer[] = []; // accumulates raw PCM while recording
let isRecording = false;
let recordingStartTime = 0;
let sessionWords = 0;

// ─── Window helpers ───────────────────────────────────────────────────────────
function pillHtmlPath(page: string) {
  if (isDev) return `http://localhost:5173/src/renderer/${page}.html`;
  return path.join(__dirname, `../../renderer/src/renderer/${page}.html`);
}

function createSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus();
    return;
  }
  settingsWindow = new BrowserWindow({
    width: 420,
    height: 560,
    minWidth: 380,
    minHeight: 480,
    title: 'Zynthetix Voice — Settings',
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0F0F10',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
    },
  });
  settingsWindow.loadURL(
    isDev
      ? `http://localhost:5173/src/renderer/settings.html`
      : `file://${path.join(__dirname, '../renderer/src/renderer/settings.html')}`
  );
  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
}

function createPillWindow() {
  const { width } = screen.getPrimaryDisplay().workAreaSize;
  const x = (store.get('pillX') as number) ?? width - 210;
  const y = (store.get('pillY') as number) ?? 20;
  pillWindow = new BrowserWindow({
    x,
    y,
    width: 200,
    height: 56,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    hasShadow: false,
    skipTaskbar: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
    },
    vibrancy: undefined,
  });
  pillWindow.setAlwaysOnTop(true, 'screen-saver');
  pillWindow.loadURL(
    isDev
      ? `http://localhost:5173/src/renderer/pill.html`
      : `file://${path.join(__dirname, '../renderer/src/renderer/pill.html')}`
  );
  pillWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  pillWindow.on('moved', () => {
    if (!pillWindow) return;
    const [px, py] = pillWindow.getPosition();
    store.set('pillX', px);
    store.set('pillY', py);
  });
}

function createTray() {
  const icon = nativeImage.createEmpty();
  tray = new Tray(icon);
  tray.setTitle('🎙');
  tray.setToolTip('Zynthetix Voice');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: 'Open Dashboard',
        click: () => shell.openExternal(`http://localhost:${DASHBOARD_PORT}`),
      },
      { label: 'Settings', click: () => createSettingsWindow() },
      { type: 'separator' },
      {
        label: 'Toggle Recording',
        click: () => RecordingController.toggleRecording(),
      },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() },
    ])
  );
}

// ─── IPC ─────────────────────────────────────────────────────────────────────
ipcMain.on('audio-chunk', (_e, chunk: ArrayBuffer) => {
  if (!isRecording) return;
  audioBuffer.push(Buffer.from(chunk));
});

ipcMain.on('open-settings', () => createSettingsWindow());

ipcMain.on('show-context-menu', () => {
  if (!pillWindow) return;
  const menu = Menu.buildFromTemplate([
    {
      label: isRecording ? 'Stop Recording' : 'Start Recording',
      click: () => RecordingController.toggleRecording(),
    },
    {
      label: 'Open Dashboard',
      click: () => shell.openExternal(`http://localhost:${DASHBOARD_PORT}`),
    },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]);
  menu.popup({ window: pillWindow! });
});

ipcMain.on(
  'final-transcript-for-stats',
  (_e, { wordCount }: { wordCount: number }) => {
    sessionWords += wordCount;
  }
);

ipcMain.handle('get-settings', () => ({
  whisperModel: store.get('whisperModel') || 'base',
  language: store.get('language') || 'en',
}));

ipcMain.handle(
  'save-settings',
  (_e, s: { whisperModel?: string; language?: string }) => {
    if (s.whisperModel) store.set('whisperModel', s.whisperModel);
    if (s.language) store.set('language', s.language);
    return { ok: true };
  }
);

// ─── Text injection ────────────────────────────────────────────────────────────
function typeText(text: string) {
  if (!text.trim()) return;
  clipboard.writeText(text);
  spawnSync('osascript', [
    '-e',
    'tell application "System Events" to keystroke "v" using {command down}',
  ]);
}

// ─── WAV helper ───────────────────────────────────────────────────────────────
function createWav(
  pcm: Buffer,
  sampleRate = 16000,
  channels = 1,
  bitDepth = 16
): Buffer {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * channels * (bitDepth / 8), 28);
  header.writeUInt16LE(channels * (bitDepth / 8), 32);
  header.writeUInt16LE(bitDepth, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

// ─── Local Whisper (replaces Deepgram) ────────────────────────────────────────
async function startRecording() {
  isRecording = true;
  recordingStartTime = Date.now();
  sessionWords = 0;
  audioBuffer.length = 0;
  pillWindow?.webContents.send('state-change', { state: 'recording' });
  pillWindow?.webContents.send('start-audio-capture');
  pillWindow?.webContents.send('play-sound', 'start');
}

async function stopRecording() {
  if (!isRecording) return;
  isRecording = false;
  const capturedChunks = audioBuffer.splice(0);
  pillWindow?.webContents.send('stop-audio-capture');
  pillWindow?.webContents.send('play-sound', 'stop');
  pillWindow?.webContents.send('state-change', { state: 'processing' });

  // Ensure model is downloaded before attempting transcription
  const whisperModelForCheck = (store.get('whisperModel') as string) || 'base';
  try {
    await ensureModelReady(whisperModelForCheck);
  } catch {
    pillWindow?.webContents.send('state-change', { state: 'idle' });
    return;
  }

  await new Promise((resolve) => setImmediate(resolve));

  const secs = Math.round((Date.now() - recordingStartTime) / 1000);

  try {
    const wav = createWav(Buffer.concat(capturedChunks));
    const tmpFile = path.join(os.tmpdir(), `zynthetix-${Date.now()}.wav`);
    fs.writeFileSync(tmpFile, wav);

    const whisperModel = (store.get('whisperModel') as string) || 'base';
    // Whisper uses ISO 639-1 codes only (e.g. 'en', not 'en-US')
    const language = ((store.get('language') as string) || 'en').split('-')[0];

    try {
      const transcript = await runWhisper(tmpFile, whisperModel, language);

      if (transcript?.trim()) {
        // Strip whisper timestamp lines: [00:00:00.000 --> 00:00:02.000]
        const cleanText = transcript
          .replace(
            /\[\d{2}:\d{2}:\d{2}\.\d{3} --> \d{2}:\d{2}:\d{2}\.\d{3}\]\s*/g,
            ''
          )
          .replace(/\n+/g, ' ')
          .trim();
        if (!cleanText) {
          pillWindow?.webContents.send('state-change', { state: 'idle' });
          return;
        }
        const expanded = applySnippets(cleanText);
        typeText(expanded);
        const wc = expanded.trim().split(/\s+/).filter(Boolean).length;
        sessionWords = wc;
        insertHistory(expanded, wc, secs);
        broadcast({
          type: 'history-item',
          item: {
            text: expanded,
            word_count: wc,
            duration_sec: secs,
            created_at: new Date().toISOString(),
          },
        });
        if (wc > 0 || secs > 1) incrementStats(wc, secs);
      }
    } catch (err) {
      console.error('Transcription error:', err);
      pillWindow?.webContents.send('state-change', {
        state: 'error',
        message: String(err),
      });
      setTimeout(
        () => pillWindow?.webContents.send('state-change', { state: 'idle' }),
        3000
      );
      return;
    } finally {
      // Always delete the temp WAV regardless of success or failure
      try {
        fs.unlinkSync(tmpFile);
      } catch {
        /* ignore */
      }
    }
  } catch (err) {
    // Covers WAV creation or file-write failures (pre-transcription)
    console.error('Recording error:', err);
    pillWindow?.webContents.send('state-change', {
      state: 'error',
      message: String(err),
    });
    setTimeout(
      () => pillWindow?.webContents.send('state-change', { state: 'idle' }),
      3000
    );
    return;
  }
  pillWindow?.webContents.send('state-change', { state: 'idle' });
}

// ─── Recording controller ─────────────────────────────────────────────────────
const RecordingController = {
  toggleRecording() {
    if (isRecording) stopRecording();
    else startRecording();
  },
};

// ─── uiohook hotkey (Right Option = double-tap toggle, hold = push-to-talk) ──
let tapCount = 0,
  tapTimer: NodeJS.Timeout | null = null;
let holdTimer: NodeJS.Timeout | null = null,
  isHoldMode = false;
const DOUBLE_TAP_WINDOW = 350,
  HOLD_THRESHOLD = 400;

uIOhook.on('keydown', (e) => {
  if (e.keycode !== UiohookKey.AltRight) return;
  if (isHoldMode) return; // already in hold mode, ignore repeats
  // Clear previous hold timer — each keydown resets it (handles double-tap)
  if (holdTimer) {
    clearTimeout(holdTimer);
    holdTimer = null;
  }
  holdTimer = setTimeout(() => {
    isHoldMode = true;
    holdTimer = null;
    if (!isRecording) startRecording();
  }, HOLD_THRESHOLD);
  if (!tapTimer) {
    tapTimer = setTimeout(() => {
      tapCount = 0;
      tapTimer = null;
    }, DOUBLE_TAP_WINDOW);
  }
  tapCount++;
  if (tapCount >= 2) {
    tapCount = 0;
    if (tapTimer) {
      clearTimeout(tapTimer);
      tapTimer = null;
    }
    if (holdTimer) {
      clearTimeout(holdTimer);
      holdTimer = null;
    }
    RecordingController.toggleRecording();
  }
});

uIOhook.on('keyup', (e) => {
  if (e.keycode !== UiohookKey.AltRight) return;
  if (holdTimer) {
    clearTimeout(holdTimer);
    holdTimer = null;
  }
  if (isHoldMode) {
    isHoldMode = false;
    if (isRecording) stopRecording();
  }
});

// ─── App lifecycle ─────────────────────────────────────────────────────────────
let uiohookStarted = false;

/**
 * Perform a real-world accessibility test — systemPreferences.isTrustedAccessibilityClient
 * can return true on macOS 26 Tahoe while the low-level API still rejects access,
 * which causes uiohook-napi's C code to call abort().
 * Spawn a quick osascript that exercises System Events; if it fails, accessibility is
 * genuinely not available regardless of what Electron's API reports.
 */
function isAccessibilityReallyAvailable(): boolean {
  try {
    const result = spawnSync(
      'osascript',
      ['-e', 'tell application "System Events" to get name of first process'],
      { timeout: 3000, stdio: ['ignore', 'pipe', 'pipe'] }
    );
    return result.status === 0;
  } catch {
    return false;
  }
}

function tryStartUIOhook() {
  // On macOS, check accessibility permission before starting uiohook
  // (uiohook-napi will abort() if accessibility is not granted)
  if (process.platform === 'darwin') {
    const { systemPreferences } =
      require('electron') as typeof import('electron');
    // Prompt + check via Electron API
    const trusted = systemPreferences.isTrustedAccessibilityClient(true);
    if (!trusted) {
      console.log(
        '[uiohook] Accessibility not granted (Electron check) — will retry in 5s.'
      );
      console.log(
        '[uiohook] Please enable it in System Settings → Privacy & Security → Accessibility.'
      );
      setTimeout(tryStartUIOhook, 5000);
      return;
    }
    // Double-check with a real System Events call (catches macOS Tahoe false-positives)
    if (!isAccessibilityReallyAvailable()) {
      console.log(
        '[uiohook] Accessibility API reports trusted but real test failed — will retry in 5s.'
      );
      console.log(
        '[uiohook] Grant access in System Settings → Privacy & Security → Accessibility.'
      );
      setTimeout(tryStartUIOhook, 5000);
      return;
    }
  }
  try {
    uIOhook.start();
    uiohookStarted = true;
    console.log('[uiohook] Global hotkey listener started.');
  } catch (err) {
    console.error('[uiohook] Failed to start:', err);
    setTimeout(tryStartUIOhook, 5000);
  }
}

app.whenReady().then(async () => {
  // Initialize DB eagerly — show error dialog and quit if it fails
  try {
    initDb();
  } catch (err) {
    dialog.showErrorBox(
      'Zynthetix Voice — Database Error',
      `Failed to open the database:\n${err}\n\nCheck disk space and permissions in:\n${app.getPath('userData')}`
    );
    app.quit();
    return;
  }

  createPillWindow();
  createTray();
  startServer(
    store as unknown as {
      get: (k: string) => unknown;
      set: (k: string, v: unknown) => void;
    }
  );
  tryStartUIOhook();

  // Kick off model download in background so first transcription is instant
  const defaultModel = (store.get('whisperModel') as string) || 'base';
  ensureModelReady(defaultModel).catch(() => {
    /* error already surfaced in pill */
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (uiohookStarted) {
    uIOhook.stop();
  }
});
