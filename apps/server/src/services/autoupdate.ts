// Auto-atualização do app instalado no PC: uma vez baixado, ele se mantém
// atualizado SOZINHO — sem baixar o instalador de novo e sem clique do usuário.
// O backend compara o sha instalado com o último commit que tocou apps/server
// no GitHub; se está atrás E o app está OCIOSO (nenhum render/download em
// andamento — o update reinicia o backend), grava o update.req que o watchdog
// já processa (baixa só o código, rebuilda e religa).
import fs from 'node:fs'
import path from 'node:path'
import { config } from '../config.js'
import { jobs, videos } from '../store.js'
import { appDir, installedSha } from '../util/version.js'

const SHA_API = 'https://api.github.com/repos/Changzaoo/corte/commits?path=apps%2Fserver&per_page=1&sha=main'
const BOOT_DELAY_MS = 2 * 60_000     // primeira checagem 2min após subir
const CHECK_MS = 4 * 3600_000        // depois a cada 4h

/** Ocioso = nenhum job ativo e nenhum download de vídeo pela metade. */
function isIdle(): boolean {
  for (const j of jobs.values())
    if (j.status === 'pending' || j.status === 'processing' || j.status === 'rendering') return false
  for (const v of videos.values())
    if (!v.ready && !v.error) return false
  return true
}

async function latestServerSha(): Promise<string | null> {
  try {
    const r = await fetch(SHA_API, {
      headers: { 'User-Agent': 'cortes-digital-autoupdate', Accept: 'application/vnd.github+json' },
    })
    if (!r.ok) return null
    const j = await r.json() as { sha?: string }[]
    return j?.[0]?.sha || null
  } catch { return null }
}

async function checkOnce(): Promise<void> {
  try {
    const root = appDir()
    // update já pedido/em andamento → não repete
    if (fs.existsSync(path.join(root, 'update.lock')) || fs.existsSync(path.join(root, 'update.req'))) return
    if (!isIdle()) return
    const latest = await latestServerSha()
    if (!latest) return
    const cur = installedSha().sha
    if (cur && cur === latest) return
    if (!isIdle()) return   // rechecagem — algo pode ter começado durante a API
    fs.writeFileSync(path.join(root, 'update.req'), new Date().toISOString())
    console.log(`[autoupdate] versão nova ${latest.slice(0, 7)} (instalada: ${cur ? cur.slice(0, 7) : '?'}) — atualização solicitada ao watchdog`)
  } catch { /* melhor esforço — tenta de novo no próximo ciclo */ }
}

export function startAutoUpdate(): void {
  if (!config.localMode || process.platform !== 'win32') return
  if (process.env.AUTO_UPDATE === '0') return   // opt-out
  setTimeout(() => void checkOnce(), BOOT_DELAY_MS).unref()
  setInterval(() => void checkOnce(), CHECK_MS).unref()
  console.log('[autoupdate] ativo — checa a cada 4h (AUTO_UPDATE=0 desativa)')
}
