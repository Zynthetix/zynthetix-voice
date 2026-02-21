import React, { useState, useEffect, useRef, useCallback } from 'react'

// ── Types ──────────────────────────────────────────────────────────────────────
type Page = 'history' | 'snippets' | 'settings' | 'stats'

interface HistoryItem {
  id?: number
  text: string
  word_count: number
  duration_sec: number
  created_at: string
}

interface Snippet {
  id: number
  trigger: string
  expansion: string
}

interface Stats {
  total_words: number
  total_seconds: number
  total_sessions: number
}

interface AppSettings {
  deepgramApiKey: string
  language: string
  model: string
}

// ── Design tokens ──────────────────────────────────────────────────────────────
const C = {
  bg:       '#0a0a0b',
  surface:  '#111113',
  surface2: '#18181b',
  border:   '#27272a',
  border2:  '#3f3f46',
  text:     '#fafafa',
  text2:    '#a1a1aa',
  text3:    '#52525b',
  accent:   '#fafafa',
  red:      '#f87171',
  green:    '#4ade80',
} as const

// ── Utilities ──────────────────────────────────────────────────────────────────
function formatTime(secs: number) {
  if (secs < 60) return `${secs}s`
  return `${Math.floor(secs / 60)}m ${secs % 60}s`
}

function formatDate(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// ── Shared component styles ────────────────────────────────────────────────────
const inputCss: React.CSSProperties = {
  width: '100%',
  padding: '9px 12px',
  background: C.surface,
  border: `1px solid ${C.border}`,
  borderRadius: 8,
  color: C.text,
  fontSize: 13,
  fontFamily: 'inherit',
  outline: 'none',
  transition: 'border-color 0.15s',
}

const btnCss: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '8px 14px',
  background: C.surface2,
  border: `1px solid ${C.border}`,
  borderRadius: 8,
  color: C.text2,
  fontSize: 12,
  fontWeight: 500,
  fontFamily: 'inherit',
  cursor: 'pointer',
  transition: 'all 0.15s',
  letterSpacing: 0.2,
}

const btnPrimaryCss: React.CSSProperties = {
  ...btnCss,
  background: C.text,
  border: `1px solid ${C.text}`,
  color: C.bg,
}

