import React, { createContext, useCallback, useContext, useState, type ReactNode, type KeyboardEvent } from 'react'
import { Loader2, X, CheckCircle2, AlertCircle } from 'lucide-react'

// ---------------------------------------------------------------------------
// Button — X-style pill button (variant + size + loading)
// ---------------------------------------------------------------------------
type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
type ButtonSize = 'sm' | 'md' | 'lg'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  isLoading?: boolean
  children: React.ReactNode
}

export function Button({
  variant = 'primary', size = 'md', isLoading = false,
  className = '', disabled = false, children, ...props
}: ButtonProps) {
  const base = 'inline-flex items-center justify-center font-bold rounded-full transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-950 disabled:opacity-40 disabled:cursor-not-allowed'
  const variants = {
    primary: 'bg-primary-500 text-white hover:bg-primary-600 focus:ring-primary-500',
    secondary: 'bg-transparent text-slate-100 border border-slate-600 hover:bg-slate-100/10 focus:ring-slate-500',
    ghost: 'text-slate-300 hover:bg-slate-100/10 hover:text-slate-100 focus:ring-slate-600',
    danger: 'bg-error-600 text-white hover:bg-error-500 focus:ring-error-500',
  }
  const sizes = {
    sm: 'px-md py-xs text-sm gap-xs',
    md: 'px-lg py-sm text-base gap-sm',
    lg: 'px-xl py-md text-base gap-md',
  }
  return (
    <button className={`${base} ${variants[variant]} ${sizes[size]} ${className}`} disabled={disabled || isLoading} {...props}>
      {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
      {children}
    </button>
  )
}

// ---------------------------------------------------------------------------
// ClearableInput — text input that keeps pasted text with a quick clear "X"
// ---------------------------------------------------------------------------
export function ClearableInput({
  value, onChange, onClear, onKeyDown, placeholder, icon, className = '', autoFocus, type = 'text',
}: {
  value: string
  onChange: (v: string) => void
  onClear?: () => void
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void
  placeholder?: string
  icon?: ReactNode
  className?: string
  autoFocus?: boolean
  type?: string
}) {
  return (
    <div className={`flex items-center gap-xs rounded-lg border border-slate-700 bg-slate-900 px-md transition-colors focus-within:border-primary-500 ${className}`}>
      {icon}
      <input
        type={type} value={value} onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown} placeholder={placeholder} autoFocus={autoFocus}
        className="min-w-0 flex-1 bg-transparent py-sm text-sm text-slate-100 outline-none placeholder:text-slate-500"
      />
      {value && (
        <button type="button" onMouseDown={(e) => e.preventDefault()}
          onClick={() => (onClear ? onClear() : onChange(''))} title="Limpar" aria-label="Limpar"
          className="shrink-0 rounded-full p-0.5 text-slate-500 transition-colors hover:bg-slate-700 hover:text-slate-100">
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Toast / context-menu provider — minimal replacement for the down app's
// useContextMenu(); the Template page only uses toast().
// ---------------------------------------------------------------------------
type ToastKind = 'info' | 'success' | 'error'
interface ToastItem { id: number; text: string; kind: ToastKind }
interface ContextMenuValue { toast: (text: string, kind?: ToastKind) => void }

const ContextMenuContext = createContext<ContextMenuValue | null>(null)

export function ContextMenuProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const toast = useCallback((text: string, kind: ToastKind = 'info') => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t, { id, text, kind }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3800)
  }, [])
  return (
    <ContextMenuContext.Provider value={{ toast }}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex flex-col gap-sm">
        {toasts.map((t) => (
          <div key={t.id}
            className={`pointer-events-auto flex items-center gap-sm rounded-lg border px-md py-sm text-sm shadow-lg animate-fadeInUp ${
              t.kind === 'error' ? 'border-error-500/40 bg-error-500/10 text-error-200'
              : t.kind === 'success' ? 'border-success-500/40 bg-success-500/10 text-success-200'
              : 'border-slate-700 bg-slate-850 text-slate-100'}`}>
            {t.kind === 'error' ? <AlertCircle className="h-4 w-4 shrink-0" />
              : t.kind === 'success' ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : null}
            {t.text}
          </div>
        ))}
      </div>
    </ContextMenuContext.Provider>
  )
}

export function useContextMenu(): ContextMenuValue {
  const ctx = useContext(ContextMenuContext)
  if (!ctx) return { toast: () => {} }
  return ctx
}
