import { Router } from 'express'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { config } from '../config.js'
import { requireAuth } from '../middleware/auth.js'
import { appDir, installedSha } from '../util/version.js'

export const systemRouter = Router()

// Versão do backend em execução — usada pelo site para detectar atualização.
// uptimeSec ajuda a diagnosticar reinícios do watchdog.
systemRouter.get('/version', (_req, res) => {
  const v = installedSha()
  res.json({ ...v, local: config.localMode, uptimeSec: Math.round(process.uptime()) })
})

/** O watchdog grava um heartbeat a cada ~10s; fresco = ele cuida do update. */
function watchdogAlive(root: string): boolean {
  try {
    const st = fs.statSync(path.join(root, 'watchdog.alive'))
    return Date.now() - st.mtimeMs < 60_000
  } catch { return false }
}

// Dispara a auto-atualização (somente no app instalado no PC). O pedido é POR
// ARQUIVO (update.req): o watchdog (PowerShell) detecta e roda o updater —
// node spawnar powershell oculto é bloqueado pelo Defender como suspeito.
systemRouter.post('/update', requireAuth, (_req, res) => {
  if (!config.localMode) return res.status(400).json({ error: 'Disponível apenas no app instalado no PC' })
  if (process.platform !== 'win32') return res.status(400).json({ error: 'Atualização automática só no Windows' })
  const root = appDir()
  const script = path.join(root, 'scripts', 'update-corte.ps1')
  if (!fs.existsSync(script)) return res.status(500).json({ error: 'Script de atualização não encontrado' })

  // pedido para o watchdog (caminho preferido — imune ao bloqueio do Defender)
  fs.writeFileSync(path.join(root, 'update.req'), new Date().toISOString())

  if (!watchdogAlive(root)) {
    // instalação antiga sem watchdog: tenta o spawn direto (pode ser bloqueado
    // pelo Defender em algumas máquinas — o site tem fallback p/ o instalador)
    try {
      const tmpScript = path.join(os.tmpdir(), `update-corte-${Date.now()}.ps1`)
      fs.copyFileSync(script, tmpScript)
      const child = spawn('powershell.exe', [
        '-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden',
        '-File', tmpScript, '-AppDir', root, '-ServerPid', String(process.pid),
      ], { detached: true, stdio: 'ignore', windowsHide: true })
      child.unref()
    } catch { /* best-effort */ }
  }
  res.status(202).json({ ok: true, message: 'Atualização iniciada — o backend reinicia sozinho em alguns minutos' })
})
