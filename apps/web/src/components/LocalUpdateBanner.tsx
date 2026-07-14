import { useEffect, useRef, useState } from 'react'
import { HardDriveDownload, Loader2, RefreshCw, X } from 'lucide-react'
import { api, isLocalBackend } from '../api'

// último commit que tocou o CÓDIGO DO SERVIDOR (commits só de site/instalador
// não pedem update do backend local). Cache de 10 min p/ respeitar o rate limit.
const SHA_API = 'https://api.github.com/repos/Changzaoo/corte/commits?path=apps%2Fserver&per_page=1&sha=main'
const CACHE_KEY = 'corte-latest-server-sha'
const CACHE_MS = 10 * 60_000

async function latestServerSha(): Promise<string | null> {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null') as { sha: string; at: number } | null
    if (c && Date.now() - c.at < CACHE_MS) return c.sha
  } catch { /* */ }
  try {
    const r = await fetch(SHA_API, { headers: { Accept: 'application/vnd.github+json' } })
    if (!r.ok) return null
    const j = await r.json() as { sha?: string }[]
    const sha = j?.[0]?.sha || null
    if (sha) { try { localStorage.setItem(CACHE_KEY, JSON.stringify({ sha, at: Date.now() })) } catch { /* */ } }
    return sha
  } catch { return null }
}

/** Detecta que o BACKEND LOCAL (instalado no PC) está desatualizado em relação
 *  ao GitHub e oferece a atualização em 1 clique (POST /api/system/update). */
export default function LocalUpdateBanner() {
  const [outdated, setOutdated] = useState(false)
  // instalação ANTIGA: backend local sem a rota /api/system (pré auto-update).
  // Não consegue se atualizar sozinha — precisa rodar o instalador novo.
  const [legacy, setLegacy] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [done, setDone] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const remoteSha = useRef<string | null>(null)

  useEffect(() => {
    let alive = true
    const check = async () => {
      if (!isLocalBackend()) { if (alive) setOutdated(false); return }
      const latest = await latestServerSha()
      try {
        const v = await api.systemVersion()
        if (!alive || !v.local) return
        remoteSha.current = latest
        setLegacy(false)
        // sem carimbo local (instalação antiga) também conta como desatualizado
        setOutdated(!v.sha || (!!latest && v.sha !== latest))
      } catch (e) {
        if (!alive) return
        // erro de REDE = backend caiu no meio (a sonda resolve) — ignora.
        // Resposta de erro (404) = backend antigo sem a rota → desatualizado.
        if (e instanceof TypeError) return
        remoteSha.current = latest
        setLegacy(true)
        setOutdated(true)
      }
    }
    check()
    // a detecção do backend local pode demorar alguns segundos após o load —
    // rechecagens rápidas no começo, depois em ritmo de cruzeiro
    const t1 = window.setTimeout(check, 8_000)
    const t2 = window.setTimeout(check, 30_000)
    const iv = setInterval(check, 3 * 60_000)
    return () => { alive = false; clearTimeout(t1); clearTimeout(t2); clearInterval(iv) }
  }, [])

  const update = async () => {
    setUpdating(true)
    try { await api.systemUpdate() } catch { /* o servidor morre no meio — esperado */ }
    // aguarda o backend voltar com o sha novo (o update leva alguns minutos)
    const t0 = Date.now()
    while (Date.now() - t0 < 8 * 60_000) {
      await new Promise((r) => setTimeout(r, 10_000))
      try {
        const v = await api.systemVersion()
        if (v.local && v.sha && v.sha === remoteSha.current) { setDone(true); setOutdated(false); break }
      } catch { /* reiniciando… continua esperando */ }
    }
    setUpdating(false)
  }

  if (done) {
    return (
      <div className="flex shrink-0 items-center gap-sm border-b border-success-500/40 bg-success-500/10 px-lg py-xs text-xs text-success-200">
        <RefreshCw className="h-4 w-4 shrink-0" />
        <span className="flex-1">Backend local <span className="font-semibold">atualizado com sucesso</span>.</span>
        <button onClick={() => setDone(false)} className="rounded p-1 text-success-200/70 hover:text-success-100"><X className="h-3.5 w-3.5" /></button>
      </div>
    )
  }
  if (!outdated || dismissed) return null
  return (
    <div className="flex shrink-0 items-center gap-sm border-b border-amber-500/40 bg-amber-500/10 px-lg py-xs text-xs text-amber-100">
      <HardDriveDownload className="h-4 w-4 shrink-0 text-amber-300" />
      <span className="flex-1">
        Uma <span className="font-semibold">atualização do app instalado no seu PC</span> está disponível.
        {legacy && <span className="ml-xs text-amber-200/80">Baixe o instalador e execute-o por cima — seus dados são mantidos.</span>}
        {updating && <span className="ml-xs text-amber-200/80">Atualizando — o backend reinicia sozinho, pode levar alguns minutos…</span>}
      </span>
      {legacy ? (
        <a href="/cortes-digital-Setup.exe" download
          className="flex items-center gap-xs rounded-full bg-amber-500 px-md py-xs text-xs font-semibold text-black hover:bg-amber-400">
          <HardDriveDownload className="h-3.5 w-3.5" /> Baixar instalador
        </a>
      ) : (
        <button onClick={update} disabled={updating}
          className="flex items-center gap-xs rounded-full bg-amber-500 px-md py-xs text-xs font-semibold text-black hover:bg-amber-400 disabled:opacity-60">
          {updating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          {updating ? 'Atualizando…' : 'Atualizar agora'}
        </button>
      )}
      {!updating && (
        <button onClick={() => setDismissed(true)} className="rounded p-1 text-amber-200/70 hover:text-amber-100"><X className="h-3.5 w-3.5" /></button>
      )}
    </div>
  )
}
