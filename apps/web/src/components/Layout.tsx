import { NavLink, useNavigate } from 'react-router-dom'
import { Shield, LogOut } from 'lucide-react'
import type { ReactNode } from 'react'
import { useAuth } from '../AuthContext'
import BackendStatus from './BackendStatus'
import InstagramConnect from './InstagramConnect'
import UpdateBanner from './UpdateBanner'
import LocalUpdateBanner from './LocalUpdateBanner'

export default function Layout({ children }: { children: ReactNode }) {
  const { profile, isAdmin, logout } = useAuth()
  const navigate = useNavigate()

  return (
    <div className="container-app mx-auto w-full max-w-[560px] border-x border-slate-850 bg-slate-950 sm:max-w-[720px] lg:max-w-none">
      <UpdateBanner />
      <LocalUpdateBanner />
      {/* app bar */}
      <header className="sticky top-0 z-20 shrink-0 border-b border-slate-850 bg-slate-950/80 backdrop-blur-md">
        <div className="flex items-center gap-sm px-md py-sm sm:px-lg">
          {/* brand */}
          <button onClick={() => navigate('/criar/template')} className="flex items-center gap-xs">
            <img src="/logo-mark.png?v=2" alt="" className="h-9 w-9 rounded-lg" />
            <span className="text-lg font-bold text-slate-50">cortes.digital</span>
          </button>

          {/* right cluster */}
          <div className="ml-auto flex items-center gap-xs sm:gap-sm">
            <BackendStatus />
            <InstagramConnect />
            {isAdmin && (
              <NavLink to="/admin" title="Painel de administração" className={({ isActive }) =>
                `flex items-center gap-xs rounded-full border px-md py-xs text-xs font-semibold transition-colors ${
                  isActive ? 'border-primary-500 bg-primary-500/10 text-primary-300'
                  : 'border-slate-800 text-slate-300 hover:bg-slate-100/10'}`}>
                <Shield className="h-3.5 w-3.5" /> Admin
              </NavLink>
            )}
            <div className="flex items-center gap-xs rounded-full border border-slate-850 bg-slate-850 py-[3px] pl-[3px] pr-xs sm:pr-sm">
              {profile?.photoURL
                ? <img src={profile.photoURL} alt="" referrerPolicy="no-referrer" className="h-7 w-7 rounded-full object-cover" />
                : <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary-500 text-xs font-bold text-white">
                    {(profile?.displayName || profile?.email || '?').trim()[0]?.toUpperCase()}
                  </span>}
              <span className="hidden max-w-[130px] truncate text-xs text-slate-300 sm:inline">
                {profile?.displayName || profile?.email}
              </span>
            </div>
            <button onClick={() => logout()} title="Sair"
              className="flex h-9 w-9 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100/10 hover:text-slate-100">
              <LogOut className="h-[18px] w-[18px]" />
            </button>
          </div>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
    </div>
  )
}
