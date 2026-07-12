import type { Request, Response, NextFunction } from 'express'
import type { UserRecord } from 'firebase-admin/auth'
import { authAdmin, db } from '../firebase.js'
import { config } from '../config.js'
import { roleForUser, type Role } from '../services/sessions.js'

export interface AuthUser { uid: string; email: string | null; role: Role; record: UserRecord }

// Usuario sintetico quando o backend roda na maquina do proprio dono (LOCAL_MODE).
const LOCAL_USER: AuthUser = {
  uid: 'local', email: 'local@corte', role: 'admin',
  record: {
    uid: 'local', email: 'local@corte', displayName: 'Você (local)', photoURL: undefined,
    disabled: false, emailVerified: true, metadata: { creationTime: '', lastSignInTime: '' },
    providerData: [], toJSON: () => ({}),
  } as unknown as UserRecord,
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Locals { user?: AuthUser }
  }
}

function bearer(req: Request): string | null {
  const h = req.get('authorization') || ''
  if (h.startsWith('Bearer ')) return h.slice(7).trim()
  // Fallback for media loaded via <video src>/<a href> (browsers can't send
  // an Authorization header on those): accept the idToken as a query param.
  const q = req.query?.token
  if (typeof q === 'string' && q) return q.trim()
  return null
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  // Modo local: o dono roda tudo na propria maquina — sem Firebase.
  if (config.localMode) { res.locals.user = LOCAL_USER; return next() }
  const token = bearer(req)
  if (!token) return res.status(401).json({ error: 'Não autenticado' })
  try {
    const decoded = await authAdmin.verifyIdToken(token)
    const record = await authAdmin.getUser(decoded.uid)
    if (record.disabled) return res.status(403).json({ error: 'Conta suspensa' })
    // ban check (best-effort Firestore)
    try {
      const snap = await db.collection('users').doc(record.uid).get()
      if (snap.exists && snap.data()?.banned) {
        const exp = snap.data()?.banExpiresAt
        if (!exp || new Date(exp).getTime() > Date.now()) {
          return res.status(403).json({ error: 'Conta banida' })
        }
      }
    } catch { /* firestore disabled — skip ban check */ }
    const role = await roleForUser(record)
    res.locals.user = { uid: record.uid, email: record.email || null, role, record }
    next()
  } catch (e) {
    return res.status(401).json({ error: 'Token inválido ou expirado' })
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const u = res.locals.user
  if (!u) return res.status(401).json({ error: 'Não autenticado' })
  if (u.role !== 'admin') return res.status(403).json({ error: 'Acesso restrito a administradores' })
  next()
}
