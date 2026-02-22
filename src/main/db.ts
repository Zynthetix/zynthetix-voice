import Database from 'better-sqlite3'
import { app } from 'electron'
import path from 'path'

let db: Database.Database
let snippetRegexCache: { trigger: string; expansion: string; re: RegExp }[] | null = null

export function getDb(): Database.Database {
  if (!db) {
    const dbPath = path.join(app.getPath('userData'), 'zynthetix.db')
    db = new Database(dbPath)
    db.pragma('journal_mode = WAL')
    db.exec(`
      CREATE TABLE IF NOT EXISTS history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        text TEXT NOT NULL,
        word_count INTEGER DEFAULT 0,
        duration_sec INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS snippets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        trigger TEXT NOT NULL UNIQUE,
        expansion TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS stats (
        id INTEGER PRIMARY KEY DEFAULT 1,
        total_words INTEGER DEFAULT 0,
        total_sessions INTEGER DEFAULT 0,
        total_seconds INTEGER DEFAULT 0
      );
      INSERT OR IGNORE INTO stats (id) VALUES (1);
    `)
  }
  return db
}

export function insertHistory(text: string, wordCount: number, durationSec: number) {
  return getDb().prepare('INSERT INTO history (text, word_count, duration_sec) VALUES (?,?,?)').run(text, wordCount, durationSec)
}
export function getHistory(limit = 200) {
  return getDb().prepare('SELECT * FROM history ORDER BY created_at DESC LIMIT ?').all(limit)
}
export function clearHistory() {
  return getDb().prepare('DELETE FROM history').run()
}
export function getSnippets() {
  return getDb().prepare('SELECT * FROM snippets ORDER BY created_at DESC').all()
}
export function insertSnippet(trigger: string, expansion: string) {
  snippetRegexCache = null
  return getDb().prepare('INSERT INTO snippets (trigger, expansion) VALUES (?,?)').run(trigger, expansion)
}
export function updateSnippet(id: number, trigger: string, expansion: string) {
  snippetRegexCache = null
  return getDb().prepare('UPDATE snippets SET trigger=?, expansion=? WHERE id=?').run(trigger, expansion, id)
}
export function deleteSnippet(id: number) {
  snippetRegexCache = null
  return getDb().prepare('DELETE FROM snippets WHERE id=?').run(id)
}
export function applySnippets(text: string): string {
  if (!snippetRegexCache) {
    const rows = getSnippets() as { trigger: string; expansion: string }[]
    snippetRegexCache = rows.map(s => ({
      trigger: s.trigger,
      expansion: s.expansion,
      re: new RegExp(`\\b${s.trigger.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi'),
    }))
  }
  let result = text
  for (const s of snippetRegexCache) {
    result = result.replace(s.re, s.expansion)
  }
  return result
}
export function getStats() {
  return getDb().prepare('SELECT * FROM stats WHERE id=1').get()
}
export function incrementStats(words: number, seconds: number) {
  getDb().prepare('UPDATE stats SET total_words=total_words+?, total_sessions=total_sessions+1, total_seconds=total_seconds+? WHERE id=1').run(words, seconds)
}
export function resetStats() {
  return getDb().prepare('UPDATE stats SET total_words=0, total_sessions=0, total_seconds=0 WHERE id=1').run()
}

export function initDb(): void {
  getDb() // triggers lazy init — throws if DB cannot be opened
}
