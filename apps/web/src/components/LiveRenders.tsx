import { Loader2 } from 'lucide-react'

/** Simplified live-render panel. The full down app streams frame-by-frame
 *  ffmpeg output; here we show a lightweight "rendering" placeholder while a
 *  job is in progress. Kept as a component so the Template page API matches. */
export default function LiveRendersPanel({ emptyText = 'Preparando…' }: {
  filter?: string
  large?: boolean
  emptyText?: string
}) {
  return (
    <div className="flex aspect-[9/16] w-full flex-col items-center justify-center gap-sm rounded-xl border border-slate-800 bg-[#0a0a0a] text-slate-500">
      <Loader2 className="h-8 w-8 animate-spin text-primary-400" />
      <p className="text-xs">{emptyText}</p>
    </div>
  )
}
