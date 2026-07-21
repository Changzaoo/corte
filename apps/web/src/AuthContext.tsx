import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import {
  onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  signInWithPopup, signOut, updateProfile, sendPasswordResetEmail,
  type User,
} from 'firebase/auth'
import { auth, googleProvider } from './firebase'
import { api, type MeProfile } from './api'
import { initNetSpeed } from './netspeed'

interface AuthState {
  user: User | null
  profile: MeProfile | null
  loading: boolean
  profileLoading: boolean
  isAdmin: boolean
  approved: boolean
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string, name: string) => Promise<void>
  loginGoogle: () => Promise<void>
  logout: () => Promise<void>
  resetPassword: (email: string) => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

// Perfil em cache (stale-while-revalidate): o /api/me mora na NUVEM e o Render
// free hiberna — esperar ele acordar (30-60s) travava o site inteiro num
// spinner. Renderizamos JÁ com o perfil da última sessão e atualizamos por
// trás; quem manda de verdade é o servidor (toda rota revalida o token).
const ME_CACHE = 'vc-me-cache'
function readCachedProfile(uid: string): MeProfile | null {
  try {
    const c = JSON.parse(localStorage.getItem(ME_CACHE) || 'null') as MeProfile | null
    return c && c.uid === uid ? c : null
  } catch { return null }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<MeProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [profileLoading, setProfileLoading] = useState(true)

  const loadProfile = async () => {
    setProfileLoading(true)
    try {
      const p = await api.getMe()
      setProfile(p)
      try { localStorage.setItem(ME_CACHE, JSON.stringify(p)) } catch { /* full */ }
    } catch {
      // nuvem fria/fora do ar: mantém o cache — a UI segue e o servidor é quem
      // valida de verdade (banimento/aprovação são aplicados em toda rota)
    } finally { setProfileLoading(false) }
  }

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u)
      if (u) {
        const cached = readCachedProfile(u.uid)
        if (cached) setProfile(cached)
        setLoading(false)          // NÃO espera a nuvem — o app abre já
        void loadProfile()         // revalida em background
        initNetSpeed()
      } else {
        setProfile(null); setLoading(false); setProfileLoading(false)
        try { localStorage.removeItem(ME_CACHE) } catch { /* */ }
      }
    })
    return unsub
  }, [])

  // fire-and-forget login beacon → backend records IP/OS/geo login event
  const beacon = (method: string) => { void api.recordLogin(method).catch(() => {}) }

  const login = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password)
    void loadProfile(); beacon('password')
  }
  const register = async (email: string, password: string, name: string) => {
    const cred = await createUserWithEmailAndPassword(auth, email, password)
    if (name) await updateProfile(cred.user, { displayName: name })
    void loadProfile(); beacon('register')
  }
  const loginGoogle = async () => {
    await signInWithPopup(auth, googleProvider)
    void loadProfile(); beacon('google')
  }
  const logout = async () => {
    await signOut(auth); setProfile(null)
    try { localStorage.removeItem(ME_CACHE) } catch { /* */ }
  }
  const resetPassword = (email: string) => sendPasswordResetEmail(auth, email)

  const value: AuthState = {
    user, profile, loading, profileLoading,
    isAdmin: profile?.role === 'admin',
    approved: profile?.role === 'admin' || profile?.role === 'support' || profile?.approved === true,
    login, register, loginGoogle, logout, resetPassword, refreshProfile: loadProfile,
  }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
