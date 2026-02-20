import { app, BrowserWindow, clipboard, ipcMain, Menu, nativeImage, Tray } from 'electron'
import path from 'path'
import { execSync, spawnSync } from 'child_process'
import Store from 'electron-store'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createClient, LiveTranscriptionEvents } = require('@deepgram/sdk')
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { uIOhook, UiohookKey } = require('uiohook-napi')

interface StoreSchema {
  apiKey: string
  language: string
  pillPosition: { x: number; y: number }
}

const store = new Store<StoreSchema>({
  defaults: {
    apiKey: '',
    language: 'en-US',
    pillPosition: { x: 0, y: 20 },
  },
})

let pillWindow: BrowserWindow | null = null
let settingsWindow: BrowserWindow | null = null
let tray: Tray | null = null
let isRecording = false
let isHoldMode = false                  // true = started via hold (release = stop)
let deepgramConnection: ReturnType<typeof createClient> | null = null

// Right Option key double-tap / hold detection state
let fnPressCount = 0
let fnPressTimer: ReturnType<typeof setTimeout> | null = null
let fnHoldTimer: ReturnType<typeof setTimeout> | null = null

const FN_DOUBLE_TAP_WINDOW = 350   // ms between taps to count as double
const FN_HOLD_THRESHOLD    = 400   // ms held before activating hold-mode (shorter = snappier)

const isDev = process.env.NODE_ENV === 'development'

function getRendererUrl(page: string): string {
  if (isDev) {
    return `http://localhost:5173/src/renderer/${page}.html`
  }
  return `file://${path.join(__dirname, `../renderer/src/renderer/${page}.html`)}`
}

