import express from 'express'
import http from 'http'
import { WebSocketServer, WebSocket } from 'ws'
import cors from 'cors'
import path from 'path'
import { getHistory, clearHistory, getSnippets, insertSnippet, updateSnippet, deleteSnippet, getStats, resetStats } from './db'

export const DASHBOARD_PORT = 7789
const clients = new Set<WebSocket>()

export function broadcast(data: object) {
  const msg = JSON.stringify(data)
  for (const c of clients) { if (c.readyState === WebSocket.OPEN) c.send(msg) }
}

export function startServer(store: { get: (k: string) => unknown; set: (k: string, v: unknown) => void }) {
  const app = express()
  app.use(cors()); app.use(express.json())

  // Static dashboard in production
  const staticPath = path.join(__dirname, '../../renderer/src/dashboard')
  app.use(express.static(staticPath))

  // ── Settings ──────────────────────────────────────────────────────────────
  app.get('/api/settings', (_req, res) => {
    res.json({ deepgramApiKey: store.get('deepgramApiKey'), language: store.get('language') || 'en', model: store.get('model') || 'nova-3' })
  })
  app.post('/api/settings', (req, res) => {
    const { deepgramApiKey, language, model } = req.body
    if (deepgramApiKey) store.set('deepgramApiKey', deepgramApiKey)
    if (language) store.set('language', language)
    if (model) store.set('model', model)
    res.json({ ok: true })
  })

  // ── History ───────────────────────────────────────────────────────────────
  app.get('/api/history', (_req, res) => res.json(getHistory()))
  app.delete('/api/history', (_req, res) => { clearHistory(); res.json({ ok: true }) })

  // ── Snippets ──────────────────────────────────────────────────────────────
  app.get('/api/snippets', (_req, res) => res.json(getSnippets()))
  app.post('/api/snippets', (req, res) => {
    const { trigger, expansion } = req.body
    if (!trigger || !expansion) return res.status(400).json({ error: 'trigger and expansion required' })
    insertSnippet(trigger, expansion); res.json({ ok: true })
  })
  app.put('/api/snippets/:id', (req, res) => {
    const { trigger, expansion } = req.body
    updateSnippet(Number(req.params.id), trigger, expansion); res.json({ ok: true })
  })
  app.delete('/api/snippets/:id', (req, res) => {
    deleteSnippet(Number(req.params.id)); res.json({ ok: true })
  })

  // ── Stats ─────────────────────────────────────────────────────────────────
  app.get('/api/stats', (_req, res) => res.json(getStats()))
  app.delete('/api/stats', (_req, res) => { resetStats(); res.json({ ok: true }) })

  const server = http.createServer(app)
  const wss = new WebSocketServer({ server })
  wss.on('connection', ws => {
    clients.add(ws)
    ws.on('close', () => clients.delete(ws))
  })

  server.listen(DASHBOARD_PORT, () => {
    console.log(`\n  🎙  Zynthetix Voice Dashboard → http://localhost:${DASHBOARD_PORT}\n`)
  })
}
