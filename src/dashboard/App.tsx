import React, { useState, useEffect, useRef } from 'react'

const API = 'http://localhost:7789/api'
const WS_URL = 'ws://localhost:7789'

type Tab = 'settings' | 'snippets' | 'history' | 'stats'
interface HistoryItem { id: number; text: string; word_count: number; duration_sec: number; created_at: string }
interface Snippet { id: number; trigger: string; expansion: string; created_at: string }
interface Stats { total_words: number; total_sessions: number; total_seconds: number }
interface Settings { apiKey: string; language: string; model: string }

function useWS(onMessage: (d: unknown) => void) {
  const ws = useRef<WebSocket | null>(null)
  useEffect(() => {
    const connect = () => {
      try {
        ws.current = new WebSocket(WS_URL)
        ws.current.onmessage = e => { try { onMessage(JSON.parse(e.data)) } catch {} }
        ws.current.onclose = () => setTimeout(connect, 2000)
      } catch {}
    }
    connect()
    return () => ws.current?.close()
  }, [])
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const S = {
  app: { fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif', background:'#0a0a14', minHeight:'100vh', color:'#e2e8f0', display:'flex', flexDirection:'column' as const },
  header: { background:'linear-gradient(135deg,#0d0d1a,#1a1a2e)', borderBottom:'1px solid rgba(139,92,246,0.2)', padding:'0 32px', display:'flex', alignItems:'center', gap:16, height:64 },
  logo: { width:32, height:32, background:'linear-gradient(135deg,#7c3aed,#4f46e5)', borderRadius:10, display:'flex', alignItems:'center', justifyContent:'center' },
  title: { fontSize:20, fontWeight:700, background:'linear-gradient(90deg,#a78bfa,#818cf8)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' },
  subtitle: { fontSize:12, color:'rgba(148,163,184,0.6)', marginLeft:'auto' },
  nav: { display:'flex', gap:4, padding:'0 32px', background:'#0d0d1a', borderBottom:'1px solid rgba(255,255,255,0.06)' },
  tabBtn: (active: boolean) => ({ padding:'12px 20px', background:'none', border:'none', cursor:'pointer', fontSize:14, fontWeight:500, color: active ? '#a78bfa' : 'rgba(148,163,184,0.6)', borderBottom: active ? '2px solid #7c3aed' : '2px solid transparent', transition:'all 0.15s', marginBottom:-1 }),
  main: { flex:1, padding:32, maxWidth:960, margin:'0 auto', width:'100%' },
  card: { background:'#0d0d1a', border:'1px solid rgba(255,255,255,0.07)', borderRadius:14, padding:24, marginBottom:20 },
  label: { display:'block', fontSize:12, fontWeight:600, color:'rgba(148,163,184,0.7)', textTransform:'uppercase' as const, letterSpacing:0.8, marginBottom:8 },
  input: { width:'100%', background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:8, padding:'10px 14px', color:'#e2e8f0', fontSize:14, outline:'none', boxSizing:'border-box' as const },
  select: { background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:8, padding:'10px 14px', color:'#e2e8f0', fontSize:14, outline:'none' },
  btn: (v: 'primary'|'danger'|'ghost') => ({
    padding:'9px 18px', borderRadius:8, border:'none', cursor:'pointer', fontSize:13, fontWeight:600, transition:'all 0.15s',
    background: v==='primary' ? 'linear-gradient(135deg,#7c3aed,#4f46e5)' : v==='danger' ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.07)',
    color: v==='danger' ? '#fca5a5' : '#e2e8f0',
    outline: v==='danger' ? '1px solid rgba(239,68,68,0.3)' : v==='ghost' ? '1px solid rgba(255,255,255,0.1)' : 'none',
  }),
  row: { display:'flex', gap:12, alignItems:'center' },
  tag: { background:'rgba(139,92,246,0.15)', border:'1px solid rgba(139,92,246,0.3)', borderRadius:6, padding:'3px 8px', fontSize:11, color:'#a78bfa', fontFamily:'monospace' },
  stat: { textAlign:'center' as const },
  statVal: { fontSize:40, fontWeight:700, background:'linear-gradient(135deg,#a78bfa,#818cf8)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' },
  statLabel: { fontSize:12, color:'rgba(148,163,184,0.5)', marginTop:4 },
  histItem: { padding:'12px 0', borderBottom:'1px solid rgba(255,255,255,0.05)', display:'flex', gap:12, alignItems:'flex-start' },
  toast: (show: boolean) => ({ position:'fixed' as const, bottom:24, right:24, background:'#1e1e3a', border:'1px solid rgba(139,92,246,0.5)', borderRadius:10, padding:'12px 20px', fontSize:13, color:'#a78bfa', fontWeight:600, transition:'all 0.25s', opacity:show?1:0, transform:show?'translateY(0)':'translateY(8px)', pointerEvents:'none' as const }),
}

// ─── Pages ────────────────────────────────────────────────────────────────────
function SettingsPage() {
  const [s, setS] = useState<Settings>({ apiKey:'', language:'en', model:'nova-3' })
  const [saved, setSaved] = useState(false)
  useEffect(() => { fetch(`${API}/settings`).then(r=>r.json()).then(d => setS({ apiKey:d.deepgramApiKey||'', language:d.language||'en', model:d.model||'nova-3' })).catch(()=>{}) }, [])
  const save = async () => {
    await fetch(`${API}/settings`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ deepgramApiKey:s.apiKey, language:s.language, model:s.model }) })
    setSaved(true); setTimeout(()=>setSaved(false), 2500)
  }
  return (
    <div>
      <h2 style={{ fontSize:22, fontWeight:700, marginBottom:24 }}>Settings</h2>
      <div style={S.card}>
        <h3 style={{ marginBottom:20, fontSize:16, color:'#c4b5fd' }}>API Configuration</h3>
        <div style={{ marginBottom:18 }}>
          <label style={S.label}>Deepgram API Key</label>
          <input type="password" style={S.input} value={s.apiKey} onChange={e=>setS({...s,apiKey:e.target.value})} placeholder="dg_..." />
          <p style={{ fontSize:12, color:'rgba(148,163,184,0.4)', marginTop:6 }}>Get your key at <span style={{ color:'#818cf8' }}>console.deepgram.com</span></p>
        </div>
        <div style={{ ...S.row, gap:20, marginBottom:18 }}>
          <div style={{ flex:1 }}>
            <label style={S.label}>Language</label>
            <select style={{...S.select, width:'100%'}} value={s.language} onChange={e=>setS({...s,language:e.target.value})}>
              <option value="en">English</option><option value="es">Spanish</option><option value="fr">French</option><option value="de">German</option><option value="ja">Japanese</option>
            </select>
          </div>
          <div style={{ flex:1 }}>
            <label style={S.label}>Model</label>
            <select style={{...S.select, width:'100%'}} value={s.model} onChange={e=>setS({...s,model:e.target.value})}>
              <option value="nova-3">Nova 3 (Best)</option><option value="nova-2">Nova 2</option><option value="base">Base</option>
            </select>
          </div>
        </div>
        <button style={S.btn('primary')} onClick={save}>{saved ? '✓ Saved!' : 'Save Settings'}</button>
      </div>
      <div style={S.card}>
        <h3 style={{ marginBottom:12, fontSize:16, color:'#c4b5fd' }}>Hotkey</h3>
        <p style={{ fontSize:14, color:'rgba(148,163,184,0.7)', lineHeight:1.6 }}>
          <strong style={{ color:'#e2e8f0' }}>Double-tap Right Option (⌥)</strong> — Toggle recording on/off<br/>
          <strong style={{ color:'#e2e8f0' }}>Hold Right Option (⌥)</strong> — Push-to-talk (release to stop)
        </p>
      </div>
      <div style={S.card}>
        <h3 style={{ marginBottom:12, fontSize:16, color:'#c4b5fd' }}>Dashboard</h3>
        <p style={{ fontSize:14, color:'rgba(148,163,184,0.7)' }}>Running at <span style={{ color:'#818cf8', fontFamily:'monospace' }}>http://localhost:7789</span></p>
      </div>
    </div>
  )
}

