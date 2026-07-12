import { Navigate, useLocation } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { useAuth } from '../AuthContext'
import type { ReactNode } from 'react'

function FullScreenLoader() {
  return (
    <div className="flex h-screen w-full items-center justify-center bg-slate-950">
      <Loader2 className="h-8 w-8 animate-spin text-primary-400" />
    </div>
  )
}

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return <FullScreenLoader />
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />
  return <>{children}</>
}

export function AdminRoute({ children }: { children: ReactNode }) {
  const { user, loading, isAdmin } = useAuth()
  if (loading) return <FullScreenLoader />
  if (!user) return <Navigate to="/login" replace />
  if (!isAdmin) return <Navigate to="/criar/template" replace />
  return <>{children}</>
}
