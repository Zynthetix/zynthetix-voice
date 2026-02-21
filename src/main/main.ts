import { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, clipboard, dialog, shell } from 'electron'
import path from 'path'
import { spawnSync } from 'child_process'
import Store from 'electron-store'
import { createClient } from '@deepgram/sdk'
import { uIOhook, UiohookKey } from 'uiohook-napi'
import { insertHistory, applySnippets, incrementStats } from './db'
import { startServer, broadcast, DASHBOARD_PORT } from './server'

const isDev = process.env.NODE_ENV === 'development'
const store = new Store<{ deepgramApiKey: string; language: string; model: string; pillX: number; pillY: number }>()

let pillWindow: BrowserWindow | null = null
let tray: Tray | null = null
const audioBuffer: Buffer[] = []   // accumulates raw PCM while recording
let isRecording = false
let recordingStartTime = 0
let sessionWords = 0

// ─── Window helpers ───────────────────────────────────────────────────────────
function pillHtmlPath(page: string) {
  if (isDev) return `http://localhost:5173/src/renderer/${page}.html`
  return path.join(__dirname, `../../renderer/src/renderer/${page}.html`)
}

function createPillWindow() {
  const { width } = require('electron').screen.getPrimaryDisplay().workAreaSize
  const x = (store.get('pillX') as number) ?? (width - 210)
  const y = (store.get('pillY') as number) ?? 20
  pillWindow = new BrowserWindow({
    x, y, width: 200, height: 56,
    frame: false, transparent: true, resizable: false,
    alwaysOnTop: true, hasShadow: false, skipTaskbar: true,
    backgroundColor: '#00000000',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true },
    vibrancy: undefined,
  })
  pillWindow.setAlwaysOnTop(true, 'screen-saver')
  pillWindow.loadURL(isDev ? `http://localhost:5173/src/renderer/pill.html` : `file://${path.join(__dirname, '../renderer/src/renderer/pill.html')}`)
  pillWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  pillWindow.on('moved', () => {
    if (!pillWindow) return
    const [px, py] = pillWindow.getPosition()
    store.set('pillX', px); store.set('pillY', py)
  })
}

function createTray() {
  const icon = nativeImage.createEmpty()
  tray = new Tray(icon)
  tray.setTitle('🎙')
  tray.setToolTip('Zynthetix Voice')
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open Dashboard', click: () => shell.openExternal(`http://localhost:${DASHBOARD_PORT}`) },
    { type: 'separator' },
    { label: 'Toggle Recording', click: () => RecordingController.toggleRecording() },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]))
}

// ─── IPC ─────────────────────────────────────────────────────────────────────
ipcMain.on('audio-chunk', (_e, chunk: ArrayBuffer) => {
  if (!isRecording) return
  audioBuffer.push(Buffer.from(chunk))
})

ipcMain.on('show-context-menu', () => {
  if (!pillWindow) return
  const menu = Menu.buildFromTemplate([
    { label: isRecording ? 'Stop Recording' : 'Start Recording', click: () => RecordingController.toggleRecording() },
    { label: 'Open Dashboard', click: () => shell.openExternal(`http://localhost:${DASHBOARD_PORT}`) },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ])
  menu.popup({ window: pillWindow! })
})

ipcMain.on('final-transcript-for-stats', (_e, { wordCount }: { wordCount: number }) => {
  sessionWords += wordCount
})

ipcMain.handle('get-settings', () => ({
  deepgramApiKey: store.get('deepgramApiKey'),
  language: store.get('language') || 'en',
  model: store.get('model') || 'nova-2',
}))

ipcMain.handle('save-settings', (_e, s: { deepgramApiKey?: string; language?: string; model?: string }) => {
  if (s.deepgramApiKey) store.set('deepgramApiKey', s.deepgramApiKey)
  if (s.language) store.set('language', s.language)
  if (s.model) store.set('model', s.model)
  return { ok: true }
})

// ─── Text injection ────────────────────────────────────────────────────────────
function typeText(text: string) {
  if (!text.trim()) return
  clipboard.writeText(text)
  spawnSync('osascript', ['-e', 'tell application "System Events" to keystroke "v" using {command down}'])
}

// ─── WAV helper ───────────────────────────────────────────────────────────────
function createWav(pcm: Buffer, sampleRate = 16000, channels = 1, bitDepth = 16): Buffer {
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + pcm.length, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(channels, 22)
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(sampleRate * channels * (bitDepth / 8), 28)
  header.writeUInt16LE(channels * (bitDepth / 8), 32)
  header.writeUInt16LE(bitDepth, 34)
  header.write('data', 36)
  header.writeUInt32LE(pcm.length, 40)
  return Buffer.concat([header, pcm])
}

