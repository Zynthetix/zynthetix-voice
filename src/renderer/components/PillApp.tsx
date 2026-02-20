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

const BAR_COUNT = 28

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
  const [interimText, setInterimText] = useState('')
  const [finalText, setFinalText]     = useState('')
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
    if (appState === 'idle') runIdleAnim(); else stopIdleAnim()
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
  const displayText = err ? errorMsg : (interimText || finalText)

  // ── 3-D depth shadows (no gradients) ─────────────────────────────────────
  // Idle: dark pill floating with layered depth
  // Recording: bright top-edge highlight + deep inset + far drop shadow = lifted 3-D slab
  const depthShadow = rec
    ? [
        `0 1px 0 rgba(255,255,255,0.18)`,           // top-edge specular
        `inset 0 1px 0 rgba(255,255,255,0.10)`,     // inner top highlight
        `inset 0 -1px 0 rgba(0,0,0,0.5)`,           // inner bottom depth
        `0 4px 0 #0a0a0a`,                           // bottom face (3-D extrusion)
        `0 6px 16px rgba(0,0,0,0.7)`,               // mid shadow
        `0 16px 40px rgba(0,0,0,0.55)`,             // far ambient
      ].join(',')
    : [
        `0 1px 0 rgba(255,255,255,0.07)`,
        `inset 0 1px 0 rgba(255,255,255,0.06)`,
        `inset 0 -1px 0 rgba(0,0,0,0.4)`,
        `0 2px 0 #080808`,
        `0 4px 12px rgba(0,0,0,0.5)`,
        `0 10px 28px rgba(0,0,0,0.35)`,
      ].join(',')

  // Animated highlight band across the top surface while recording
  const highlightX = rec ? Math.sin(tick) * 60 + 50 : 50
  const highlightOpacity = rec ? 0.07 + Math.abs(Math.sin(tick * 0.8)) * 0.07 : 0

  return (
    <>
      <style>{`
        @keyframes mountIn {
          from { opacity:0; transform:scale(0.85) translateY(6px) }
          to   { opacity:1; transform:scale(1)    translateY(0)   }
        }
        * { -webkit-font-smoothing: antialiased; box-sizing: border-box; }
      `}</style>

      <div style={{
        width:'100%', height:'100%',
        display:'flex', alignItems:'center', justifyContent:'center',
        WebkitAppRegion:'drag',
        animation:'mountIn 0.35s cubic-bezier(0.34,1.56,0.64,1)',
        background: 'transparent',
      } as React.CSSProperties}
        onContextMenu={e => { e.preventDefault(); window.electronAPI.showContextMenu() }}>

        <div style={{
          display:'flex', alignItems:'center', gap:10,
          /* Solid surfaces only — zero gradients */
          background: rec ? '#1c1c28' : err ? '#1e1010' : '#161620',
          borderRadius: 30,
          padding: '0 14px',
          height: rec ? 52 : 46,
          width:  rec ? 250 : 218,
          boxShadow: depthShadow,
          /* Single-pixel border: lighter top-left, darker bottom-right for 3-D bevel */
          border: rec
            ? '1px solid rgba(255,255,255,0.14)'
            : err
              ? '1px solid rgba(255,80,80,0.2)'
              : '1px solid rgba(255,255,255,0.08)',
          transition: 'all 0.3s cubic-bezier(0.34,1.56,0.64,1)',
          WebkitAppRegion: 'drag',
          position: 'relative',
          overflow: 'hidden',
        } as React.CSSProperties}>

          {/* Animated surface highlight band — solid white at low opacity, no gradient color */}
          {rec && (
            <div style={{
              position:'absolute', inset:0, pointerEvents:'none', borderRadius:30,
              background: `radial-gradient(ellipse 60% 30% at ${highlightX}% 0%, rgba(255,255,255,${highlightOpacity}) 0%, transparent 100%)`,
            }}/>
          )}

          {/* Active recording ring — clean white border pulse, no color gradient */}
          {rec && (
            <div style={{
              position:'absolute', inset:-3, borderRadius:33, pointerEvents:'none',
              border:'1.5px solid rgba(255,255,255,0.12)',
              boxShadow:'0 0 0 1px rgba(255,255,255,0.05)',
            }}/>
          )}

          {/* Mic */}
          <div style={{ flexShrink:0, WebkitAppRegion:'no-drag', cursor:'pointer', zIndex:1 } as React.CSSProperties}
            onClick={() => window.electronAPI.showContextMenu()}>
            <MicIcon recording={rec} tick={tick} />
          </div>

          {/* Waveform bars */}
          <div style={{ display:'flex', alignItems:'center', gap:1.5, flex:1, height:40, zIndex:1 }}>
            {bars.map((h, i) => {
              const center = BAR_COUNT / 2
              const dist = Math.abs(i - center) / center
              // Recording: bright white bars fading to edges; idle: dim
              const alpha = rec
                ? 0.45 + (1 - dist) * 0.5
                : 0.12 + (1 - dist) * 0.1
              return (
                <div key={i} style={{
                  flex: 1,
                  height: h,
                  background: `rgba(255,255,255,${alpha})`,
                  borderRadius: 2,
                  transition: rec ? 'height 0.05s ease' : 'height 0.2s ease',
                  /* Each bar gets a tiny top highlight for 3-D rounded-rod feel */
                  boxShadow: rec ? `0 1px 0 rgba(255,255,255,${alpha * 0.5})` : 'none',
                }}/>
              )
            })}
          </div>

          {/* Status text */}
          {displayText ? (
            <div style={{
              flexShrink:0, maxWidth:88, fontSize:11, zIndex:1,
              fontFamily:'-apple-system,BlinkMacSystemFont,sans-serif',
              fontWeight:500, letterSpacing:0.2,
              overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
              color: err ? '#ff6060' : interimText ? 'rgba(255,255,255,0.38)' : 'rgba(255,255,255,0.72)',
              fontStyle: interimText ? 'italic' : 'normal',
              WebkitAppRegion:'no-drag',
            } as React.CSSProperties}>
              {displayText}
            </div>
          ) : !rec && (
            <div style={{
              flexShrink:0, fontSize:11,
              color:'rgba(255,255,255,0.18)',
              fontFamily:'-apple-system,BlinkMacSystemFont,sans-serif',
              letterSpacing:0.3, zIndex:1,
              WebkitAppRegion:'no-drag',
            } as React.CSSProperties}>⌥⌥</div>
          )}
        </div>
      </div>
    </>
  )
}

function MicIcon({ recording, tick }: { recording: boolean; tick: number }) {
  const scale  = recording ? 1 + Math.abs(Math.sin(tick * 1.2)) * 0.1 : 1
  const alpha  = recording ? 0.9 + Math.abs(Math.sin(tick)) * 0.1 : 0.4
  const color  = `rgba(255,255,255,${alpha})`
  const shadow = recording ? `drop-shadow(0 1px 3px rgba(0,0,0,0.8)) drop-shadow(0 0 6px rgba(255,255,255,0.25))` : 'none'
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      style={{ transform:`scale(${scale})`, transition:'transform 0.1s ease', filter:shadow }}>
      <rect x="9" y="2" width="6" height="12" rx="3" fill={color}/>
      <path d="M5 10a7 7 0 0014 0" stroke={color} strokeWidth="2" strokeLinecap="round" fill="none"/>
      <line x1="12" y1="17" x2="12" y2="21" stroke={color} strokeWidth="2" strokeLinecap="round"/>
      <line x1="9"  y1="21" x2="15" y2="21" stroke={color} strokeWidth="2" strokeLinecap="round"/>
    </svg>
  )
}
