import React, { useEffect, useRef, useState, useCallback } from 'react'

type AppState = 'idle' | 'recording' | 'processing' | 'error'
interface ElectronAPI {
  onStateChange:       (cb: (d: { state: string; message?: string }) => void) => () => void
  onTranscript:        (cb: (d: { text: string }) => void) => () => void
  onInterimTranscript: (cb: (d: { text: string }) => void) => () => void
  onStartAudioCapture: (cb: () => void) => () => void
  onStopAudioCapture:  (cb: () => void) => () => void
  onPlaySound:         (cb: (t: 'start' | 'stop') => void) => () => void
  sendAudioChunk:      (c: ArrayBuffer) => void
  sendFinalStats:      (d: { wordCount: number }) => void
  showContextMenu:     () => void
}
declare global { interface Window { electronAPI: ElectronAPI } }

const BAR_COUNT = 18

function playBeep(type: 'start' | 'stop') {
  try {
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain); gain.connect(ctx.destination)
    osc.frequency.value = type === 'start' ? 880 : 440
    osc.type = 'sine'
    gain.gain.setValueAtTime(0.12, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18)
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.22)
    osc.onended = () => ctx.close()
  } catch {}
}

export default function PillApp() {
  const [appState, setAppState]       = useState<AppState>('idle')
  const [errorMsg, setErrorMsg]       = useState('')
  const [bars, setBars]               = useState<number[]>(new Array(BAR_COUNT).fill(3))
  const [tick, setTick]               = useState(0)   // drives 3-D rotation shimmer

  const audioCtxRef   = useRef<AudioContext | null>(null)
  const analyserRef   = useRef<AnalyserNode | null>(null)
  const streamRef     = useRef<MediaStream | null>(null)
  const processorRef  = useRef<ScriptProcessorNode | null>(null)
  const recAnimRef    = useRef<number>(0)
  const idleAnimRef   = useRef<number>(0)
  const shimAnimRef   = useRef<number>(0)
  const appStateRef   = useRef<AppState>('idle')
  useEffect(() => { appStateRef.current = appState }, [appState])

  // ── Idle breathing ────────────────────────────────────────────────────────
  const runIdleAnim = useCallback(() => {
    let t = 0
    const tick = () => {
      if (appStateRef.current !== 'idle') return
      t += 0.03
      setBars(Array.from({ length: BAR_COUNT }, (_, i) => {
        const p = (i / BAR_COUNT) * Math.PI * 2
        return Math.max(2, 3.5 + Math.sin(t + p) * 2.5 + Math.sin(t * 1.7 + p * 1.4) * 1.2)
      }))
      idleAnimRef.current = requestAnimationFrame(tick)
    }
    idleAnimRef.current = requestAnimationFrame(tick)
  }, [])
  const stopIdleAnim = useCallback(() => cancelAnimationFrame(idleAnimRef.current), [])

  // ── Processing breathing (slower) ────────────────────────────────────────
  const runProcessingAnim = useCallback(() => {
    let t = 0
    const tick = () => {
      if (appStateRef.current !== 'processing') return
      t += 0.015
      setBars(Array.from({ length: BAR_COUNT }, (_, i) => {
        const p = (i / BAR_COUNT) * Math.PI * 2
        return Math.max(2, 4 + Math.sin(t + p) * 3 + Math.sin(t * 0.9 + p * 1.2) * 1.5)
      }))
      idleAnimRef.current = requestAnimationFrame(tick)
    }
    idleAnimRef.current = requestAnimationFrame(tick)
  }, [])

  // ── 3-D surface shimmer while recording ──────────────────────────────────
  useEffect(() => {
    if (appState !== 'recording') { setTick(0); return }
    let t = 0
    const animate = () => {
      t += 0.025
      setTick(t)
      shimAnimRef.current = requestAnimationFrame(animate)
    }
    shimAnimRef.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(shimAnimRef.current)
  }, [appState])

  useEffect(() => {
    if (appState === 'idle') runIdleAnim()
    else if (appState === 'processing') runProcessingAnim()
    else stopIdleAnim()
    return stopIdleAnim
  }, [appState, runIdleAnim, runProcessingAnim, stopIdleAnim])

  // ── Audio capture ─────────────────────────────────────────────────────────
  const stopAudio = useCallback(() => {
    cancelAnimationFrame(recAnimRef.current)
    processorRef.current?.disconnect()
    analyserRef.current?.disconnect()
    streamRef.current?.getTracks().forEach(t => t.stop())
    audioCtxRef.current?.close()
    audioCtxRef.current = analyserRef.current = streamRef.current = processorRef.current = null
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
      analyser.fftSize = 128; analyser.smoothingTimeConstant = 0.6
      analyserRef.current = analyser
      const processor = ctx.createScriptProcessor(4096, 1, 1)
      processorRef.current = processor
      processor.onaudioprocess = (e) => {
        const d = e.inputBuffer.getChannelData(0)
        const int16 = new Int16Array(d.length)
        for (let i = 0; i < d.length; i++) int16[i] = Math.max(-32768, Math.min(32767, d[i] * 32768))
        window.electronAPI.sendAudioChunk(int16.buffer)
      }
      source.connect(analyser); source.connect(processor); processor.connect(ctx.destination)
      const data = new Uint8Array(analyser.frequencyBinCount)
      const animate = () => {
        if (appStateRef.current !== 'recording') return
        recAnimRef.current = requestAnimationFrame(animate)
        analyser.getByteFrequencyData(data)
        setBars(Array.from({ length: BAR_COUNT }, (_, i) => {
          const idx = Math.floor((i / BAR_COUNT) * data.length * 0.7)
          return Math.max(3, (data[idx] / 255) * 38 + Math.random() * 1.5)
        }))
      }
      animate()
    } catch (err) { console.error('Audio capture failed:', err) }
  }, [])

  // ── IPC ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    const cleanups = [
      window.electronAPI.onStateChange(({ state, message }) => {
        setAppState(state as AppState)
        if (message) setErrorMsg(message)
      }),
      window.electronAPI.onTranscript(() => {}),
      window.electronAPI.onInterimTranscript(() => {}),
      window.electronAPI.onStartAudioCapture(() => startAudio()),
      window.electronAPI.onStopAudioCapture(() => stopAudio()),
      window.electronAPI.onPlaySound((type) => playBeep(type)),
    ]
    runIdleAnim()
    return () => cleanups.forEach(fn => fn())
  }, [startAudio, stopAudio, runIdleAnim])

  const rec  = appState === 'recording'
  const proc = appState === 'processing'
  const err  = appState === 'error'
  const active = rec || proc

  return (
    <>
      <div style={{
        width:'100%', height:'100%',
        display:'flex', alignItems:'center', justifyContent:'center',
        WebkitAppRegion:'drag',
        background: 'transparent',
        animation: 'mountIn 0.2s cubic-bezier(0.4,0,0.2,1)',
        fontFamily: "'Inter', system-ui, sans-serif",
      } as React.CSSProperties}
        onContextMenu={e => { e.preventDefault(); window.electronAPI.showContextMenu() }}>

        <div style={{
          display:'flex', alignItems:'center', gap: rec ? 6 : 5,
          background: rec ? '#1a1a2a' : proc ? '#161618' : err ? '#180a0a' : '#0F0F10',
          borderRadius: 30,
          padding: rec ? '0 10px' : proc ? '0 10px' : '0 8px',
          height: rec ? 38 : proc ? 28 : 26,
          width:  rec ? 150 : proc ? 72 : 56,

          border: rec
            ? '1px solid rgba(255,255,255,0.12)'
            : proc
              ? '1px solid rgba(255,255,255,0.08)'
              : err
                ? '1px solid rgba(255,80,80,0.2)'
                : '1px solid rgba(255,255,255,0.07)',
          transition: 'all 0.2s cubic-bezier(0.4,0,0.2,1)',
          WebkitAppRegion: 'drag',
          position: 'relative',
          overflow: 'hidden',
        } as React.CSSProperties}>

          {/* Mic icon — hidden during processing */}
          {!proc && (
            <div style={{ flexShrink:0, WebkitAppRegion:'no-drag', cursor:'pointer', zIndex:1 } as React.CSSProperties}
              onClick={() => window.electronAPI.showContextMenu()}>
              <MicIcon recording={rec} tick={tick} />
            </div>
          )}

          {/* Waveform bars — recording only */}
          {rec && (
            <div style={{ display:'flex', alignItems:'center', gap:1.5, flex:1, height:28, zIndex:1 }}>
              {bars.map((h, i) => {
                const center = BAR_COUNT / 2
                const dist = Math.abs(i - center) / center
                const alpha = 0.4 + (1 - dist) * 0.5
                return (
                  <div key={i} style={{
                    flex: 1,
                    height: Math.min(h, 24),
                    background: `rgba(255,255,255,${alpha})`,
                    borderRadius: 2,
                    transition: 'height 0.05s ease',
                  }}/>
                )
              })}
            </div>
          )}

          {/* Processing spinner — SVG-native rotation + CSS pulsing dots */}
          {proc && (
            <div style={{ display:'flex', alignItems:'center', justifyContent:'center', flex:1, gap:4, zIndex:1 }}>
              {/* Spinner ring using SVG animateTransform — works without @keyframes */}
              <svg width="15" height="15" viewBox="0 0 24 24" style={{ flexShrink:0 }}>
                <circle cx="12" cy="12" r="9" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="2.5"/>
                <path d="M12 3 A9 9 0 0 1 21 12" fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth="2.5" strokeLinecap="round">
                  <animateTransform attributeName="transform" type="rotate"
                    from="0 12 12" to="360 12 12" dur="0.75s" repeatCount="indefinite"/>
                </path>
              </svg>
              {/* Pulsing dots via CSS animation (keyframes in pill.html) */}
              {([0, 200, 400] as const).map((delay, i) => (
                <div key={i} style={{
                  width:3, height:3, borderRadius:'50%',
                  background:'rgba(255,255,255,0.6)',
                  animationName:'pulse',
                  animationDuration:'1.2s',
                  animationTimingFunction:'ease-in-out',
                  animationDelay:`${delay}ms`,
                  animationIterationCount:'infinite',
                }}/>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

function MicIcon({ recording, tick }: { recording: boolean; tick: number }) {
  const scale = recording ? 1 + Math.abs(Math.sin(tick * 1.2)) * 0.1 : 1
  const alpha = recording ? 0.9 + Math.abs(Math.sin(tick)) * 0.1 : 0.35
  const color = `rgba(255,255,255,${alpha})`
  const size  = recording ? 13 : 11
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      style={{ transform:`scale(${scale})`, transition:'transform 0.1s ease' }}>
      <rect x="9" y="2" width="6" height="12" rx="3" fill={color}/>
      <path d="M5 10a7 7 0 0014 0" stroke={color} strokeWidth="2" strokeLinecap="round" fill="none"/>
      <line x1="12" y1="17" x2="12" y2="21" stroke={color} strokeWidth="2" strokeLinecap="round"/>
      <line x1="9"  y1="21" x2="15" y2="21" stroke={color} strokeWidth="2" strokeLinecap="round"/>
    </svg>
  )
}
