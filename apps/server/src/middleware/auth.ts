import type { Request, Response, NextFunction } from 'express'
import type { UserRecord } from 'firebase-admin/auth'
import { authAdmin, db } from '../firebase.js'
import { roleForUser, type Role } from '../services/sessions.js'

export interface AuthUser { uid: string; email: string | null; role: Role; record: UserRecord }

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Locals { user?: AuthUser }
  }
}

function bearer(req: Request): string | null {
  const h = req.get('authorization') || ''
  return h.startsWith('Bearer ') ? h.slice(7).trim() : null
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
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
