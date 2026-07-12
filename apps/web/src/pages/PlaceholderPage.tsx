import type { LucideIcon } from 'lucide-react'

export function PlaceholderPage({ title, desc, icon: Icon }: {
  title: string; desc: string; icon: LucideIcon
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-md px-lg text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-2xl border border-slate-800 bg-slate-850 text-primary-400">
        <Icon className="h-7 w-7" />
      </span>
      <h2 className="text-xl font-bold text-slate-100">{title}</h2>
      <p className="max-w-sm text-sm text-slate-400">{desc}</p>
    </div>
  )
}