// ── Nav icons ──────────────────────────────────────────────────────────────────
function IconHistory({ active }: { active: boolean }) {
  const c = active ? C.text : C.text3
  return (
    <svg width={15} height={15} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke={c} strokeWidth="1.5"/>
      <path d="M12 7v5l3 3" stroke={c} strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
}
function IconSnippets({ active }: { active: boolean }) {
  const c = active ? C.text : C.text3
  return (
    <svg width={15} height={15} viewBox="0 0 24 24" fill="none">
      <path d="M9 7H6a2 2 0 00-2 2v9a2 2 0 002 2h9a2 2 0 002-2v-3" stroke={c} strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M9 15l9-9m0 0H13m5 0v5" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}
function IconSettings({ active }: { active: boolean }) {
  const c = active ? C.text : C.text3
  return (
    <svg width={15} height={15} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="3" stroke={c} strokeWidth="1.5"/>
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" stroke={c} strokeWidth="1.5"/>
    </svg>
  )
}
function IconStats({ active }: { active: boolean }) {
  const c = active ? C.text : C.text3
  return (
    <svg width={15} height={15} viewBox="0 0 24 24" fill="none">
      <path d="M18 20V10M12 20V4M6 20v-6" stroke={c} strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
}

// ── Main App ───────────────────────────────────────────────────────────────────
export default function App() {
  const [page, setPage] = useState<Page>('history')
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [snippets, setSnippets] = useState<Snippet[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [settings, setSettings] = useState<AppSettings>({ deepgramApiKey: '', language: 'en', model: 'nova-2' })
  const [liveFlash, setLiveFlash] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    fetch('/api/history').then(r => r.json()).then(setHistory).catch(() => {})
    fetch('/api/snippets').then(r => r.json()).then(setSnippets).catch(() => {})
    fetch('/api/stats').then(r => r.json()).then(setStats).catch(() => {})
    fetch('/api/settings').then(r => r.json()).then(d => setSettings({
      deepgramApiKey: d.deepgramApiKey || '',
      language: d.language || 'en',
      model: d.model || 'nova-2',
    })).catch(() => {})

    const ws = new WebSocket(`ws://localhost:7789`)
    wsRef.current = ws
    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data)
        if (data.type === 'history-item') {
          setHistory(prev => [data.item, ...prev])
          setLiveFlash(true)
          setTimeout(() => setLiveFlash(false), 1200)
        }
      } catch {}
    }
    return () => ws.close()
  }, [])

  const copyText = useCallback((text: string, key: string) => {
    navigator.clipboard.writeText(text).catch(() => {})
    setCopied(key)
    setTimeout(() => setCopied(null), 2000)
  }, [])

  const nav: { id: Page; label: string; Icon: React.FC<{ active: boolean }> }[] = [
    { id: 'history',  label: 'History',  Icon: IconHistory  },
    { id: 'snippets', label: 'Snippets', Icon: IconSnippets },
    { id: 'stats',    label: 'Stats',    Icon: IconStats    },
    { id: 'settings', label: 'Settings', Icon: IconSettings },
  ]

  return (
    <div style={{ display: 'flex', height: '100vh', background: C.bg, fontFamily: 'Inter, system-ui, sans-serif' }}>

      {/* ── Sidebar ── */}
      <aside style={{
        width: 216, flexShrink: 0,
        borderRight: `1px solid ${C.border}`,
        display: 'flex', flexDirection: 'column',
        background: C.surface,
      }}>
        {/* Logo */}
        <div style={{
          padding: '20px 20px 16px',
          borderBottom: `1px solid ${C.border}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 28, height: 28, borderRadius: 8,
              background: C.surface2,
              border: `1px solid ${C.border2}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <rect x="9" y="2" width="6" height="12" rx="3" fill={C.text}/>
                <path d="M5 10a7 7 0 0014 0" stroke={C.text} strokeWidth="2" strokeLinecap="round"/>
                <line x1="12" y1="17" x2="12" y2="21" stroke={C.text} strokeWidth="2" strokeLinecap="round"/>
                <line x1="9" y1="21" x2="15" y2="21" stroke={C.text} strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.text, letterSpacing: -0.2 }}>Zynthetix</div>
              <div style={{ fontSize: 10, color: C.text3, letterSpacing: 0.3, marginTop: 1 }}>VOICE</div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ padding: '10px 10px', flex: 1 }}>
          {nav.map(({ id, label, Icon }) => (
            <button key={id} onClick={() => setPage(id)} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              width: '100%', padding: '8px 10px',
              background: page === id ? C.surface2 : 'transparent',
              border: page === id ? `1px solid ${C.border}` : '1px solid transparent',
              borderRadius: 7,
              color: page === id ? C.text : C.text2,
              fontSize: 13, fontWeight: page === id ? 500 : 400,
              fontFamily: 'inherit',
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'all 0.12s',
              marginBottom: 2,
            }}>
              <Icon active={page === id} />
              {label}
              {id === 'history' && liveFlash && (
                <span style={{
                  marginLeft: 'auto', width: 6, height: 6,
                  borderRadius: '50%', background: C.green,
                  boxShadow: `0 0 6px ${C.green}`,
                }}/>
              )}
            </button>
          ))}
        </nav>

        {/* Bottom shortcut hint */}
        <div style={{
          padding: '14px 16px',
          borderTop: `1px solid ${C.border}`,
        }}>
          <div style={{ fontSize: 10, color: C.text3, lineHeight: 1.8, letterSpacing: 0.2 }}>
            <span style={{ color: C.text2, fontWeight: 500 }}>⌥⌥</span> toggle recording<br/>
            <span style={{ color: C.text2, fontWeight: 500 }}>hold ⌥</span> push to talk
          </div>
        </div>
      </aside>

      {/* ── Main ── */}
      <main style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {page === 'history'  && <HistoryPage  history={history} setHistory={setHistory} copyText={copyText} copied={copied} />}
        {page === 'snippets' && <SnippetsPage snippets={snippets} setSnippets={setSnippets} />}
        {page === 'stats'    && <StatsPage    stats={stats} setStats={setStats} />}
        {page === 'settings' && <SettingsPage settings={settings} setSettings={setSettings} />}
      </main>
    </div>
  )
}

