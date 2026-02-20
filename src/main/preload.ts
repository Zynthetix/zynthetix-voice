import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  onStateChange:       (cb: (d: { state: string; message?: string }) => void) => ipcRenderer.on('state-change', (_e, d) => cb(d)),
  onTranscript:        (cb: (d: { text: string }) => void) => ipcRenderer.on('transcript', (_e, d) => cb(d)),
  onInterimTranscript: (cb: (d: { text: string }) => void) => ipcRenderer.on('interim-transcript', (_e, d) => cb(d)),
  onStartAudioCapture: (cb: () => void) => ipcRenderer.on('start-audio-capture', () => cb()),
  onStopAudioCapture:  (cb: () => void) => ipcRenderer.on('stop-audio-capture', () => cb()),
  onPlaySound:         (cb: (type: 'start' | 'stop') => void) => ipcRenderer.on('play-sound', (_e, t) => cb(t)),
  sendAudioChunk:      (chunk: ArrayBuffer) => ipcRenderer.send('audio-chunk', chunk),
  sendFinalStats:      (d: { wordCount: number }) => ipcRenderer.send('final-transcript-for-stats', d),
  openSettings:        () => ipcRenderer.send('open-settings'),
  showContextMenu:     () => ipcRenderer.send('show-context-menu'),
  getSettings:         () => ipcRenderer.invoke('get-settings'),
  saveSettings:        (s: object) => ipcRenderer.invoke('save-settings', s),
})
