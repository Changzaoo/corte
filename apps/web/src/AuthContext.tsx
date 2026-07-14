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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<MeProfile | null>(null)
  const [loading, setLoading] = useState(true)

  const loadProfile = async () => {
    try { setProfile(await api.getMe()) }
    catch { setProfile(null) }
  }

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u)
      if (u) { await loadProfile(); initNetSpeed() }
      else setProfile(null)
      setLoading(false)
    })
    return unsub
  }, [])

  // fire-and-forget login beacon → backend records IP/OS/geo login event
  const beacon = (method: string) => { void api.recordLogin(method).catch(() => {}) }

  const login = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password)
    await loadProfile(); beacon('password')
  }
  const register = async (email: string, password: string, name: string) => {
    const cred = await createUserWithEmailAndPassword(auth, email, password)
    if (name) await updateProfile(cred.user, { displayName: name })
    await loadProfile(); beacon('register')
  }
  const loginGoogle = async () => {
    await signInWithPopup(auth, googleProvider)
    await loadProfile(); beacon('google')
  }
  const logout = async () => { await signOut(auth); setProfile(null) }
  const resetPassword = (email: string) => sendPasswordResetEmail(auth, email)

  const value: AuthState = {
    user, profile, loading,
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
