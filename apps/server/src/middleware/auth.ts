import type { Request, Response, NextFunction } from 'express'
import type { UserRecord } from 'firebase-admin/auth'
import { authAdmin, db } from '../firebase.js'
import { config } from '../config.js'
import { roleForUser, type Role } from '../services/sessions.js'

export interface AuthUser { uid: string; email: string | null; role: Role; record: UserRecord }

// Constroi um AuthUser "dono" para o modo local. Se o app mandou um idToken,
// lemos (SEM verificar — e a maquina do proprio dono) o nome/uid/email de
// dentro dele para manter a identidade real; senao usamos um usuario generico.
// IMPORTANTE: usa bearer() (header OU ?token=) — <video src>/<a download> não
// mandam header; sem o ?token= o uid virava 'local' e o dono não batia (404,
// player preto nos resultados).
function localUserFromReq(req: Request): AuthUser {
  const token = bearer(req) || ''
  let uid = 'local', email: string | null = 'local@corte', name = 'Você (local)', photo: string | undefined
  if (token && token.split('.').length === 3) {
    try {
      const p = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString('utf8'))
      uid = p.user_id || p.sub || uid
      email = p.email || email
      name = p.name || email || name
      photo = p.picture || undefined
    } catch { /* token ilegivel — usa generico */ }
  }
  return {
    uid, email, role: 'admin',
    record: {
      uid, email, displayName: name, photoURL: photo,
      disabled: false, emailVerified: true, metadata: { creationTime: '', lastSignInTime: '' },
      providerData: [], toJSON: () => ({}),
    } as unknown as UserRecord,
  }
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
  if (config.localMode) { res.locals.user = localUserFromReq(req); return next() }
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

/** Bloqueia usuarios comuns ainda nao aprovados por um admin. Admin/support e
 *  o modo local passam direto. Aplicado nas rotas de uso (download/render). */
export async function requireApproved(req: Request, res: Response, next: NextFunction) {
  const u = res.locals.user
  if (!u) return res.status(401).json({ error: 'Não autenticado' })
  if (config.localMode || u.role === 'admin' || u.role === 'support') return next()
  try {
    const snap = await db.collection('users').doc(u.uid).get()
    if (snap.exists && snap.data()?.approved === true) return next()
  } catch { /* firestore off → trata como pendente */ }
  return res.status(403).json({ error: 'Sua conta aguarda aprovação de um administrador.', code: 'PENDING_APPROVAL' })
}
