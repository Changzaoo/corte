import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Mail, Lock, User, AlertCircle } from 'lucide-react'
import { useAuth } from '../AuthContext'
import { Button } from '../components/ui'

const GoogleIcon = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
    <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z" />
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
  </svg>
)

export default function LoginPage() {
  const { login, register, loginGoogle, resetPassword } = useAuth()
  const navigate = useNavigate()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const mapErr = (e: unknown): string => {
    const code = (e as { code?: string })?.code || ''
    if (code.includes('invalid-credential') || code.includes('wrong-password')) return 'E-mail ou senha incorretos.'
    if (code.includes('user-not-found')) return 'Usuário não encontrado.'
    if (code.includes('email-already-in-use')) return 'Este e-mail já está cadastrado.'
    if (code.includes('weak-password')) return 'A senha precisa ter ao menos 6 caracteres.'
    if (code.includes('invalid-email')) return 'E-mail inválido.'
    if (code.includes('too-many-requests')) return 'Muitas tentativas. Tente novamente em instantes.'
    if (code.includes('popup-closed')) return 'Login com Google cancelado.'
    return (e as Error)?.message || 'Falha na autenticação.'
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null); setInfo(null); setBusy(true)
    try {
      if (mode === 'login') await login(email.trim(), password)
      else await register(email.trim(), password, name.trim())
      navigate('/criar/template', { replace: true })
    } catch (err) { setError(mapErr(err)) }
    finally { setBusy(false) }
  }

  const google = async () => {
    setError(null); setBusy(true)
    try { await loginGoogle(); navigate('/criar/template', { replace: true }) }
    catch (err) { setError(mapErr(err)) }
    finally { setBusy(false) }
  }

  const forgot = async () => {
    if (!email.trim()) { setError('Digite seu e-mail para redefinir a senha.'); return }
    setError(null)
    try { await resetPassword(email.trim()); setInfo('Enviamos um e-mail para redefinir sua senha.') }
    catch (err) { setError(mapErr(err)) }
  }

  return (
    <div className="flex h-screen w-full items-center justify-center bg-slate-950 px-lg">
      <div className="w-full max-w-[400px]">
        <div className="mb-xl flex flex-col items-center gap-sm text-center">
          <img src="/logo-mark.png" alt="" className="h-16 w-16 rounded-2xl" />
          <h1 className="text-2xl font-bold text-slate-50">cortes.digital</h1>
          <p className="text-sm text-slate-400">
            {mode === 'login' ? 'Entre para montar seus cortes no template do X.' : 'Crie sua conta para começar.'}
          </p>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-sm rounded-2xl border border-slate-800 bg-slate-925 p-lg">
          {mode === 'register' && (
            <label className="flex items-center gap-sm rounded-lg border border-slate-700 bg-slate-900 px-md focus-within:border-primary-500">
              <User className="h-4 w-4 shrink-0 text-slate-500" />
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome"
                className="min-w-0 flex-1 bg-transparent py-sm text-sm text-slate-100 outline-none placeholder:text-slate-500" />
            </label>
          )}
          <label className="flex items-center gap-sm rounded-lg border border-slate-700 bg-slate-900 px-md focus-within:border-primary-500">
            <Mail className="h-4 w-4 shrink-0 text-slate-500" />
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="E-mail" autoComplete="email"
              className="min-w-0 flex-1 bg-transparent py-sm text-sm text-slate-100 outline-none placeholder:text-slate-500" />
          </label>
          <label className="flex items-center gap-sm rounded-lg border border-slate-700 bg-slate-900 px-md focus-within:border-primary-500">
            <Lock className="h-4 w-4 shrink-0 text-slate-500" />
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Senha"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              className="min-w-0 flex-1 bg-transparent py-sm text-sm text-slate-100 outline-none placeholder:text-slate-500" />
          </label>

          {error && (
            <div className="flex items-center gap-xs rounded-lg border border-error-500/40 bg-error-500/10 px-md py-sm text-xs text-error-200">
              <AlertCircle className="h-4 w-4 shrink-0" /> {error}
            </div>
          )}
          {info && (
            <div className="rounded-lg border border-success-500/40 bg-success-500/10 px-md py-sm text-xs text-success-200">{info}</div>
          )}

          <Button type="submit" isLoading={busy} className="mt-xs w-full">
            {mode === 'login' ? 'Entrar' : 'Criar conta'}
          </Button>

          <div className="my-xs flex items-center gap-sm text-[11px] text-slate-600">
            <span className="h-px flex-1 bg-slate-800" /> ou <span className="h-px flex-1 bg-slate-800" />
          </div>

          <button type="button" onClick={google} disabled={busy}
            className="flex w-full items-center justify-center gap-sm rounded-full border border-slate-600 py-sm text-sm font-semibold text-slate-100 transition-colors hover:bg-slate-100/10 disabled:opacity-40">
            <GoogleIcon /> Continuar com Google
          </button>

          {mode === 'login' && (
            <button type="button" onClick={forgot} className="mt-xs text-center text-xs text-slate-500 hover:text-slate-300">
              Esqueci minha senha
            </button>
          )}
        </form>

        <p className="mt-lg text-center text-sm text-slate-400">
          {mode === 'login' ? 'Não tem conta?' : 'Já tem conta?'}{' '}
          <button onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(null); setInfo(null) }}
            className="font-semibold text-primary-400 hover:text-primary-300">
            {mode === 'login' ? 'Cadastre-se' : 'Entrar'}
          </button>
        </p>
      </div>
    </div>
  )
}