function createPillWindow() {
  const savedPos = store.get('pillPosition') as { x: number; y: number } | undefined

  pillWindow = new BrowserWindow({
    width: 240,
    height: 60,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: true,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  pillWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  pillWindow.loadURL(getRendererUrl('pill'))

  // Position: saved position or default top-right
  const { screen } = require('electron')
  const display = screen.getPrimaryDisplay()
  const { width } = display.workAreaSize
  const x = savedPos?.x ?? width - 260
  const y = savedPos?.y ?? 20
  pillWindow.setPosition(x, y)

  // Save position when window is moved
  pillWindow.on('moved', () => {
    const [px, py] = pillWindow!.getPosition()
    store.set('pillPosition', { x: px, y: py })
  })
}

function createSettingsWindow() {
  if (settingsWindow) {
    settingsWindow.focus()
    return
  }

  settingsWindow = new BrowserWindow({
    width: 480,
    height: 400,
    title: 'Zynthetix Voice — Settings',
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  settingsWindow.loadURL(getRendererUrl('settings'))
  settingsWindow.on('closed', () => { settingsWindow = null })
}

function createTray() {
  // Create a simple 16x16 tray icon programmatically
  const trayIcon = nativeImage.createFromDataURL(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAAdgAAAHYBTnsmCAAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAAGRSURBVDiNpZM9SwNBEIafvYuJuSSKQcHGSrCxsLGwELSwECysLCwULCwULCwULCwUFBQUgoWFhYKCgYGBgoWFhYKBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgX+BgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGB'
  )

  tray = new Tray(trayIcon)
  updateTrayMenu()
}

function updateTrayMenu() {
  if (!tray) return
  const menu = Menu.buildFromTemplate([
    {
      label: isRecording ? '🔴 Stop Recording' : '🎤 Start Recording',
      click: toggleRecording,
    },
    { type: 'separator' },
    { label: 'Settings', click: createSettingsWindow },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ])
  tray.setContextMenu(menu)
  tray.setToolTip(isRecording ? 'Zynthetix Voice — Recording' : 'Zynthetix Voice')
}

async function startRecording() {
  const apiKey = store.get('apiKey') as string
  if (!apiKey) {
    pillWindow?.webContents.send('state-change', { state: 'error', message: 'No API key set' })
    createSettingsWindow()
    return
  }

  isRecording = true
  pillWindow?.webContents.send('state-change', { state: 'recording' })
  updateTrayMenu()

  try {
    const deepgram = createClient(apiKey)
    deepgramConnection = deepgram.listen.live({
      model: 'nova-3',
      language: store.get('language') as string,
      smart_format: true,
      interim_results: true,
      utterance_end_ms: 1000,
      endpointing: 10,
      diarize: true,
      punctuate: true,
      profanity_filter: true,
      vad_events: true,
      dictation: true,
      numerals: true,
      encoding: 'linear16',
      sample_rate: 16000,
      channels: 1,
    })

    deepgramConnection.on(LiveTranscriptionEvents.Open, () => {
      console.log('Deepgram connected')
    })

    deepgramConnection.on(LiveTranscriptionEvents.Transcript, (data: {
      channel: { alternatives: { transcript: string; words: { speaker?: number }[] }[] }
      is_final: boolean
      type?: string
    }) => {
      // Skip non-transcript events
      if (data.type === 'SpeechStarted' || data.type === 'UtteranceEnd') return
      const transcript = data?.channel?.alternatives?.[0]?.transcript
      // Only type on final results to avoid duplicate/overwriting interim text
      if (transcript && data.is_final) {
        pillWindow?.webContents.send('transcript', { text: transcript })
        typeText(transcript + ' ')
      }
    })

    deepgramConnection.on(LiveTranscriptionEvents.Error, (err: Error) => {
      console.error('Deepgram error:', err)
      stopRecording()
    })

    // Tell renderer to start capturing audio
    pillWindow?.webContents.send('start-audio-capture')
  } catch (err) {
    console.error('Failed to start recording:', err)
    stopRecording()
  }
}

function stopRecording() {
  isRecording = false
  pillWindow?.webContents.send('state-change', { state: 'idle' })
  pillWindow?.webContents.send('stop-audio-capture')
  updateTrayMenu()

  if (deepgramConnection) {
    deepgramConnection.finish()
    deepgramConnection = null
  }
}

function toggleRecording() {
  if (isRecording) {
    stopRecording()
  } else {
    startRecording()
  }
}

function typeText(text: string) {
  try {
    // Save previous clipboard, write transcript, paste, then restore
    const prev = clipboard.readText()
    clipboard.writeText(text)
    spawnSync('osascript', ['-e', 'tell application "System Events" to keystroke "v" using {command down}'])
    setTimeout(() => clipboard.writeText(prev), 300)
  } catch (err) {
    console.error('Failed to paste text:', err)
  }
}

// IPC handlers
ipcMain.on('show-context-menu', () => {
  const menu = Menu.buildFromTemplate([
    {
      label: isRecording ? '⏹  Stop Recording' : '🎤  Start Recording',
      click: toggleRecording,
    },
    { type: 'separator' },
    { label: '⚙️  Settings', click: createSettingsWindow },
    { type: 'separator' },
    { label: '✕  Quit', click: () => app.quit() },
  ])
  menu.popup({ window: pillWindow! })
})

ipcMain.on('audio-chunk', (_event, chunk: ArrayBuffer) => {
  if (deepgramConnection && isRecording) {
    deepgramConnection.send(chunk)
  }
})

ipcMain.handle('get-settings', () => ({
  apiKey: store.get('apiKey'),
  shortcut: store.get('shortcut'),
  language: store.get('language'),
}))

ipcMain.handle('save-settings', (_event, settings: Partial<StoreSchema>) => {
  if (settings.apiKey !== undefined) store.set('apiKey', settings.apiKey)
  if (settings.language !== undefined) store.set('language', settings.language)
  return true
})

ipcMain.on('open-settings', () => createSettingsWindow())

function setupFnKey() {
  // Right Option (⌥ right) key — works reliably on all Macs, no conflicts
  // keycode 3640 = UiohookKey.AltRight
  const TRIGGER_KEY = UiohookKey.AltRight // 3640

  uIOhook.on('keydown', (e: { keycode: number }) => {
    if (e.keycode !== TRIGGER_KEY) return

    fnPressCount++

    // Hold timer: if key stays down > threshold → push-to-talk mode
    if (fnHoldTimer) clearTimeout(fnHoldTimer)
    fnHoldTimer = setTimeout(() => {
      fnPressCount = 0
      if (fnPressTimer) { clearTimeout(fnPressTimer); fnPressTimer = null }
      if (!isRecording) {
        isHoldMode = true
        startRecording()
      }
    }, FN_HOLD_THRESHOLD)

    // Double-tap window: two presses within window → toggle
    if (fnPressTimer) clearTimeout(fnPressTimer)
    fnPressTimer = setTimeout(() => {
      const count = fnPressCount
      fnPressCount = 0
      fnPressTimer = null
      if (count >= 2) {
        if (fnHoldTimer) { clearTimeout(fnHoldTimer); fnHoldTimer = null }
        if (!isHoldMode) toggleRecording()
      }
    }, FN_DOUBLE_TAP_WINDOW)
  })

  uIOhook.on('keyup', (e: { keycode: number }) => {
    if (e.keycode !== TRIGGER_KEY) return
    if (fnHoldTimer) { clearTimeout(fnHoldTimer); fnHoldTimer = null }
    // Release in hold-mode → stop recording
    if (isHoldMode && isRecording) {
      isHoldMode = false
      stopRecording()
    }
  })

  uIOhook.start()
}

app.whenReady().then(() => {
  app.dock?.hide()

  createPillWindow()
  createTray()
  setupFnKey()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createPillWindow()
  })
})

app.on('window-all-closed', () => {
  // Keep running in background (menu bar app)
})

app.on('will-quit', () => {
  uIOhook.stop()
  if (deepgramConnection) deepgramConnection.finish()
})
