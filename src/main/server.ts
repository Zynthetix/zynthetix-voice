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
  app.use(cors({ origin: /^http:\/\/localhost(:\d+)?$/ }))
  app.use(express.json())

  // Serve dist/renderer as root (assets live at /assets/)
  const rendererPath = path.join(__dirname, '../renderer')
  app.use(express.static(rendererPath))
  // Dashboard index
  app.get('/', (_req, res) => res.sendFile(path.join(rendererPath, 'src/dashboard/index.html')))

  // ── Settings ──────────────────────────────────────────────────────────────
  app.get('/api/settings', (_req, res) => {
    res.json({ whisperModel: store.get('whisperModel') || 'base', language: store.get('language') || 'en' })
  })
  app.post('/api/settings', (req, res) => {
    const { whisperModel, language } = req.body
    if (whisperModel) store.set('whisperModel', whisperModel)
    if (language) store.set('language', language)
    res.json({ ok: true })
  })

  // ── History ───────────────────────────────────────────────────────────────
  app.get('/api/history', (_req, res) => res.json(getHistory()))
  app.delete('/api/history', (_req, res) => { clearHistory(); res.json({ ok: true }) })

  // ── Snippets ──────────────────────────────────────────────────────────────
  app.get('/api/snippets', (_req, res) => res.json(getSnippets()))
  app.post('/api/snippets', (req, res) => {
    const { trigger, expansion } = req.body
    if (!trigger || typeof trigger !== 'string' || trigger.trim().length === 0 || trigger.length > 100)
      return res.status(400).json({ error: 'trigger must be a non-empty string ≤ 100 chars' })
    if (!expansion || typeof expansion !== 'string' || expansion.trim().length === 0 || expansion.length > 5000)
      return res.status(400).json({ error: 'expansion must be a non-empty string ≤ 5000 chars' })
    insertSnippet(trigger.trim(), expansion); res.json({ ok: true })
  })
  app.put('/api/snippets/:id', (req, res) => {
    const { trigger, expansion } = req.body
    if (!trigger || typeof trigger !== 'string' || trigger.trim().length === 0 || trigger.length > 100)
      return res.status(400).json({ error: 'trigger must be a non-empty string ≤ 100 chars' })
    if (!expansion || typeof expansion !== 'string' || expansion.trim().length === 0 || expansion.length > 5000)
      return res.status(400).json({ error: 'expansion must be a non-empty string ≤ 5000 chars' })
    updateSnippet(Number(req.params.id), trigger.trim(), expansion); res.json({ ok: true })
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
  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`[server] Port ${DASHBOARD_PORT} already in use — dashboard will not be available.`)
    } else {
      console.error('[server] HTTP server error:', err)
    }
  })
}
