import React, { useEffect, useState } from 'react'

interface ElectronAPI {
  getSettings: () => Promise<{ deepgramApiKey: string; language: string; model: string }>
  saveSettings: (s: { deepgramApiKey?: string; language?: string; model?: string }) => Promise<boolean>
}

declare global {
  interface Window { electronAPI: ElectronAPI }
}

const C = {
  bg:       '#0F0F10',
  surface:  '#111113',
  surface2: '#18181b',
  border:   '#27272a',
  border2:  '#3f3f46',
  text:     '#fafafa',
  text2:    '#a1a1aa',
  text3:    '#52525b',
  accent:   '#4F76F6',
  green:    '#4ade80',
} as const

export default function SettingsApp() {
  const [apiKey, setApiKey]     = useState('')
  const [language, setLanguage] = useState('en')
  const [model, setModel]       = useState('nova-2')
  const [saved, setSaved]       = useState(false)
  const [showKey, setShowKey]   = useState(false)

  useEffect(() => {
    window.electronAPI.getSettings().then(s => {
      setApiKey(s.deepgramApiKey || '')
      setLanguage(s.language || 'en')
      setModel(s.model || 'nova-2')
    })
  }, [])

  const handleSave = async () => {
    await window.electronAPI.saveSettings({ deepgramApiKey: apiKey, language, model })
    setSaved(true)
    setTimeout(() => setSaved(false), 2200)
  }

  return (
    <div style={{
      fontFamily: "'Inter', system-ui, sans-serif",
      background: C.bg, color: C.text,
      minHeight: '100vh', padding: '24px 20px',
      WebkitFontSmoothing: 'antialiased',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 28, paddingBottom: 20, borderBottom: `1px solid ${C.border}` }}>
        <div style={{
          width: 30, height: 30, borderRadius: 8,
          background: C.surface2, border: `1px solid ${C.border2}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <rect x="9" y="2" width="6" height="12" rx="3" fill={C.text}/>
            <path d="M5 10a7 7 0 0014 0" stroke={C.text} strokeWidth="2" strokeLinecap="round"/>
            <line x1="12" y1="17" x2="12" y2="21" stroke={C.text} strokeWidth="2" strokeLinecap="round"/>
            <line x1="9" y1="21" x2="15" y2="21" stroke={C.text} strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.text, letterSpacing: -0.2 }}>Zynthetix Voice</div>
          <div style={{ fontSize: 10, color: C.text3, letterSpacing: 0.4, marginTop: 1 }}>SETTINGS</div>
        </div>
      </div>

      {/* API Key */}
      <SettingRow label="Deepgram API Key">
        <div style={{ position: 'relative' }}>
          <input
            type={showKey ? 'text' : 'password'}
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            placeholder="dg_xxxxxxxxxxxxxxxx"
            style={{ ...inputStyle, paddingRight: 52 }}
          />
          <button onClick={() => setShowKey(v => !v)} style={{
            position: 'absolute', right: 9, top: '50%', transform: 'translateY(-50%)',
            background: 'none', border: 'none', color: C.text3, cursor: 'pointer',
            fontSize: 11, fontFamily: 'inherit', padding: '2px 4px',
          }}>{showKey ? 'Hide' : 'Show'}</button>
        </div>
        <Hint>Free key at <A href="https://console.deepgram.com">console.deepgram.com</A></Hint>
      </SettingRow>

      {/* Language */}
      <SettingRow label="Language">
        <select value={language} onChange={e => setLanguage(e.target.value)}
          style={{ ...inputStyle, cursor: 'pointer' }}>
          <option value="en">English</option>
          <option value="en-US">English (US)</option>
          <option value="en-GB">English (UK)</option>
          <option value="es">Spanish</option>
          <option value="fr">French</option>
          <option value="de">German</option>
          <option value="ja">Japanese</option>
        </select>
      </SettingRow>

      {/* Model */}
      <SettingRow label="Model">
        <select value={model} onChange={e => setModel(e.target.value)}
          style={{ ...inputStyle, cursor: 'pointer' }}>
          <option value="nova-2">Nova 2 (Recommended)</option>
          <option value="nova-3">Nova 3</option>
          <option value="enhanced">Enhanced</option>
          <option value="base">Base</option>
        </select>
      </SettingRow>

      {/* Save */}
      <button onClick={handleSave} style={{
        width: '100%', padding: '10px 0',
        background: saved ? C.green : C.accent,
        border: 'none', borderRadius: 8,
        color: '#fff',
        fontSize: 13, fontWeight: 600,
        fontFamily: 'inherit', cursor: 'pointer',
        letterSpacing: 0.2,
        transition: 'all 0.2s',
        marginBottom: 20,
      }}>
        {saved ? '✓ Saved' : 'Save changes'}
      </button>

      {/* Shortcut hint */}
      <div style={{
        padding: '14px 16px',
        background: C.surface,
        border: `1px solid ${C.border}`,
        borderRadius: 10,
        fontSize: 11, color: C.text3, lineHeight: 2,
      }}>
        <div style={{ fontWeight: 600, color: C.text2, marginBottom: 4, letterSpacing: 0.2 }}>Keyboard shortcut</div>
        <span style={{ color: C.text2, fontWeight: 500 }}>Double-tap Right ⌥</span> — toggle recording<br/>
        <span style={{ color: C.text2, fontWeight: 500 }}>Hold Right ⌥</span> — record while held
      </div>
    </div>
  )
}

function SettingRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <label style={{
        display: 'block', fontSize: 11, fontWeight: 600,
        color: '#52525b', letterSpacing: 0.6,
        textTransform: 'uppercase', marginBottom: 7,
      }}>{label}</label>
      {children}
    </div>
  )
}

function Hint({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 11, color: '#52525b', marginTop: 5 }}>{children}</div>
}

function A({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <span style={{ color: '#a1a1aa', cursor: 'pointer', textDecoration: 'none' }}
      onClick={() => window.open?.(href)}>{children}</span>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px',
  background: '#111113',
  border: '1px solid #27272a',
  borderRadius: 8,
  color: '#fafafa', fontSize: 13,
  fontFamily: "'Inter', system-ui, sans-serif",
  outline: 'none',
}

