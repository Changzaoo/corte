import { Router } from 'express'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { config } from '../config.js'
import { requireAuth } from '../middleware/auth.js'

export const systemRouter = Router()

/** Raiz do app instalado (a pasta que contém package.json/apps/scripts).
 *  O vbs do instalador roda o node com cwd = AppDir; em dev o cwd é a raiz do
 *  repo. Fallback: sobe a partir deste arquivo até achar o package.json raiz. */
function appDir(): string {
  const looksRight = (d: string) => fs.existsSync(path.join(d, 'package.json')) && fs.existsSync(path.join(d, 'apps', 'server'))
  if (looksRight(process.cwd())) return process.cwd()
  let d = path.dirname(fileURLToPath(import.meta.url))
  for (let i = 0; i < 8; i++) {
    if (looksRight(d)) return d
    d = path.dirname(d)
  }
  return process.cwd()
}

/** Sha instalado: version.json (gravado pelo updater) tem prioridade sobre o
 *  build-info.json (carimbado na raiz quando o instalador é compilado). */
function installedSha(): { sha: string | null; updatedAt: string | null } {
  const root = appDir()
  for (const f of ['version.json', 'build-info.json']) {
    try {
      const j = JSON.parse(fs.readFileSync(path.join(root, f), 'utf8'))
      if (typeof j.sha === 'string' && j.sha) return { sha: j.sha, updatedAt: j.updatedAt || j.builtAt || null }
    } catch { /* próximo */ }
  }
  return { sha: null, updatedAt: null }
}

// Versão do backend em execução — usada pelo site para detectar atualização.
// uptimeSec ajuda a diagnosticar reinícios do watchdog.
systemRouter.get('/version', (_req, res) => {
  const v = installedSha()
  res.json({ ...v, local: config.localMode, uptimeSec: Math.round(process.uptime()) })
})

// Dispara a auto-atualização (somente no app instalado no PC). O script baixa
// o main do GitHub, PARA este processo, copia por cima, rebuilda e religa.
systemRouter.post('/update', requireAuth, (_req, res) => {
  if (!config.localMode) return res.status(400).json({ error: 'Disponível apenas no app instalado no PC' })
  if (process.platform !== 'win32') return res.status(400).json({ error: 'Atualização automática só no Windows' })
  const root = appDir()
  const script = path.join(root, 'scripts', 'update-corte.ps1')
  if (!fs.existsSync(script)) return res.status(500).json({ error: 'Script de atualização não encontrado' })
  // roda uma CÓPIA em %TEMP% — o original será sobrescrito durante o update
  const tmpScript = path.join(os.tmpdir(), `update-corte-${Date.now()}.ps1`)
  fs.copyFileSync(script, tmpScript)
  const child = spawn('powershell.exe', [
    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden',
    '-File', tmpScript, '-AppDir', root, '-ServerPid', String(process.pid),
  ], { detached: true, stdio: 'ignore', windowsHide: true })
  child.unref()
  res.status(202).json({ ok: true, message: 'Atualização iniciada — o backend reinicia sozinho em alguns minutos' })
})
