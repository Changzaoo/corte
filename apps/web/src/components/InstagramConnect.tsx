import { useEffect, useRef, useState } from 'react'
import { Instagram, CheckCircle2, Loader2 } from 'lucide-react'
import { api, isLocalBackend, recheckBackend } from '../api'

/** Botão "Conectar Instagram": abre o navegador para o login e copia os cookies
 *  para a aplicação (só faz sentido com o backend local, no PC do usuário). */
export default function InstagramConnect() {
  const [local, setLocal] = useState(false)
  const [connected, setConnected] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [msg, setMsg] = useState('')
  const pollRef = useRef<number | null>(null)

  const refresh = async () => {
    try {
      const s = await api.instagramStatus()
      setConnected(s.connected); setConnecting(s.connecting)
      if (s.message) setMsg(s.message)
      return s
    } catch { return null }
  }

  useEffect(() => {
    (async () => { await recheckBackend(); setLocal(isLocalBackend()); if (isLocalBackend()) void refresh() })()
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [])

  const connect = async () => {
    setConnecting(true); setMsg('Abrindo o navegador — faça login no Instagram…')
    try { await api.instagramConnect() } catch (e) { setMsg(e instanceof Error ? e.message : 'Falha'); setConnecting(false); return }
    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = window.setInterval(async () => {
      const s = await refresh()
      if (s && (!s.connecting || s.connected)) {
        if (pollRef.current) clearInterval(pollRef.current)
        setConnecting(false)
      }
    }, 2000)
  }

  if (!local) return null

  if (connected && !connecting) {
    return (
      <span title={msg || 'Cookies do Instagram salvos'}
        className="flex items-center gap-xs rounded-lg border border-success-500/40 bg-success-500/10 px-md py-xs text-xs font-semibold text-success-300">
        <CheckCircle2 className="h-3.5 w-3.5" /> Instagram conectado
      </span>
    )
  }

  return (
    <div className="flex items-center gap-xs">
      <button onClick={connect} disabled={connecting}
        className="flex items-center gap-xs rounded-lg border border-pink-500/50 bg-gradient-to-r from-fuchsia-500/15 to-amber-500/15 px-md py-xs text-xs font-semibold text-pink-200 hover:from-fuchsia-500/25 hover:to-amber-500/25 disabled:opacity-70">
        {connecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Instagram className="h-3.5 w-3.5" />}
        {connecting ? 'Aguardando login…' : 'Conectar Instagram'}
      </button>
      {connecting && msg && <span className="text-[10px] text-slate-400">{msg}</span>}
    </div>
  )
}
