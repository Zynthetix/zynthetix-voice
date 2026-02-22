import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  onStateChange: (cb: (d: { state: string; message?: string }) => void) => {
    ipcRenderer.removeAllListeners('state-change')
    ipcRenderer.on('state-change', (_e, d) => cb(d))
    return () => ipcRenderer.removeAllListeners('state-change')
  },
  onTranscript: (cb: (d: { text: string }) => void) => {
    ipcRenderer.removeAllListeners('transcript')
    ipcRenderer.on('transcript', (_e, d) => cb(d))
    return () => ipcRenderer.removeAllListeners('transcript')
  },
  onInterimTranscript: (cb: (d: { text: string }) => void) => {
    ipcRenderer.removeAllListeners('interim-transcript')
    ipcRenderer.on('interim-transcript', (_e, d) => cb(d))
    return () => ipcRenderer.removeAllListeners('interim-transcript')
  },
  onStartAudioCapture: (cb: () => void) => {
    ipcRenderer.removeAllListeners('start-audio-capture')
    ipcRenderer.on('start-audio-capture', () => cb())
    return () => ipcRenderer.removeAllListeners('start-audio-capture')
  },
  onStopAudioCapture: (cb: () => void) => {
    ipcRenderer.removeAllListeners('stop-audio-capture')
    ipcRenderer.on('stop-audio-capture', () => cb())
    return () => ipcRenderer.removeAllListeners('stop-audio-capture')
  },
  onPlaySound: (cb: (type: 'start' | 'stop') => void) => {
    ipcRenderer.removeAllListeners('play-sound')
    ipcRenderer.on('play-sound', (_e, t) => cb(t))
    return () => ipcRenderer.removeAllListeners('play-sound')
  },
  sendAudioChunk:  (chunk: ArrayBuffer) => ipcRenderer.send('audio-chunk', chunk),
  sendFinalStats:  (d: { wordCount: number }) => ipcRenderer.send('final-transcript-for-stats', d),
  openSettings:    () => ipcRenderer.send('open-settings'),
  showContextMenu: () => ipcRenderer.send('show-context-menu'),
  getSettings:     () => ipcRenderer.invoke('get-settings'),
  saveSettings:    (s: object) => ipcRenderer.invoke('save-settings', s),
})
