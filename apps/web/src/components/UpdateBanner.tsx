import { useEffect, useRef, useState } from 'react'
import { RefreshCw, Sparkles, X } from 'lucide-react'

/** Detecta que uma NOVA versão foi publicada (o hash do bundle principal mudou
 *  no index.html servido) e mostra um aviso para recarregar. */
export default function UpdateBanner() {
  const [update, setUpdate] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const current = useRef<string | null>(null)

  useEffect(() => {
    const scripts = Array.from(document.querySelectorAll('script[type="module"]'))
    current.current = scripts.map((s) => s.getAttribute('src') || '').find((s) => /\/assets\/index-.*\.js/.test(s)) || null
    if (!current.current) return // dev (sem hash) — nada a checar

    const check = async () => {
      try {
        const html = await fetch(`/index.html?_=${Date.now()}`, { cache: 'no-store' }).then((r) => r.text())
        const m = html.match(/src="(\/assets\/index-[^"]+\.js)"/)
        if (m && current.current && m[1] !== current.current) setUpdate(true)
      } catch { /* offline — ignora */ }
    }
    check()
    const iv = setInterval(check, 60_000)
    return () => clearInterval(iv)
  }, [])

  if (!update || dismissed) return null
  return (
    <div className="flex shrink-0 items-center gap-sm border-b border-primary-500/40 bg-primary-500/10 px-lg py-xs text-xs text-primary-100">
      <Sparkles className="h-4 w-4 shrink-0 text-primary-300" />
      <span className="flex-1">Uma <span className="font-semibold">nova atualização</span> do cortes.digital está disponível.</span>
      <button onClick={() => location.reload()}
        className="flex items-center gap-xs rounded-full bg-primary-500 px-md py-xs text-xs font-semibold text-white hover:bg-primary-600">
        <RefreshCw className="h-3.5 w-3.5" /> Recarregar
      </button>
      <button onClick={() => setDismissed(true)} className="rounded p-1 text-primary-200/70 hover:text-primary-100"><X className="h-3.5 w-3.5" /></button>
    </div>
  )
}
