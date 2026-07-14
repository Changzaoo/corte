import { useEffect, useState } from 'react'
import { HardDriveDownload, X } from 'lucide-react'
import { api, isLocalBackend } from '../api'

/** O app instalado se atualiza SOZINHO (autoupdate no backend + watchdog) —
 *  nenhum aviso é necessário. A única exceção é uma instalação ANTIGA, de
 *  antes do sistema de update (sem a rota /api/system): essa não tem como se
 *  atualizar e precisa do instalador novo uma única vez. */
export default function LocalUpdateBanner() {
  const [legacy, setLegacy] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    let alive = true
    const check = async () => {
      if (!isLocalBackend()) { if (alive) setLegacy(false); return }
      try {
        const v = await api.systemVersion()
        if (!alive) return
        // respondeu = instalação moderna → auto-update cuida de tudo, sem banner
        if (v.local) setLegacy(false)
      } catch (e) {
        if (!alive) return
        // erro de REDE = backend caiu (a sonda resolve) — ignora.
        // Resposta de erro (404) = instalação antiga sem auto-update.
        if (!(e instanceof TypeError)) setLegacy(true)
      }
    }
    check()
    const t1 = window.setTimeout(check, 10_000)
    const iv = setInterval(check, 5 * 60_000)
    return () => { alive = false; clearTimeout(t1); clearInterval(iv) }
  }, [])

  if (!legacy || dismissed) return null
  return (
    <div className="flex shrink-0 items-center gap-sm border-b border-amber-500/40 bg-amber-500/10 px-lg py-xs text-xs text-amber-100">
      <HardDriveDownload className="h-4 w-4 shrink-0 text-amber-300" />
      <span className="flex-1">
        Seu app instalado é de uma versão antiga e não se atualiza sozinho.
        <span className="ml-xs text-amber-200/80">Baixe o instalador e execute-o por cima (uma única vez) — seus dados são mantidos e as próximas atualizações serão automáticas.</span>
      </span>
      <a href="/cortes-digital-Setup.exe" download
        className="flex items-center gap-xs rounded-full bg-amber-500 px-md py-xs text-xs font-semibold text-black hover:bg-amber-400">
        <HardDriveDownload className="h-3.5 w-3.5" /> Baixar instalador
      </a>
      <button onClick={() => setDismissed(true)} className="rounded p-1 text-amber-200/70 hover:text-amber-100"><X className="h-3.5 w-3.5" /></button>
    </div>
  )
}
