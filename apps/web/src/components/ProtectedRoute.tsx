import { Navigate, useLocation } from 'react-router-dom'
import { Loader2, Clock, LogOut, RefreshCw } from 'lucide-react'
import { useAuth } from '../AuthContext'
import type { ReactNode } from 'react'

function FullScreenLoader() {
  return (
    <div className="flex h-screen w-full items-center justify-center bg-slate-950">
      <Loader2 className="h-8 w-8 animate-spin text-primary-400" />
    </div>
  )
}

function PendingApproval() {
  const { profile, logout, refreshProfile } = useAuth()
  return (
    <div className="flex h-screen w-full items-center justify-center bg-slate-950 px-lg">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-925 p-xl text-center">
        <span className="mx-auto mb-md flex h-14 w-14 items-center justify-center rounded-full bg-warning-500/10 text-warning-300">
          <Clock className="h-7 w-7" />
        </span>
        <h2 className="text-xl font-bold text-slate-50">Conta aguardando aprovação</h2>
        <p className="mt-sm text-sm text-slate-400">
          Seu acesso a <span className="font-semibold text-slate-200">{profile?.email}</span> foi criado, mas precisa
          ser liberado por um administrador antes de você usar o Corte.
        </p>
        <p className="mt-xs text-xs text-slate-500">Assim que for aprovado, é só atualizar esta página.</p>
        <div className="mt-lg flex items-center justify-center gap-sm">
          <button onClick={() => refreshProfile()}
            className="flex items-center gap-xs rounded-lg border border-slate-700 px-md py-sm text-sm text-slate-200 hover:bg-slate-800">
            <RefreshCw className="h-4 w-4" /> Verificar de novo
          </button>
          <button onClick={() => logout()}
            className="flex items-center gap-xs rounded-lg bg-slate-800 px-md py-sm text-sm text-slate-200 hover:bg-slate-700">
            <LogOut className="h-4 w-4" /> Sair
          </button>
        </div>
      </div>
    </div>
  )
}

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading, profile, approved } = useAuth()
  const location = useLocation()
  if (loading) return <FullScreenLoader />
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />
  // conta criada mas ainda nao liberada pelo admin
  if (profile && !approved) return <PendingApproval />
  return <>{children}</>
}

export function AdminRoute({ children }: { children: ReactNode }) {
  const { user, loading, isAdmin } = useAuth()
  if (loading) return <FullScreenLoader />
  if (!user) return <Navigate to="/login" replace />
  if (!isAdmin) return <Navigate to="/criar/template" replace />
  return <>{children}</>
}
