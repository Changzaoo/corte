import { useEffect, useRef, useState } from 'react'
import { Cpu, Download, Loader2, RefreshCw, X, Cloud } from 'lucide-react'
import { isLocalBackend, recheckBackend } from '../api'

/** Mostra se o app está rodando no PC do usuário (backend local) ou na nuvem,
 *  e oferece o instalador .exe para levar tudo para a máquina dele. */
export default function BackendStatus() {
  const [local, setLocal] = useState<boolean | null>(null)
  const [open, setOpen] = useState(false)
  const [checking, setChecking] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  const probe = async () => {
    setChecking(true)
    await recheckBackend()
    setLocal(isLocalBackend())
    setChecking(false)
  }
  useEffect(() => { void probe() }, [])
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (open && panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  if (local) {
    return (
      <span title="Downloads e renderização rodando no seu computador"
        className="flex items-center gap-xs rounded-full border border-success-500/40 bg-success-500/10 px-md py-xs text-xs font-semibold text-success-300">
        <Cpu className="h-3.5 w-3.5" /> <span className="hidden sm:inline">No seu PC</span>
      </span>
    )
  }

  return (
    <div className="relative" ref={panelRef}>
      <button onClick={() => setOpen(o => !o)} title="Instalar o cortes.digital no seu PC"
        className="flex items-center gap-xs rounded-full border border-primary-500/50 bg-primary-500/10 px-md py-xs text-xs font-semibold text-primary-200 hover:bg-primary-500/20">
        <Download className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Rodar no meu PC</span>
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-[320px] rounded-xl border border-slate-800 bg-slate-950 p-md shadow-xl">
          <div className="mb-sm flex items-center gap-xs">
            <Cloud className="h-4 w-4 text-slate-400" />
            <p className="flex-1 text-xs font-semibold text-slate-200">Hoje rodando na nuvem</p>
            <button onClick={() => setOpen(false)} className="rounded p-1 text-slate-500 hover:text-slate-200"><X className="h-3.5 w-3.5" /></button>
          </div>
          <p className="mb-sm text-[11px] leading-relaxed text-slate-400">
            Instale o cortes.digital no seu computador para os downloads (inclusive Instagram/TikTok
            logados) e a renderização rodarem 100% na sua máquina — sem limite de servidor.
          </p>
          <ol className="mb-sm space-y-xs text-[11px] text-slate-300">
            <li><span className="font-semibold text-slate-100">1.</span> Baixe e execute o instalador (.exe).</li>
            <li><span className="font-semibold text-slate-100">2.</span> Ele instala tudo (Node, yt-dlp, ffmpeg) e liga o cortes.digital no seu PC.</li>
            <li><span className="font-semibold text-slate-100">3.</span> Volte aqui e clique em "Já instalei — testar".</li>
          </ol>
          <a href="/cortes-digital-Setup.exe" download
            className="mb-xs flex items-center justify-center gap-xs rounded-lg bg-primary-500 px-md py-sm text-xs font-semibold text-white hover:bg-primary-600">
            <Download className="h-4 w-4" /> Baixar instalador (.exe)
          </a>
          <div className="flex items-center gap-xs">
            <button onClick={probe} disabled={checking}
              className="flex flex-1 items-center justify-center gap-xs rounded-lg border border-slate-700 px-md py-sm text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-60">
              {checking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Já instalei — testar
            </button>
          </div>
          <p className="mt-sm text-[10px] text-slate-500">
            Prefere sem instalador? Baixe o <a href="/corte-setup.ps1" download className="text-primary-300">script .ps1</a> e rode no PowerShell.
          </p>
        </div>
      )}
    </div>
  )
}
