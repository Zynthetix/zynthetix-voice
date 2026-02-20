import React, { useEffect, useState } from 'react'

interface ElectronAPI {
  getSettings: () => Promise<{ apiKey: string; language: string }>
  saveSettings: (s: { apiKey?: string; language?: string }) => Promise<boolean>
}

declare global {
  interface Window { electronAPI: ElectronAPI }
}

export default function SettingsApp() {
  const [apiKey, setApiKey] = useState('')
  const [language, setLanguage] = useState('en-US')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    window.electronAPI.getSettings().then(s => {
      setApiKey(s.apiKey || '')
      setLanguage(s.language || 'en-US')
    })
  }, [])

  const handleSave = async () => {
    await window.electronAPI.saveSettings({ apiKey, language })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div style={{
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      background: '#1a1a2e',
      color: '#e2e8f0',
      minHeight: '100vh',
      padding: 32,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 32 }}>
        <div style={{
          width: 36, height: 36, borderRadius: '50%',
          background: 'linear-gradient(135deg, #6d28d9, #4f46e5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{ fontSize: 18 }}>🎤</span>
        </div>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#fff' }}>Zynthetix Voice</div>
          <div style={{ fontSize: 12, color: '#6b7280' }}>Settings</div>
        </div>
      </div>

      {/* API Key */}
      <div style={{ marginBottom: 24 }}>
        <label style={labelStyle}>Deepgram API Key</label>
        <input
          type="password"
          value={apiKey}
          onChange={e => setApiKey(e.target.value)}
          placeholder="dg_xxxxxxxxxxxxxxxx"
          style={inputStyle}
        />
        <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>
          Get your free API key at{' '}
          <span style={{ color: '#818cf8', cursor: 'pointer' }}
            onClick={() => window.open?.('https://console.deepgram.com')}>
            console.deepgram.com
          </span>
        </div>
      </div>

      {/* Language */}
      <div style={{ marginBottom: 32 }}>
        <label style={labelStyle}>Language</label>
        <select
          value={language}
          onChange={e => setLanguage(e.target.value)}
          style={{ ...inputStyle, cursor: 'pointer', appearance: 'none' as const }}>
          <option value="en-US">English (US)</option>
          <option value="en-GB">English (UK)</option>
          <option value="en-AU">English (Australia)</option>
        </select>
      </div>

      {/* Save button */}
      <button
        onClick={handleSave}
        style={{
          width: '100%',
          padding: '12px 0',
          background: saved
            ? 'linear-gradient(135deg, #16a34a, #15803d)'
            : 'linear-gradient(135deg, #6d28d9, #4f46e5)',
          color: '#fff',
          border: 'none',
          borderRadius: 10,
          fontSize: 14,
          fontWeight: 600,
          cursor: 'pointer',
          transition: 'all 0.3s ease',
          letterSpacing: 0.5,
        }}>
        {saved ? '✓ Saved!' : 'Save Settings'}
      </button>

      {/* Shortcut hint */}
      <div style={{
        marginTop: 24,
        padding: 16,
        background: 'rgba(109,40,217,0.1)',
        border: '1px solid rgba(109,40,217,0.2)',
        borderRadius: 10,
        fontSize: 12,
        color: '#a5b4fc',
        lineHeight: 1.8,
      }}>
        <strong>Right Option Key (⌥ right) Controls</strong><br />
        <span style={{ color: '#c4b5fd' }}>Double-tap Right ⌥</span> → Toggle recording on/off<br />
        <span style={{ color: '#c4b5fd' }}>Hold Right ⌥</span> → Record while held, auto-stop on release
      </div>
    </div>
  )
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 13,
  fontWeight: 600,
  color: '#94a3b8',
  marginBottom: 8,
  letterSpacing: 0.5,
  textTransform: 'uppercase',
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 14px',
  background: '#0f0f1a',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 8,
  color: '#e2e8f0',
  fontSize: 13,
  fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
  outline: 'none',
}