function SnippetsPage() {
  const [snippets, setSnippets] = useState<Snippet[]>([])
  const [trigger, setTrigger] = useState(''), [expansion, setExpansion] = useState('')
  const [editId, setEditId] = useState<number|null>(null)
  const load = () => fetch(`${API}/snippets`).then(r=>r.json()).then(setSnippets).catch(()=>{})
  useEffect(() => { load() }, [])
  const save = async () => {
    if (!trigger || !expansion) return
    if (editId !== null) {
      await fetch(`${API}/snippets/${editId}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({trigger,expansion}) })
      setEditId(null)
    } else {
      await fetch(`${API}/snippets`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({trigger,expansion}) })
    }
    setTrigger(''); setExpansion(''); load()
  }
  const del = async (id: number) => { await fetch(`${API}/snippets/${id}`, {method:'DELETE'}); load() }
  const edit = (s: Snippet) => { setEditId(s.id); setTrigger(s.trigger); setExpansion(s.expansion) }
  return (
    <div>
      <h2 style={{ fontSize:22, fontWeight:700, marginBottom:24 }}>Snippets</h2>
      <div style={S.card}>
        <h3 style={{ marginBottom:16, fontSize:16, color:'#c4b5fd' }}>{editId ? 'Edit Snippet' : 'Add Snippet'}</h3>
        <p style={{ fontSize:13, color:'rgba(148,163,184,0.5)', marginBottom:16 }}>When you say the trigger phrase, it will be replaced with the expansion text.</p>
        <div style={{ ...S.row, marginBottom:12 }}>
          <div style={{ flex:1 }}>
            <label style={S.label}>Trigger Phrase</label>
            <input style={S.input} value={trigger} onChange={e=>setTrigger(e.target.value)} placeholder="e.g. my email" />
          </div>
          <div style={{ flex:2 }}>
            <label style={S.label}>Expansion</label>
            <input style={S.input} value={expansion} onChange={e=>setExpansion(e.target.value)} placeholder="e.g. hello@example.com" />
          </div>
          <div style={{ marginTop:20 }}>
            <button style={S.btn('primary')} onClick={save}>{editId ? 'Update' : 'Add'}</button>
          </div>
        </div>
      </div>
      <div style={S.card}>
        {snippets.length === 0 ? (
          <p style={{ color:'rgba(148,163,184,0.4)', fontSize:14, textAlign:'center', padding:'20px 0' }}>No snippets yet. Add one above.</p>
        ) : snippets.map(s => (
          <div key={s.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 0', borderBottom:'1px solid rgba(255,255,255,0.05)' }}>
            <span style={S.tag}>{s.trigger}</span>
            <span style={{ flex:1, fontSize:13, color:'rgba(148,163,184,0.8)' }}>→ {s.expansion}</span>
            <button style={{...S.btn('ghost'), padding:'5px 12px', fontSize:12}} onClick={()=>edit(s)}>Edit</button>
            <button style={{...S.btn('danger'), padding:'5px 12px', fontSize:12}} onClick={()=>del(s.id)}>Delete</button>
          </div>
        ))}
      </div>
    </div>
  )
}

function HistoryPage({ liveHistory }: { liveHistory: HistoryItem[] }) {
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [search, setSearch] = useState('')
  const [toast, setToast] = useState(false)
  const load = () => fetch(`${API}/history`).then(r=>r.json()).then(setHistory).catch(()=>{})
  useEffect(() => { load() }, [])
  useEffect(() => { if (liveHistory.length) setHistory(h => [...liveHistory, ...h]) }, [liveHistory])
  const clear = async () => { await fetch(`${API}/history`, {method:'DELETE'}); setHistory([]) }
  const copy = (text: string) => { navigator.clipboard.writeText(text); setToast(true); setTimeout(()=>setToast(false),2000) }
  const filtered = history.filter(h => h.text.toLowerCase().includes(search.toLowerCase()))
  return (
    <div>
      <h2 style={{ fontSize:22, fontWeight:700, marginBottom:24 }}>History</h2>
      <div style={{ ...S.row, marginBottom:20, gap:12 }}>
        <input style={{...S.input, flex:1}} placeholder="Search transcriptions..." value={search} onChange={e=>setSearch(e.target.value)} />
        <button style={S.btn('danger')} onClick={clear}>Clear All</button>
      </div>
      <div style={S.card}>
        {filtered.length === 0 ? (
          <p style={{ color:'rgba(148,163,184,0.4)', fontSize:14, textAlign:'center', padding:'20px 0' }}>No transcriptions yet.</p>
        ) : filtered.map(h => (
          <div key={h.id} style={S.histItem}>
            <div style={{ flex:1 }}>
              <p style={{ fontSize:14, color:'#e2e8f0', margin:'0 0 6px', lineHeight:1.5 }}>{h.text}</p>
              <div style={{ ...S.row, gap:12 }}>
                <span style={{ fontSize:11, color:'rgba(148,163,184,0.4)' }}>{new Date(h.created_at).toLocaleString()}</span>
                <span style={{ fontSize:11, color:'rgba(148,163,184,0.35)' }}>{h.word_count} words</span>
                {h.duration_sec > 0 && <span style={{ fontSize:11, color:'rgba(148,163,184,0.35)' }}>{h.duration_sec}s</span>}
              </div>
            </div>
            <button style={{...S.btn('ghost'), padding:'5px 12px', fontSize:12, flexShrink:0}} onClick={()=>copy(h.text)}>Copy</button>
          </div>
        ))}
      </div>
      <div style={S.toast(toast)}>Copied to clipboard!</div>
    </div>
  )
}

function StatsPage() {
  const [stats, setStats] = useState<Stats>({ total_words:0, total_sessions:0, total_seconds:0 })
  const load = () => fetch(`${API}/stats`).then(r=>r.json()).then(setStats).catch(()=>{})
  useEffect(() => { load() }, [])
  const reset = async () => { await fetch(`${API}/stats`, {method:'DELETE'}); load() }
  const mins = Math.round(stats.total_seconds / 60)
  const cost = ((stats.total_words / 150) * 0.0059).toFixed(4)
  return (
    <div>
      <h2 style={{ fontSize:22, fontWeight:700, marginBottom:24 }}>Stats</h2>
      <div style={{ ...S.card, display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:24 }}>
        {[
          { val: stats.total_words.toLocaleString(), label:'Total Words' },
          { val: stats.total_sessions.toString(), label:'Sessions' },
          { val: `${mins}m`, label:'Total Time' },
          { val: `$${cost}`, label:'Est. Cost (USD)' },
        ].map(x => (
          <div key={x.label} style={S.stat}>
            <div style={S.statVal}>{x.val}</div>
            <div style={S.statLabel}>{x.label}</div>
          </div>
        ))}
      </div>
      <div style={{ textAlign:'right' }}>
        <button style={S.btn('danger')} onClick={reset}>Reset Stats</button>
      </div>
    </div>
  )
}

// ─── App ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState<Tab>('settings')
  const [liveHistory, setLiveHistory] = useState<HistoryItem[]>([])
  useWS(d => {
    const msg = d as { type: string; item?: HistoryItem }
    if (msg.type === 'history-item' && msg.item) setLiveHistory([msg.item])
  })
  const tabs: { id: Tab; label: string }[] = [
    { id:'settings', label:'⚙ Settings' }, { id:'snippets', label:'✦ Snippets' },
    { id:'history', label:'⏱ History' }, { id:'stats', label:'📊 Stats' },
  ]
  return (
    <div style={S.app}>
      <style>{`* { box-sizing:border-box; margin:0; padding:0 } body { background:#0a0a14 } input:focus,select:focus { border-color:rgba(139,92,246,0.5) !important; box-shadow:0 0 0 3px rgba(139,92,246,0.15) }`}</style>
      <div style={S.header}>
        <div style={S.logo}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <rect x="9" y="2" width="6" height="12" rx="3" fill="white" />
            <path d="M5 10a7 7 0 0014 0" stroke="white" strokeWidth="2" strokeLinecap="round" fill="none"/>
            <line x1="12" y1="17" x2="12" y2="21" stroke="white" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </div>
        <div style={S.title}>Zynthetix Voice</div>
        <div style={S.subtitle}>Dashboard · localhost:7789</div>
      </div>
      <div style={S.nav}>
        {tabs.map(t => <button key={t.id} style={S.tabBtn(tab===t.id)} onClick={()=>setTab(t.id)}>{t.label}</button>)}
      </div>
      <div style={S.main}>
        {tab === 'settings' && <SettingsPage />}
        {tab === 'snippets' && <SnippetsPage />}
        {tab === 'history'  && <HistoryPage liveHistory={liveHistory} />}
        {tab === 'stats'    && <StatsPage />}
      </div>
    </div>
  )
}
