import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { AuthProvider } from './AuthContext'
import { ContextMenuProvider } from './components/ui'
import { ProtectedRoute, AdminRoute } from './components/ProtectedRoute'
import Layout from './components/Layout'
import RequireLocalBackend from './components/RequireLocalBackend'
import LoginPage from './pages/LoginPage'
import TweetTemplatePage from './pages/TweetTemplatePage'

// fora do bundle principal: o painel só é baixado por quem abre /admin
const AdminPage = lazy(() => import('./pages/admin/AdminPage'))

function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <Layout>{children}</Layout>
    </ProtectedRoute>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ContextMenuProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />

            <Route path="/criar/template" element={<AppShell><RequireLocalBackend><TweetTemplatePage /></RequireLocalBackend></AppShell>} />

            <Route path="/admin" element={
              <AdminRoute><Layout>
                <Suspense fallback={<div className="flex h-full items-center justify-center py-xl"><Loader2 className="h-6 w-6 animate-spin text-primary-400" /></div>}>
                  <AdminPage />
                </Suspense>
              </Layout></AdminRoute>
            } />

            <Route path="/" element={<Navigate to="/criar/template" replace />} />
            <Route path="/criar" element={<Navigate to="/criar/template" replace />} />
            <Route path="*" element={<Navigate to="/criar/template" replace />} />
          </Routes>
        </ContextMenuProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
