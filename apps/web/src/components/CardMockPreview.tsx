import { BadgeCheck, Play } from 'lucide-react'

/** Preview AO VIVO do card (mock em CSS) — reflete perfil, tema e cor de fundo
 *  imediatamente, antes de adicionar um vídeo (o preview real precisa do vídeo). */
export default function CardMockPreview({
  bg, cardTheme, name, handle, verified, avatar, caption, hook,
}: {
  bg: string; cardTheme: 'light' | 'dark'
  name: string; handle: string; verified: boolean
  avatar: string | null; caption: string; hook: string
}) {
  const bgStyle = bg === 'blur'
    ? { background: 'radial-gradient(120% 120% at 30% 20%, #1d3a5f 0%, #0a0a0a 60%)' }
    : { background: bg }
  const light = cardTheme !== 'dark'
  const cardBg = light ? '#ffffff' : '#16181c'
  const nameCol = light ? '#0f1419' : '#e7e9ea'
  const capCol = light ? '#0f1419' : '#e7e9ea'
  const initial = (name.trim()[0] || '?').toUpperCase()

  return (
    <div className="relative aspect-[9/16] w-full overflow-hidden" style={bgStyle}>
      {hook.trim() && (
        <div className="absolute inset-x-0 top-0 z-10 bg-[#1d9bf0] px-2 py-[6px] text-center text-[11px] font-extrabold uppercase tracking-wide text-white">
          {hook.trim().slice(0, 40)}
        </div>
      )}
      <div className="absolute inset-0 flex items-center justify-center p-3">
        <div className="w-full rounded-2xl p-3 shadow-lg" style={{ background: cardBg }}>
          <div className="flex items-center gap-2">
            {avatar
              ? <img src={avatar} alt="" referrerPolicy="no-referrer" className="h-9 w-9 rounded-full object-cover" />
              : <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#1d9bf0] text-sm font-bold text-white">{initial}</span>}
            <div className="min-w-0">
              <div className="flex items-center gap-1 text-[13px] font-bold leading-tight" style={{ color: nameCol }}>
                <span className="truncate">{name.trim() || 'Usuário'}</span>
                {verified && <BadgeCheck className="h-3.5 w-3.5 shrink-0 fill-[#1d9bf0] text-white" />}
              </div>
              <div className="truncate text-[11px] text-[#536471]">@{handle.trim() || 'usuario'}</div>
            </div>
          </div>
          {caption.trim() && (
            <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-[11px] leading-snug" style={{ color: capCol }}>{caption.trim()}</p>
          )}
          <div className="mt-2 flex aspect-[4/5] w-full items-center justify-center rounded-xl bg-black/85 text-[10px] text-slate-500">
            <span className="flex flex-col items-center gap-1"><Play className="h-5 w-5" /> seu vídeo aqui</span>
          </div>
        </div>
      </div>
      <div className="absolute inset-x-0 bottom-0 bg-black/40 px-2 py-1 text-center text-[9px] text-slate-300">prévia do estilo — o vídeo real entra ao adicionar</div>
    </div>
  )
}
