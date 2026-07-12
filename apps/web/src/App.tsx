import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './AuthContext'
import { ContextMenuProvider } from './components/ui'
import { ProtectedRoute, AdminRoute } from './components/ProtectedRoute'
import Layout from './components/Layout'
import LoginPage from './pages/LoginPage'
import TweetTemplatePage from './pages/TweetTemplatePage'
import AdminPage from './pages/admin/AdminPage'

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

            <Route path="/criar/template" element={<AppShell><TweetTemplatePage /></AppShell>} />

            <Route path="/admin" element={
              <AdminRoute><Layout><AdminPage /></Layout></AdminRoute>
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