// ─── Deepgram ─────────────────────────────────────────────────────────────────
async function startRecording() {
  const apiKey = store.get('deepgramApiKey') as string
  if (!apiKey) {
    dialog.showMessageBox({ type: 'warning', title: 'API Key Missing', message: 'Please set your Deepgram API key in the dashboard.', buttons: ['Open Dashboard', 'OK'] })
      .then(r => { if (r.response === 0) shell.openExternal(`http://localhost:${DASHBOARD_PORT}`) })
    return
  }
  isRecording = true; recordingStartTime = Date.now(); sessionWords = 0
  audioBuffer.length = 0
  pillWindow?.webContents.send('state-change', { state: 'recording' })
  pillWindow?.webContents.send('start-audio-capture')
  pillWindow?.webContents.send('play-sound', 'start')
}

async function stopRecording() {
  if (!isRecording) return
  isRecording = false
  const capturedChunks = audioBuffer.splice(0)   // grab & clear atomically
  pillWindow?.webContents.send('stop-audio-capture')
  pillWindow?.webContents.send('play-sound', 'stop')
  pillWindow?.webContents.send('state-change', { state: 'processing' })

  // Yield so the renderer can paint the processing state before we assemble the WAV
  await new Promise(resolve => setImmediate(resolve))

  const secs = Math.round((Date.now() - recordingStartTime) / 1000)

  try {
    const apiKey = store.get('deepgramApiKey') as string
    const language = (store.get('language') as string) || 'en'
    const model = (store.get('model') as string) || 'nova-2'
    const client = createClient(apiKey)
    const wav = createWav(Buffer.concat(capturedChunks))
    const { result, error } = await client.listen.prerecorded.transcribeFile(wav, {
      model, language, smart_format: true, punctuate: true,
      profanity_filter: false, diarize: false, mimetype: 'audio/wav',
    })
    if (error) throw error
    const transcript = result?.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? ''
    if (transcript.trim()) {
      const expanded = applySnippets(transcript)
      typeText(expanded)
      const wc = expanded.trim().split(/\s+/).filter(Boolean).length
      sessionWords = wc
      insertHistory(expanded, wc, secs)
      broadcast({ type: 'history-item', item: { text: expanded, word_count: wc, duration_sec: secs, created_at: new Date().toISOString() } })
      if (wc > 0 || secs > 1) incrementStats(wc, secs)
    }
  } catch (err) {
    console.error('Transcription error:', err)
    pillWindow?.webContents.send('state-change', { state: 'error', message: String(err) })
    setTimeout(() => pillWindow?.webContents.send('state-change', { state: 'idle' }), 3000)
    return
  }
  pillWindow?.webContents.send('state-change', { state: 'idle' })
}

// ─── Recording controller ─────────────────────────────────────────────────────
const RecordingController = {
  toggleRecording() {
    if (isRecording) stopRecording(); else startRecording()
  }
}

// ─── uiohook hotkey (Right Option = double-tap toggle, hold = push-to-talk) ──
let tapCount = 0, tapTimer: NodeJS.Timeout | null = null
let holdTimer: NodeJS.Timeout | null = null, isHoldMode = false
const DOUBLE_TAP_WINDOW = 350, HOLD_THRESHOLD = 400

uIOhook.on('keydown', (e) => {
  if (e.keycode !== UiohookKey.AltRight) return
  if (isHoldMode) return // already in hold mode, ignore repeats
  // Clear previous hold timer — each keydown resets it (handles double-tap)
  if (holdTimer) { clearTimeout(holdTimer); holdTimer = null }
  holdTimer = setTimeout(() => {
    isHoldMode = true; holdTimer = null
    if (!isRecording) startRecording()
  }, HOLD_THRESHOLD)
  if (!tapTimer) {
    tapTimer = setTimeout(() => { tapCount = 0; tapTimer = null }, DOUBLE_TAP_WINDOW)
  }
  tapCount++
  if (tapCount >= 2) {
    tapCount = 0
    if (tapTimer) { clearTimeout(tapTimer); tapTimer = null }
    if (holdTimer) { clearTimeout(holdTimer); holdTimer = null }
    RecordingController.toggleRecording()
  }
})

uIOhook.on('keyup', (e) => {
  if (e.keycode !== UiohookKey.AltRight) return
  if (holdTimer) { clearTimeout(holdTimer); holdTimer = null }
  if (isHoldMode) { isHoldMode = false; if (isRecording) stopRecording() }
})

// ─── App lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  createPillWindow()
  createTray()
  startServer(store as unknown as { get: (k: string) => unknown; set: (k: string, v: unknown) => void })
  uIOhook.start()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  uIOhook.stop()
})
