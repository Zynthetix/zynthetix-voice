import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  onStateChange: (cb: (data: { state: string; message?: string }) => void) =>
    ipcRenderer.on('state-change', (_e, data) => cb(data)),
  onTranscript: (cb: (data: { text: string }) => void) =>
    ipcRenderer.on('transcript', (_e, data) => cb(data)),
  onStartAudioCapture: (cb: () => void) =>
    ipcRenderer.on('start-audio-capture', () => cb()),
  onStopAudioCapture: (cb: () => void) =>
    ipcRenderer.on('stop-audio-capture', () => cb()),
  sendAudioChunk: (chunk: ArrayBuffer) =>
    ipcRenderer.send('audio-chunk', chunk),
  openSettings: () => ipcRenderer.send('open-settings'),
  showContextMenu: () => ipcRenderer.send('show-context-menu'),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings: { apiKey?: string; shortcut?: string; language?: string }) =>
    ipcRenderer.invoke('save-settings', settings),
})
