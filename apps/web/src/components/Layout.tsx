import { NavLink, useNavigate } from 'react-router-dom'
import {
  Plus, Scissors, MessageSquare, Radar, Clapperboard, Shield, LogOut, Sparkles,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { useAuth } from '../AuthContext'

const tabs = [
  { to: '/criar/novo', label: 'Novo corte', icon: Plus },
  { to: '/criar/editor', label: 'Editor', icon: Scissors },
  { to: '/criar/template', label: 'Template', icon: MessageSquare },
  { to: '/criar/foryou', label: 'For You', icon: Radar },
  { to: '/criar/estudio', label: 'Estúdio', icon: Clapperboard },
]

export default function Layout({ children }: { children: ReactNode }) {
  const { profile, isAdmin, logout } = useAuth()
  const navigate = useNavigate()

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `relative flex items-center gap-xs px-md py-sm text-sm font-semibold transition-colors ${
      isActive ? 'text-slate-50' : 'text-slate-400 hover:text-slate-200'
    }`

  return (
    <div className="container-app">
      {/* top bar */}
      <header className="shrink-0 border-b border-slate-800 bg-slate-950">
        <div className="flex items-center gap-sm px-lg pt-sm">
          <button onClick={() => navigate('/criar/template')} className="flex items-center gap-xs pr-md">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary-500 text-white">
              <Sparkles className="h-4 w-4" />
            </span>
            <span className="text-base font-bold text-slate-50">Corte</span>
          </button>
          <div className="ml-auto flex items-center gap-sm">
            <span className="hidden text-[11px] text-slate-500 sm:inline">Com IA</span>
            {isAdmin && (
              <NavLink to="/admin" className={({ isActive }) =>
                `flex items-center gap-xs rounded-full border px-md py-xs text-xs font-semibold transition-colors ${
                  isActive ? 'border-primary-500 bg-primary-500/10 text-primary-300'
                  : 'border-slate-700 text-slate-300 hover:bg-slate-100/10'}`}>
                <Shield className="h-3.5 w-3.5" /> Admin
              </NavLink>
            )}
            <div className="flex items-center gap-xs rounded-full border border-slate-800 bg-slate-850 py-[3px] pl-[3px] pr-sm">
              {profile?.photoURL
                ? <img src={profile.photoURL} alt="" className="h-6 w-6 rounded-full object-cover" />
                : <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-500 text-[11px] font-bold text-white">
                    {(profile?.displayName || profile?.email || '?').trim()[0]?.toUpperCase()}
                  </span>}
              <span className="max-w-[130px] truncate text-xs text-slate-300">
                {profile?.displayName || profile?.email}
              </span>
            </div>
            <button onClick={() => logout()} title="Sair"
              className="rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-100/10 hover:text-slate-100">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
        {/* tabs */}
        <nav className="flex items-center gap-xs px-lg">
          {tabs.map((t) => (
            <NavLink key={t.to} to={t.to} className={linkClass}>
              {({ isActive }) => (
                <>
                  <t.icon className="h-4 w-4" /> {t.label}
                  {isActive && <span className="absolute inset-x-2 -bottom-px h-[3px] rounded-full bg-primary-500" />}
                </>
              )}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
    </div>
  )
}
