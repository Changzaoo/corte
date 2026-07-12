import { useEffect, useState, type ReactNode } from 'react'
import { Download, Loader2, RefreshCw, ShieldAlert } from 'lucide-react'
import { isLocalBackend, recheckBackend } from '../api'

/** Exige que o app do cortes.digital esteja INSTALADO e rodando no PC. Sem ele,
 *  mostra a tela de instalação obrigatória (não deixa usar pela nuvem). */
export default function RequireLocalBackend({ children }: { children: ReactNode }) {
  const [state, setState] = useState<'checking' | 'ok' | 'missing'>('checking')
  const [checking, setChecking] = useState(false)

  const check = async () => {
    setChecking(true)
    await recheckBackend()
    setState(isLocalBackend() ? 'ok' : 'missing')
    setChecking(false)
  }
  useEffect(() => {
    void check()
    // detecção praticamente em tempo real: verifica de forma silenciosa
    const iv = setInterval(async () => { await recheckBackend(); setState(isLocalBackend() ? 'ok' : 'missing') }, 1500)
    return () => clearInterval(iv)
  }, [])

  if (state === 'checking') {
    return <div className="flex h-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary-400" /></div>
  }
  if (state === 'ok') return <>{children}</>

  return (
    <div className="flex h-full items-center justify-center overflow-y-auto bg-black px-lg py-xl">
      <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-925 p-xl text-center">
        <img src="/logo-mark.png?v=2" alt="" className="mx-auto mb-md h-16 w-16 rounded-2xl" />
        <h2 className="text-xl font-bold text-slate-50">Instale o cortes.digital no seu PC</h2>
        <p className="mt-sm text-sm text-slate-400">
          Para usar o app, o programa precisa estar <span className="font-semibold text-slate-200">instalado e rodando no seu computador</span>.
          É nele que os downloads (inclusive Instagram) e a renderização acontecem — rápido e sem limite de servidor.
        </p>

        <ol className="mx-auto mt-lg max-w-sm space-y-sm text-left text-xs text-slate-300">
          <li className="flex gap-sm"><span className="font-bold text-primary-400">1.</span> Baixe e execute o instalador (.exe).</li>
          <li className="flex gap-sm"><span className="font-bold text-primary-400">2.</span> Ele instala tudo (Node, yt-dlp, ffmpeg) e liga o cortes.digital no seu PC.</li>
          <li className="flex gap-sm"><span className="font-bold text-primary-400">3.</span> Esta tela some sozinha assim que detectarmos o app rodando.</li>
        </ol>

        <a href="/cortes-digital-Setup.exe" download
          className="mt-lg flex items-center justify-center gap-xs rounded-xl bg-primary-500 px-lg py-md text-sm font-semibold text-white hover:bg-primary-600">
          <Download className="h-5 w-5" /> Baixar instalador (.exe)
        </a>
        <button onClick={check} disabled={checking}
          className="mt-sm flex w-full items-center justify-center gap-xs rounded-xl border border-slate-700 px-lg py-sm text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-60">
          {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Já instalei — verificar
        </button>

        <div className="mt-lg flex items-start gap-xs rounded-lg border border-slate-800 bg-slate-900/60 px-sm py-xs text-left text-[11px] text-slate-500">
          <ShieldAlert className="mt-[1px] h-3.5 w-3.5 shrink-0 text-amber-400" />
          <span>Se o Windows mostrar "app não reconhecido", clique em <span className="text-slate-300">Mais informações → Executar assim mesmo</span>.</span>
        </div>
      </div>
    </div>
  )
}
