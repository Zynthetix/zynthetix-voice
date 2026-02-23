// Shared ElectronAPI type — consumed by PillApp and SettingsApp.
// Keep in sync with src/main/preload.ts.
// `export {}` makes this a TypeScript module so `declare global {}` is valid.
export {};

interface ElectronAPI {
  onStateChange: (
    cb: (d: { state: string; message?: string }) => void
  ) => () => void;
  onTranscript: (cb: (d: { text: string }) => void) => () => void;
  onInterimTranscript: (cb: (d: { text: string }) => void) => () => void;
  onStartAudioCapture: (cb: () => void) => () => void;
  onStopAudioCapture: (cb: () => void) => () => void;
  onPlaySound: (cb: (t: 'start' | 'stop') => void) => () => void;
  sendAudioChunk: (c: ArrayBuffer) => void;
  sendFinalStats: (d: { wordCount: number }) => void;
  showContextMenu: () => void;
  openSettings: () => void;
  getSettings: () => Promise<{ whisperModel: string; language: string }>;
  saveSettings: (s: {
    whisperModel?: string;
    language?: string;
  }) => Promise<boolean>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
