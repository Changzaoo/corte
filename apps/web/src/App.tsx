import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './AuthContext'
import { ContextMenuProvider } from './components/ui'
import { ProtectedRoute, AdminRoute } from './components/ProtectedRoute'
import Layout from './components/Layout'
import LoginPage from './pages/LoginPage'
import TweetTemplatePage from './pages/TweetTemplatePage'
import AdminPage from './pages/admin/AdminPage'
import { PlaceholderPage } from './pages/PlaceholderPage'
import { Plus, Scissors, Radar, Clapperboard } from 'lucide-react'

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
            <Route path="/criar/novo" element={<AppShell><PlaceholderPage title="Novo corte" icon={Plus}
              desc="Envie um vídeo ou cole um link para gerar cortes automaticamente. (Em breve)" /></AppShell>} />
            <Route path="/criar/editor" element={<AppShell><PlaceholderPage title="Editor" icon={Scissors}
              desc="Editor de timeline para ajustar cortes manualmente. (Em breve)" /></AppShell>} />
            <Route path="/criar/foryou" element={<AppShell><PlaceholderPage title="For You" icon={Radar}
              desc="Radar que encontra os reels mais curtidos e monta o template sozinho. (Em breve)" /></AppShell>} />
            <Route path="/criar/estudio" element={<AppShell><PlaceholderPage title="Estúdio" icon={Clapperboard}
              desc="Gere roteiros e vídeos com IA. (Em breve)" /></AppShell>} />

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
