import React, { useEffect, useRef, useState, useCallback } from 'react'

type AppState = 'idle' | 'recording' | 'error'
interface ElectronAPI {
  onStateChange:       (cb: (d: { state: string; message?: string }) => void) => void
  onTranscript:        (cb: (d: { text: string }) => void) => void
  onInterimTranscript: (cb: (d: { text: string }) => void) => void
  onStartAudioCapture: (cb: () => void) => void
  onStopAudioCapture:  (cb: () => void) => void
  onPlaySound:         (cb: (t: 'start' | 'stop') => void) => void
  sendAudioChunk:      (c: ArrayBuffer) => void
  sendFinalStats:      (d: { wordCount: number }) => void
  showContextMenu:     () => void
}
declare global { interface Window { electronAPI: ElectronAPI } }

const BAR_COUNT = 30

function playBeep(type: 'start' | 'stop') {
  try {
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain); gain.connect(ctx.destination)
    osc.frequency.value = type === 'start' ? 880 : 440
    osc.type = 'sine'
    gain.gain.setValueAtTime(0.15, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + (type === 'start' ? 0.12 : 0.18))
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.2)
    osc.onended = () => ctx.close()
  } catch {}
}

export default function PillApp() {
  const [appState, setAppState]       = useState<AppState>('idle')
  const [errorMsg, setErrorMsg]       = useState('')
  const [interimText, setInterimText] = useState('')
  const [finalText, setFinalText]     = useState('')
  const [bars, setBars]               = useState<number[]>(new Array(BAR_COUNT).fill(4))
  const [glowPulse, setGlowPulse]     = useState(0)

  const audioCtxRef   = useRef<AudioContext | null>(null)
  const analyserRef   = useRef<AnalyserNode | null>(null)
  const streamRef     = useRef<MediaStream | null>(null)
  const processorRef  = useRef<ScriptProcessorNode | null>(null)
  const recAnimRef    = useRef<number>(0)
  const idleAnimRef   = useRef<number>(0)
  const glowAnimRef   = useRef<number>(0)
  const appStateRef   = useRef<AppState>('idle')
  useEffect(() => { appStateRef.current = appState }, [appState])

  // ── Idle breathing animation ──────────────────────────────────────────────
  const runIdleAnim = useCallback(() => {
    let t = 0
    const tick = () => {
      if (appStateRef.current !== 'idle') return
      t += 0.035
      setBars(Array.from({ length: BAR_COUNT }, (_, i) => {
        const p = (i / BAR_COUNT) * Math.PI * 2
        return Math.max(2, 4 + Math.sin(t + p) * 3 + Math.sin(t * 1.6 + p * 1.3) * 1.5)
      }))
      idleAnimRef.current = requestAnimationFrame(tick)
    }
    idleAnimRef.current = requestAnimationFrame(tick)
  }, [])

  const stopIdleAnim = useCallback(() => cancelAnimationFrame(idleAnimRef.current), [])

  // ── Glow pulse while recording ────────────────────────────────────────────
  useEffect(() => {
    if (appState !== 'recording') { setGlowPulse(0); return }
    let t = 0
    const tick = () => {
      t += 0.04
      setGlowPulse(Math.abs(Math.sin(t)))
      glowAnimRef.current = requestAnimationFrame(tick)
    }
    glowAnimRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(glowAnimRef.current)
  }, [appState])

  useEffect(() => {
    if (appState === 'idle') { runIdleAnim() } else { stopIdleAnim() }
    return stopIdleAnim
  }, [appState, runIdleAnim, stopIdleAnim])

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
      analyser.fftSize = 128; analyser.smoothingTimeConstant = 0.65
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
          const idx = Math.floor((i / BAR_COUNT) * data.length * 0.72)
          return Math.max(3, (data[idx] / 255 + Math.random() * 0.04) * 40)
        }))
      }
      animate()
    } catch (err) { console.error('Audio capture failed:', err) }
  }, [])

  // ── IPC listeners ─────────────────────────────────────────────────────────
  useEffect(() => {
    window.electronAPI.onStateChange(({ state, message }) => {
      setAppState(state as AppState)
      if (state === 'idle') { setInterimText(''); setFinalText('') }
      if (message) setErrorMsg(message)
    })
    window.electronAPI.onTranscript(({ text }) => {
      const wc = text.trim().split(/\s+/).filter(Boolean).length
      window.electronAPI.sendFinalStats({ wordCount: wc })
      setInterimText('')
      setFinalText(text)
      setTimeout(() => setFinalText(''), 3500)
    })
    window.electronAPI.onInterimTranscript(({ text }) => setInterimText(text))
    window.electronAPI.onStartAudioCapture(() => startAudio())
    window.electronAPI.onStopAudioCapture(() => stopAudio())
    window.electronAPI.onPlaySound((type) => playBeep(type))
    runIdleAnim()
  }, [startAudio, stopAudio, runIdleAnim])

  const rec = appState === 'recording'
  const err = appState === 'error'
  const glow = rec ? `0 0 ${24 + glowPulse * 36}px rgba(139,92,246,${0.45 + glowPulse * 0.45}), 0 0 ${10 + glowPulse * 16}px rgba(109,40,217,${0.3 + glowPulse * 0.35}), 0 4px 24px rgba(0,0,0,0.6)` : '0 4px 20px rgba(0,0,0,0.45)'
  const displayText = err ? errorMsg : (interimText || finalText)

  return (
    <>
      <style>{`
        @keyframes fadeIn { from { opacity:0; transform:scale(0.88) translateY(4px) } to { opacity:1; transform:scale(1) translateY(0) } }
        @keyframes ringPulse { 0%,100% { opacity:0.15; transform:scale(1) } 50% { opacity:0.45; transform:scale(1.06) } }
        * { -webkit-font-smoothing: antialiased; }
      `}</style>
      <div style={{ width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center',
        WebkitAppRegion:'drag', animation:'fadeIn 0.4s cubic-bezier(0.34,1.56,0.64,1)',
      } as React.CSSProperties}
        onContextMenu={e => { e.preventDefault(); window.electronAPI.showContextMenu() }}>

        {/* Outer glow ring when recording */}
        {rec && <div style={{
          position:'absolute', inset:-8, borderRadius:36,
          border:`2px solid rgba(139,92,246,${0.25 + glowPulse * 0.4})`,
          animation:'ringPulse 1.8s ease-in-out infinite', pointerEvents:'none',
        }}/>}

        <div style={{
          display:'flex', alignItems:'center', gap:10,
          background: rec
            ? 'linear-gradient(135deg,#1a0533 0%,#2d1060 55%,#1e0a4a 100%)'
            : err ? 'linear-gradient(135deg,#2d0a0a,#450e0e)'
            : 'linear-gradient(135deg,#0d0d1a 0%,#1a1a2e 55%,#0f0f20 100%)',
          borderRadius: 32,
          padding:'0 16px',
          height: rec ? 54 : 48,
          width: rec ? 248 : 220,
          boxShadow: glow,
          border: rec ? '1px solid rgba(139,92,246,0.55)' : err ? '1px solid rgba(239,68,68,0.3)' : '1px solid rgba(255,255,255,0.07)',
          transition:'all 0.35s cubic-bezier(0.34,1.56,0.64,1)',
          WebkitAppRegion:'drag', position:'relative', overflow:'hidden',
        } as React.CSSProperties}>

          {rec && <div style={{
            position:'absolute', inset:0, borderRadius:32, pointerEvents:'none',
            background:'linear-gradient(90deg,transparent 0%,rgba(139,92,246,0.07) 50%,transparent 100%)',
            backgroundSize:'200% 100%', animation:'shimmer 2.5s linear infinite',
          }}/>}

          {/* Mic button */}
          <div style={{ flexShrink:0, WebkitAppRegion:'no-drag', cursor:'pointer', zIndex:1 } as React.CSSProperties}
            onClick={() => window.electronAPI.showContextMenu()}>
            <MicIcon recording={rec} pulse={glowPulse} />
          </div>

          {/* Waveform */}
          <div style={{ display:'flex', alignItems:'center', gap:1.5, flex:1, height:42, zIndex:1 }}>
            {bars.map((h, i) => {
              const c = BAR_COUNT / 2
              const dist = Math.abs(i - c) / c
              const opacity = rec ? 0.55 + (1-dist)*0.45 : 0.2 + (1-dist)*0.15
              const color = rec
                ? `rgba(${167+Math.floor((1-dist)*55)},${130-Math.floor(dist*35)},246,${opacity})`
                : `rgba(148,163,184,${opacity})`
              return <div key={i} style={{
                flex:1, height:h, background:color, borderRadius:3,
                transition: rec ? 'height 0.055s ease' : 'height 0.18s ease',
              }}/>
            })}
          </div>

          {/* Status / interim text */}
          {displayText ? (
            <div style={{
              flexShrink:0, maxWidth:90, fontSize:11, zIndex:1,
              fontFamily:'-apple-system,BlinkMacSystemFont,sans-serif', fontWeight:500,
              letterSpacing:0.2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
              color: err ? '#fca5a5' : interimText ? 'rgba(196,181,253,0.6)' : '#c4b5fd',
              fontStyle: interimText ? 'italic' : 'normal',
              WebkitAppRegion:'no-drag',
            } as React.CSSProperties}>
              {displayText}
            </div>
          ) : !rec && (
            <div style={{
              flexShrink:0, fontSize:11, color:'rgba(148,163,184,0.38)',
              fontFamily:'-apple-system,BlinkMacSystemFont,sans-serif', zIndex:1,
              WebkitAppRegion:'no-drag',
            } as React.CSSProperties}>⌥⌥ dictate</div>
          )}
        </div>
      </div>
      <style>{`@keyframes shimmer { 0%{background-position:-200% center} 100%{background-position:200% center} }`}</style>
    </>
  )
}

function MicIcon({ recording, pulse }: { recording: boolean; pulse: number }) {
  const scale = recording ? 1 + pulse * 0.13 : 1
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
      style={{ transform:`scale(${scale})`, transition:'transform 0.08s ease',
        filter: recording ? `drop-shadow(0 0 ${3+pulse*5}px rgba(167,139,250,0.95))` : 'none' }}>
      <rect x="9" y="2" width="6" height="12" rx="3" fill={recording ? '#a78bfa' : 'rgba(148,163,184,0.55)'} />
      <path d="M5 10a7 7 0 0014 0" stroke={recording ? '#a78bfa' : 'rgba(148,163,184,0.55)'} strokeWidth="2" strokeLinecap="round" fill="none" />
      <line x1="12" y1="17" x2="12" y2="21" stroke={recording ? '#a78bfa' : 'rgba(148,163,184,0.55)'} strokeWidth="2" strokeLinecap="round" />
      <line x1="9" y1="21" x2="15" y2="21" stroke={recording ? '#a78bfa' : 'rgba(148,163,184,0.55)'} strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}
