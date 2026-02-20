import React, { useEffect, useRef, useState, useCallback } from 'react'

type AppState = 'idle' | 'recording' | 'error'

interface ElectronAPI {
  onStateChange: (cb: (data: { state: string; message?: string }) => void) => void
  onTranscript: (cb: (data: { text: string }) => void) => void
  onStartAudioCapture: (cb: () => void) => void
  onStopAudioCapture: (cb: () => void) => void
  sendAudioChunk: (chunk: ArrayBuffer) => void
  openSettings: () => void
  showContextMenu: () => void
}

declare global {
  interface Window { electronAPI: ElectronAPI }
}

const BAR_COUNT = 28

// Idle breathing: gentle random noise so the pill feels alive
function idleBars(): number[] {
  return Array.from({ length: BAR_COUNT }, (_, i) => {
    const wave = Math.sin((i / BAR_COUNT) * Math.PI * 2) * 4
    return 3 + Math.abs(wave) + Math.random() * 2
  })
}

export default function PillApp() {
  const [appState, setAppState] = useState<AppState>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [lastTranscript, setLastTranscript] = useState('')
  const [bars, setBars] = useState<number[]>(idleBars())
  const [glowPulse, setGlowPulse] = useState(0)

  const audioCtxRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const animFrameRef = useRef<number>(0)
  const idleAnimRef = useRef<number>(0)
  const appStateRef = useRef<AppState>('idle')

  // Keep ref in sync for use inside callbacks
  useEffect(() => { appStateRef.current = appState }, [appState])

  // Idle "alive" breathing animation
  const runIdleAnim = useCallback(() => {
    let t = 0
    const tick = () => {
      if (appStateRef.current !== 'idle') return
      t += 0.04
      const newBars = Array.from({ length: BAR_COUNT }, (_, i) => {
        const phase = (i / BAR_COUNT) * Math.PI * 2
        const wave1 = Math.sin(t + phase) * 3
        const wave2 = Math.sin(t * 1.7 + phase * 1.3) * 2
        return Math.max(2, 4 + wave1 + wave2)
      })
      setBars(newBars)
      idleAnimRef.current = requestAnimationFrame(tick)
    }
    idleAnimRef.current = requestAnimationFrame(tick)
  }, [])

  const stopIdleAnim = useCallback(() => {
    cancelAnimationFrame(idleAnimRef.current)
  }, [])

  // Glow pulse loop while recording
  useEffect(() => {
    if (appState !== 'recording') { setGlowPulse(0); return }
    let t = 0
    const tick = () => {
      t += 0.05
      setGlowPulse(Math.abs(Math.sin(t)))
      animFrameRef.current = requestAnimationFrame(tick)
    }
    animFrameRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(animFrameRef.current)
  }, [appState])

  // Start idle anim on mount and when returning to idle
  useEffect(() => {
    if (appState === 'idle') {
      runIdleAnim()
    } else {
      stopIdleAnim()
    }
    return stopIdleAnim
  }, [appState, runIdleAnim, stopIdleAnim])

  const stopAudio = useCallback(() => {
    processorRef.current?.disconnect()
    analyserRef.current?.disconnect()
    streamRef.current?.getTracks().forEach(t => t.stop())
    audioCtxRef.current?.close()
    audioCtxRef.current = null
    analyserRef.current = null
    streamRef.current = null
    processorRef.current = null
  }, [])

  const startAudio = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { sampleRate: 16000, channelCount: 1, echoCancellation: true, noiseSuppression: true },
        video: false,
      })
      streamRef.current = stream

      const ctx = new AudioContext({ sampleRate: 16000 })
      audioCtxRef.current = ctx

      const source = ctx.createMediaStreamSource(stream)

      const analyser = ctx.createAnalyser()
      analyser.fftSize = 128
      analyser.smoothingTimeConstant = 0.6
      analyserRef.current = analyser

      const processor = ctx.createScriptProcessor(4096, 1, 1)
      processorRef.current = processor

      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0)
        const int16 = new Int16Array(inputData.length)
        for (let i = 0; i < inputData.length; i++) {
          int16[i] = Math.max(-32768, Math.min(32767, inputData[i] * 32768))
        }
        window.electronAPI.sendAudioChunk(int16.buffer)
      }

      source.connect(analyser)
      source.connect(processor)
      processor.connect(ctx.destination)

      // Live frequency → bar heights
      const dataArray = new Uint8Array(analyser.frequencyBinCount)
      const animate = () => {
        if (appStateRef.current !== 'recording') return
        animFrameRef.current = requestAnimationFrame(animate)
        analyser.getByteFrequencyData(dataArray)
        const newBars = Array.from({ length: BAR_COUNT }, (_, i) => {
          const idx = Math.floor((i / BAR_COUNT) * (dataArray.length * 0.7))
          const raw = dataArray[idx] / 255
          // Add slight random jitter so bars feel alive even in silence
          const jitter = Math.random() * 0.05
          return Math.max(3, (raw + jitter) * 36)
        })
        setBars(newBars)
      }
      animate()
    } catch (err) {
      console.error('Audio capture failed:', err)
    }
  }, [])

  useEffect(() => {
    window.electronAPI.onStateChange(({ state, message }) => {
      setAppState(state as AppState)
      if (message) setErrorMsg(message)
    })
    window.electronAPI.onTranscript(({ text }) => {
      setLastTranscript(text)
      setTimeout(() => setLastTranscript(''), 3500)
    })
    window.electronAPI.onStartAudioCapture(() => startAudio())
    window.electronAPI.onStopAudioCapture(() => stopAudio())
    runIdleAnim()
  }, [startAudio, stopAudio, runIdleAnim])

  const isRecording = appState === 'recording'
  const isError = appState === 'error'

  const glowColor = isRecording
    ? `rgba(139, 92, 246, ${0.4 + glowPulse * 0.5})`
    : isError
    ? 'rgba(239, 68, 68, 0.3)'
    : 'transparent'

  const glowSize = isRecording ? `0 0 ${20 + glowPulse * 28}px ${glowColor}, 0 0 ${8 + glowPulse * 12}px ${glowColor}, 0 4px 20px rgba(0,0,0,0.5)` : `0 4px 20px rgba(0,0,0,0.4)`

  return (
    <>
      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: scale(0.92); } to { opacity: 1; transform: scale(1); } }
        @keyframes dot-bounce { 0%,80%,100% { transform: scaleY(0.4); } 40% { transform: scaleY(1); } }
        * { -webkit-font-smoothing: antialiased; }
      `}</style>
      <div
        style={{
          width: '100%', height: '100%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          WebkitAppRegion: 'drag',
          animation: 'fadeIn 0.35s cubic-bezier(0.34,1.56,0.64,1)',
        } as React.CSSProperties}
        onContextMenu={(e) => { e.preventDefault(); window.electronAPI.showContextMenu() }}
      >
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          background: isRecording
            ? 'linear-gradient(135deg, #1a0533 0%, #2d1060 50%, #1e0a4a 100%)'
            : isError
            ? 'linear-gradient(135deg, #2d0a0a 0%, #450e0e 100%)'
            : 'linear-gradient(135deg, #0d0d1a 0%, #1a1a2e 50%, #0f0f20 100%)',
          borderRadius: 30,
          padding: '0 16px',
          height: 48,
          boxShadow: glowSize,
          border: isRecording
            ? '1px solid rgba(139,92,246,0.5)'
            : isError
            ? '1px solid rgba(239,68,68,0.3)'
            : '1px solid rgba(255,255,255,0.07)',
          transition: 'background 0.4s ease, border 0.4s ease',
          minWidth: 200,
          WebkitAppRegion: 'drag',
          position: 'relative',
          overflow: 'hidden',
        } as React.CSSProperties}>

          {/* Shimmer overlay when recording */}
          {isRecording && (
            <div style={{
              position: 'absolute', inset: 0, borderRadius: 30,
              background: 'linear-gradient(90deg, transparent 0%, rgba(139,92,246,0.08) 50%, transparent 100%)',
              backgroundSize: '200% 100%',
              animation: 'shimmer 2s linear infinite',
              pointerEvents: 'none',
            }} />
          )}

          {/* Mic button */}
          <div
            style={{ flexShrink: 0, WebkitAppRegion: 'no-drag', cursor: 'pointer', zIndex: 1 } as React.CSSProperties}
            onClick={() => window.electronAPI.showContextMenu()}
          >
            <MicIcon recording={isRecording} pulse={glowPulse} />
          </div>

          {/* Waveform bars */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 2, height: 40, flex: 1, zIndex: 1 }}>
            {bars.map((h, i) => {
              const center = BAR_COUNT / 2
              const distFromCenter = Math.abs(i - center) / center
              const opacity = isRecording
                ? 0.5 + (1 - distFromCenter) * 0.5
                : 0.25 + (1 - distFromCenter) * 0.2
              const color = isRecording
                ? `rgba(${167 + Math.floor((1 - distFromCenter) * 60)}, ${139 - Math.floor(distFromCenter * 40)}, 246, ${opacity})`
                : `rgba(148, 163, 184, ${opacity})`
              return (
                <div key={i} style={{
                  flex: 1,
                  height: h,
                  background: color,
                  borderRadius: 3,
                  transition: isRecording ? 'height 0.06s ease, background 0.1s' : 'height 0.15s ease',
                  transformOrigin: 'center',
                }} />
              )
            })}
          </div>

          {/* Status label on the right */}
          {!isRecording && (
            <div style={{
              flexShrink: 0,
              color: isError ? '#fca5a5' : lastTranscript ? '#c4b5fd' : 'rgba(148,163,184,0.5)',
              fontSize: 11,
              fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
              fontWeight: 500,
              letterSpacing: 0.2,
              maxWidth: 80,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              transition: 'color 0.3s',
              zIndex: 1,
              WebkitAppRegion: 'no-drag',
            } as React.CSSProperties}>
              {isError ? errorMsg : lastTranscript || '⌘⇧Space'}
            </div>
          )}
        </div>
      </div>
      <style>{`
        @keyframes shimmer {
          0% { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
      `}</style>
    </>
  )
}

function MicIcon({ recording, pulse }: { recording: boolean; pulse: number }) {
  const scale = recording ? 1 + pulse * 0.12 : 1
  return (
    <svg
      width="18" height="18" viewBox="0 0 24 24" fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{
        transform: `scale(${scale})`,
        transition: 'transform 0.1s ease',
        filter: recording ? `drop-shadow(0 0 ${3 + pulse * 4}px rgba(167,139,250,0.9))` : 'none',
      }}>
      <rect x="9" y="2" width="6" height="12" rx="3"
        fill={recording ? '#a78bfa' : 'rgba(148,163,184,0.6)'} />
      <path d="M5 10a7 7 0 0014 0"
        stroke={recording ? '#a78bfa' : 'rgba(148,163,184,0.6)'}
        strokeWidth="2" strokeLinecap="round" fill="none" />
      <line x1="12" y1="17" x2="12" y2="21"
        stroke={recording ? '#a78bfa' : 'rgba(148,163,184,0.6)'}
        strokeWidth="2" strokeLinecap="round" />
      <line x1="9" y1="21" x2="15" y2="21"
        stroke={recording ? '#a78bfa' : 'rgba(148,163,184,0.6)'}
        strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