// ── Page: History ──────────────────────────────────────────────────────────────
function HistoryPage({ history, setHistory, copyText, copied }: {
  history: HistoryItem[]
  setHistory: React.Dispatch<React.SetStateAction<HistoryItem[]>>
  copyText: (text: string, key: string) => void
  copied: string | null
}) {
  const clearAll = async () => {
    if (!confirm('Clear all transcription history?')) return
    await fetch('/api/history', { method: 'DELETE' }).catch(() => {})
    setHistory([])
  }

  return (
    <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <PageHeader title="History" subtitle={`${history.length} transcription${history.length !== 1 ? 's' : ''}`}>
        {history.length > 0 && (
          <button onClick={clearAll} style={{ ...btnCss, color: C.red, borderColor: 'rgba(248,113,113,0.2)' }}>
            Clear all
          </button>
        )}
      </PageHeader>

      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px 28px' }}>
        {history.length === 0 ? (
          <EmptyState
            icon={<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke={C.text3} strokeWidth="1.5"/><path d="M12 7v5l3 3" stroke={C.text3} strokeWidth="1.5" strokeLinecap="round"/></svg>}
            title="No transcriptions yet"
            body="Start recording with Right Option (⌥) to see your history here."
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {history.map((item, i) => {
              const key = `h-${i}`
              return (
                <div key={i} style={{
                  background: C.surface,
                  border: `1px solid ${C.border}`,
                  borderRadius: 10,
                  padding: '14px 16px',
                  transition: 'border-color 0.15s',
                }}>
                  <p style={{
                    fontSize: 13.5, lineHeight: 1.6,
                    color: C.text, fontWeight: 400,
                    marginBottom: 10,
                    wordBreak: 'break-word',
                  }}>{item.text}</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: 11, color: C.text3 }}>{formatDate(item.created_at)}</span>
                    <span style={{ fontSize: 11, color: C.text3 }}>·</span>
                    <span style={{ fontSize: 11, color: C.text3 }}>{item.word_count} words</span>
                    <span style={{ fontSize: 11, color: C.text3 }}>·</span>
                    <span style={{ fontSize: 11, color: C.text3 }}>{formatTime(item.duration_sec)}</span>
                    <button onClick={() => copyText(item.text, key)} style={{
                      marginLeft: 'auto',
                      ...btnCss,
                      padding: '4px 10px',
                      fontSize: 11,
                      color: copied === key ? C.green : C.text3,
                      borderColor: copied === key ? 'rgba(74,222,128,0.2)' : C.border,
                    }}>
                      {copied === key ? '✓ Copied' : 'Copy'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Page: Snippets ─────────────────────────────────────────────────────────────
function SnippetsPage({ snippets, setSnippets }: {
  snippets: Snippet[]
  setSnippets: React.Dispatch<React.SetStateAction<Snippet[]>>
}) {
  const [trigger, setTrigger] = useState('')
  const [expansion, setExpansion] = useState('')
  const [editing, setEditing] = useState<Snippet | null>(null)
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!trigger.trim() || !expansion.trim()) return
    setSaving(true)
    try {
      if (editing) {
        await fetch(`/api/snippets/${editing.id}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ trigger, expansion }),
        })
        setSnippets(prev => prev.map(s => s.id === editing.id ? { ...s, trigger, expansion } : s))
      } else {
        await fetch('/api/snippets', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ trigger, expansion }),
        })
        const fresh = await fetch('/api/snippets').then(r => r.json())
        setSnippets(fresh)
      }
      setTrigger(''); setExpansion(''); setEditing(null)
    } catch {}
    setSaving(false)
  }

  const handleDelete = async (id: number) => {
    await fetch(`/api/snippets/${id}`, { method: 'DELETE' }).catch(() => {})
    setSnippets(prev => prev.filter(s => s.id !== id))
  }

  const startEdit = (s: Snippet) => {
    setEditing(s); setTrigger(s.trigger); setExpansion(s.expansion)
  }

  const cancelEdit = () => {
    setEditing(null); setTrigger(''); setExpansion('')
  }

  return (
    <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <PageHeader title="Snippets" subtitle="Say a trigger word → paste the expansion">
      </PageHeader>

      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px 28px' }}>
        {/* Add / Edit form */}
        <div style={{
          background: C.surface, border: `1px solid ${C.border}`,
          borderRadius: 10, padding: 16, marginBottom: 20,
        }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: C.text3, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 12 }}>
            {editing ? 'Edit snippet' : 'New snippet'}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10, marginBottom: 12 }}>
            <div>
              <label style={labelCss}>Trigger</label>
              <input value={trigger} onChange={e => setTrigger(e.target.value)}
                placeholder="e.g. sig" style={inputCss}
                onKeyDown={e => e.key === 'Enter' && handleSave()} />
              <div style={{ fontSize: 10, color: C.text3, marginTop: 4 }}>Spoken shortcut</div>
            </div>
            <div>
              <label style={labelCss}>Expansion</label>
              <input value={expansion} onChange={e => setExpansion(e.target.value)}
                placeholder="e.g. Best regards, Karthik" style={inputCss}
                onKeyDown={e => e.key === 'Enter' && handleSave()} />
              <div style={{ fontSize: 10, color: C.text3, marginTop: 4 }}>Text to insert</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleSave} disabled={saving || !trigger.trim() || !expansion.trim()}
              style={{ ...btnPrimaryCss, opacity: (!trigger.trim() || !expansion.trim()) ? 0.4 : 1 }}>
              {saving ? 'Saving…' : editing ? 'Update' : 'Add snippet'}
            </button>
            {editing && <button onClick={cancelEdit} style={btnCss}>Cancel</button>}
          </div>
        </div>

        {/* List */}
        {snippets.length === 0 ? (
          <EmptyState
            icon={<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M9 7H6a2 2 0 00-2 2v9a2 2 0 002 2h9a2 2 0 002-2v-3" stroke={C.text3} strokeWidth="1.5" strokeLinecap="round"/><path d="M9 15l9-9m0 0H13m5 0v5" stroke={C.text3} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
            title="No snippets yet"
            body="Create shortcuts — say the trigger word and it expands into the full text."
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {snippets.map(s => (
              <div key={s.id} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                background: C.surface, border: `1px solid ${C.border}`,
                borderRadius: 8, padding: '10px 14px',
              }}>
                <div style={{
                  flexShrink: 0, padding: '2px 8px',
                  background: C.surface2, border: `1px solid ${C.border}`,
                  borderRadius: 5, fontSize: 11, fontWeight: 600,
                  color: C.text, fontFamily: 'monospace',
                  letterSpacing: 0.3,
                }}>{s.trigger}</div>
                <div style={{ fontSize: 11, color: C.text3, flexShrink: 0 }}>→</div>
                <div style={{ flex: 1, fontSize: 13, color: C.text2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {s.expansion}
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button onClick={() => startEdit(s)} style={{ ...btnCss, padding: '4px 10px', fontSize: 11 }}>Edit</button>
                  <button onClick={() => handleDelete(s.id)} style={{ ...btnCss, padding: '4px 10px', fontSize: 11, color: C.red, borderColor: 'rgba(248,113,113,0.2)' }}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Page: Stats ────────────────────────────────────────────────────────────────
function StatsPage({ stats, setStats }: {
  stats: Stats | null
  setStats: React.Dispatch<React.SetStateAction<Stats | null>>
}) {
  const clearStats = async () => {
    if (!confirm('Reset all stats?')) return
    await fetch('/api/stats', { method: 'DELETE' }).catch(() => {})
    setStats({ total_words: 0, total_seconds: 0, total_sessions: 0 })
  }

  const cards: { label: string; value: string; sub?: string }[] = stats ? [
    { label: 'Words dictated', value: stats.total_words.toLocaleString(), sub: 'lifetime total' },
    { label: 'Time recorded', value: formatTime(stats.total_seconds), sub: 'audio processed' },
    { label: 'Sessions', value: stats.total_sessions.toLocaleString(), sub: 'recordings made' },
    {
      label: 'Avg words/session',
      value: stats.total_sessions > 0 ? Math.round(stats.total_words / stats.total_sessions).toString() : '—',
      sub: 'per recording',
    },
  ] : []

  return (
    <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <PageHeader title="Stats" subtitle="Your dictation activity">
        {stats && (stats.total_words > 0 || stats.total_sessions > 0) && (
          <button onClick={clearStats} style={{ ...btnCss, color: C.red, borderColor: 'rgba(248,113,113,0.2)' }}>
            Reset stats
          </button>
        )}
      </PageHeader>

      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px 28px' }}>
        {!stats ? (
          <div style={{ color: C.text3, fontSize: 13 }}>Loading…</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
            {cards.map(card => (
              <div key={card.label} style={{
                background: C.surface, border: `1px solid ${C.border}`,
                borderRadius: 12, padding: '20px 22px',
              }}>
                <div style={{ fontSize: 11, color: C.text3, fontWeight: 500, letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 10 }}>
                  {card.label}
                </div>
                <div style={{ fontSize: 32, fontWeight: 600, color: C.text, letterSpacing: -1, lineHeight: 1 }}>
                  {card.value}
                </div>
                {card.sub && (
                  <div style={{ fontSize: 11, color: C.text3, marginTop: 6 }}>{card.sub}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Page: Settings ─────────────────────────────────────────────────────────────
function SettingsPage({ settings, setSettings }: {
  settings: AppSettings
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>
}) {
  const [saved, setSaved] = useState(false)
  const [showKey, setShowKey] = useState(false)

  const handleSave = async () => {
    await fetch('/api/settings', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    }).catch(() => {})
    setSaved(true)
    setTimeout(() => setSaved(false), 2200)
  }

  return (
    <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <PageHeader title="Settings" subtitle="API and transcription configuration" />

      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px 28px' }}>
        <div style={{ maxWidth: 480 }}>

          {/* API Key */}
          <Section title="Deepgram API Key">
            <div style={{ position: 'relative' }}>
              <input
                type={showKey ? 'text' : 'password'}
                value={settings.deepgramApiKey}
                onChange={e => setSettings(s => ({ ...s, deepgramApiKey: e.target.value }))}
                placeholder="dg_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                style={{ ...inputCss, paddingRight: 70 }}
              />
              <button onClick={() => setShowKey(v => !v)} style={{
                position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', color: C.text3, cursor: 'pointer',
                fontSize: 11, fontFamily: 'inherit', padding: '2px 4px',
              }}>{showKey ? 'Hide' : 'Show'}</button>
            </div>
            <div style={{ fontSize: 11, color: C.text3, marginTop: 6 }}>
              Get a free key at{' '}
              <a href="https://console.deepgram.com" target="_blank" rel="noreferrer"
                style={{ color: C.text2, textDecoration: 'none' }}>
                console.deepgram.com
              </a>
            </div>
          </Section>

          {/* Language */}
          <Section title="Language">
            <select value={settings.language} onChange={e => setSettings(s => ({ ...s, language: e.target.value }))}
              style={{ ...inputCss, cursor: 'pointer' }}>
              <option value="en">English</option>
              <option value="en-US">English (US)</option>
              <option value="en-GB">English (UK)</option>
              <option value="en-AU">English (Australia)</option>
              <option value="es">Spanish</option>
              <option value="fr">French</option>
              <option value="de">German</option>
              <option value="ja">Japanese</option>
              <option value="ko">Korean</option>
              <option value="zh">Chinese</option>
            </select>
          </Section>

          {/* Model */}
          <Section title="Model">
            <select value={settings.model} onChange={e => setSettings(s => ({ ...s, model: e.target.value }))}
              style={{ ...inputCss, cursor: 'pointer' }}>
              <option value="nova-2">Nova 2 (Recommended)</option>
              <option value="nova-3">Nova 3</option>
              <option value="nova">Nova</option>
              <option value="enhanced">Enhanced</option>
              <option value="base">Base</option>
            </select>
            <div style={{ fontSize: 11, color: C.text3, marginTop: 6 }}>
              Nova 2 offers the best balance of speed and accuracy.
            </div>
          </Section>

          <button onClick={handleSave} style={{
            ...btnPrimaryCss,
            padding: '10px 20px',
            fontSize: 13,
            marginTop: 4,
            background: saved ? C.green : C.text,
            borderColor: saved ? C.green : C.text,
            color: saved ? '#052e16' : C.bg,
            transition: 'all 0.2s',
          }}>
            {saved ? '✓ Saved' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Shared layout pieces ───────────────────────────────────────────────────────
function PageHeader({ title, subtitle, children }: {
  title: string
  subtitle?: string
  children?: React.ReactNode
}) {
  return (
    <div style={{
      padding: '22px 24px 20px',
      borderBottom: `1px solid ${C.border}`,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: 16, flexShrink: 0,
    }}>
      <div>
        <h1 style={{ fontSize: 16, fontWeight: 600, color: C.text, letterSpacing: -0.3 }}>{title}</h1>
        {subtitle && <p style={{ fontSize: 12, color: C.text3, marginTop: 2 }}>{subtitle}</p>}
      </div>
      {children && <div style={{ display: 'flex', gap: 8 }}>{children}</div>}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <label style={labelCss}>{title}</label>
      {children}
    </div>
  )
}

function EmptyState({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: '60px 24px', textAlign: 'center',
    }}>
      <div style={{ marginBottom: 14, opacity: 0.5 }}>{icon}</div>
      <div style={{ fontSize: 14, fontWeight: 500, color: C.text2, marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 12, color: C.text3, maxWidth: 280, lineHeight: 1.6 }}>{body}</div>
    </div>
  )
}

const labelCss: React.CSSProperties = {
  display: 'block',
  fontSize: 11, fontWeight: 600,
  color: C.text3, letterSpacing: 0.6,
  textTransform: 'uppercase',
  marginBottom: 8,
}
