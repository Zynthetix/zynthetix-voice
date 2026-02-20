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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let deepgramConnection: any = null
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
  const x = (store.get('pillX') as number) ?? (width - 280)
  const y = (store.get('pillY') as number) ?? 20
  pillWindow = new BrowserWindow({
    x, y, width: 280, height: 68,
    frame: false, transparent: true, resizable: false,
    alwaysOnTop: true, hasShadow: false, skipTaskbar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true },
    vibrancy: undefined,
  })
  pillWindow.setAlwaysOnTop(true, 'screen-saver')
  pillWindow.loadURL(isDev ? `http://localhost:5173/src/renderer/pill.html` : `file://${path.join(__dirname, '../../renderer/src/renderer/pill.html')}`)
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
  if (deepgramConnection && isRecording) {
    try { deepgramConnection.send(Buffer.from(chunk)) } catch {}
  }
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
  model: store.get('model') || 'nova-3',
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

// ─── Deepgram ─────────────────────────────────────────────────────────────────
async function startRecording() {
  const apiKey = store.get('deepgramApiKey') as string
  if (!apiKey) {
    dialog.showMessageBox({ type: 'warning', title: 'API Key Missing', message: 'Please set your Deepgram API key in the dashboard.', buttons: ['Open Dashboard', 'OK'] })
      .then(r => { if (r.response === 0) shell.openExternal(`http://localhost:${DASHBOARD_PORT}`) })
    return
  }
  const language = (store.get('language') as string) || 'en'
  const model = (store.get('model') as string) || 'nova-3'
  const client = createClient(apiKey)
  try {
    deepgramConnection = client.listen.live({
      model, language, smart_format: true, interim_results: true,
      utterance_end_ms: 1000, endpointing: 10,
      punctuate: true, profanity_filter: false,
      diarize: false, vad_events: true, encoding: 'linear16', sample_rate: 16000,
    })

    deepgramConnection.on('open', () => {
      console.log('Deepgram connected')
      isRecording = true; recordingStartTime = Date.now(); sessionWords = 0
      pillWindow?.webContents.send('state-change', { state: 'recording' })
      pillWindow?.webContents.send('start-audio-capture')
      pillWindow?.webContents.send('play-sound', 'start')
    })

    deepgramConnection.on('Results', (data: unknown) => {
      const result = data as { channel: { alternatives: { transcript: string }[] }; is_final: boolean; speech_final: boolean }
      const transcript = result?.channel?.alternatives?.[0]?.transcript
      if (!transcript) return
      if (result.is_final && result.speech_final) {
        const expanded = applySnippets(transcript)
        typeText(expanded)
        pillWindow?.webContents.send('transcript', { text: expanded })
        const wc = expanded.trim().split(/\s+/).filter(Boolean).length
        const durSec = Math.round((Date.now() - recordingStartTime) / 1000)
        insertHistory(expanded, wc, durSec)
        broadcast({ type: 'history-item', item: { text: expanded, word_count: wc, duration_sec: durSec, created_at: new Date().toISOString() } })
      } else if (!result.is_final) {
        pillWindow?.webContents.send('interim-transcript', { text: transcript })
      }
    })

    deepgramConnection.on('error', (err: unknown) => {
      console.error('Deepgram error:', err)
      pillWindow?.webContents.send('state-change', { state: 'error', message: 'Connection error' })
      isRecording = false
    })

    deepgramConnection.on('close', () => {
      isRecording = false
    })
  } catch (err) {
    console.error('Failed to start recording:', err)
    pillWindow?.webContents.send('state-change', { state: 'error', message: String(err) })
  }
}

function stopRecording() {
  if (!isRecording) return
  isRecording = false
  pillWindow?.webContents.send('stop-audio-capture')
  pillWindow?.webContents.send('play-sound', 'stop')
  pillWindow?.webContents.send('state-change', { state: 'idle' })
  const secs = Math.round((Date.now() - recordingStartTime) / 1000)
  if (sessionWords > 0 || secs > 1) incrementStats(sessionWords, secs)
  try { deepgramConnection?.finish() } catch {}
  deepgramConnection = null
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
  if (holdTimer) return // already holding
  holdTimer = setTimeout(() => {
    isHoldMode = true
    if (!isRecording) startRecording()
  }, HOLD_THRESHOLD)
  if (!tapTimer) {
    tapTimer = setTimeout(() => { tapCount = 0; tapTimer = null }, DOUBLE_TAP_WINDOW)
  }
  tapCount++
  if (tapCount >= 2) {
    tapCount = 0; if (tapTimer) { clearTimeout(tapTimer); tapTimer = null }
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
  try { deepgramConnection?.finish() } catch {}
})
