import { Router } from 'express'
import { z } from 'zod'
import { authAdmin, db } from '../firebase.js'
import { requireAuth, requireAdmin } from '../middleware/auth.js'
import { buildOverview, listUsers, loadUserDetails, roleForUser } from '../services/sessions.js'
import { isAdminEmail } from '../config.js'

export const adminRouter = Router()
adminRouter.use(requireAuth, requireAdmin)

const nowIso = () => new Date().toISOString()

async function audit(req: any, action: string, targetUid: string, extra: Record<string, unknown> = {}) {
  try {
    await db.collection('admin_audit_logs').add({
      action, targetUserId: targetUid,
      performedBy: req.res?.locals?.user?.uid || null,
      performedByEmail: req.res?.locals?.user?.email || null,
      createdAt: nowIso(), ...extra,
    })
  } catch { /* firestore disabled */ }
}

adminRouter.get('/overview', async (_req, res, next) => {
  try { res.json(await buildOverview()) } catch (e) { next(e) }
})

adminRouter.get('/users', async (_req, res, next) => {
  try { res.json({ users: await listUsers() }) } catch (e) { next(e) }
})

adminRouter.get('/users/:uid/details', async (req, res, next) => {
  try { res.json(await loadUserDetails(req.params.uid)) } catch (e) { next(e) }
})

const roleSchema = z.object({ role: z.enum(['support', 'user']) })
adminRouter.post('/users/:uid/role', async (req, res, next) => {
  try {
    const { role } = roleSchema.parse(req.body)
    const target = await authAdmin.getUser(req.params.uid)
    if (isAdminEmail(target.email) || (await roleForUser(target)) === 'admin')
      return res.status(400).json({ error: 'Não é possível alterar o cargo de um admin' })
    const claims = { ...(target.customClaims || {}), role }
    await authAdmin.setCustomUserClaims(target.uid, claims)
    await db.collection('users').doc(target.uid).set({ role, updatedAt: nowIso() }, { merge: true }).catch(() => {})
    await audit(req, 'set_role', target.uid, { newValue: role })
    res.json({ ok: true })
  } catch (e) { next(e) }
})

const banSchema = z.object({
  reason: z.string().max(500).optional(),
  duration: z.enum(['permanent', '1d', '7d', '30d']).default('permanent'),
})
adminRouter.post('/users/:uid/ban', async (req, res, next) => {
  try {
    const { reason, duration } = banSchema.parse(req.body)
    const target = await authAdmin.getUser(req.params.uid)
    if (isAdminEmail(target.email) || (await roleForUser(target)) === 'admin')
      return res.status(400).json({ error: 'Não é possível banir um admin' })
    if (target.uid === res.locals.user!.uid)
      return res.status(400).json({ error: 'Você não pode banir a si mesmo' })
    const days = duration === '1d' ? 1 : duration === '7d' ? 7 : duration === '30d' ? 30 : 0
    const banExpiresAt = days ? new Date(Date.now() + days * 86400_000).toISOString() : null
    await db.collection('users').doc(target.uid).set({
      banned: true, banReason: reason || null, banExpiresAt, bannedAt: nowIso(), updatedAt: nowIso(),
    }, { merge: true })
    await audit(req, 'ban', target.uid, { reason, duration })
    res.json({ ok: true })
  } catch (e) { next(e) }
})

adminRouter.post('/users/:uid/unban', async (req, res, next) => {
  try {
    await db.collection('users').doc(req.params.uid).set(
      { banned: false, banReason: null, banExpiresAt: null, updatedAt: nowIso() }, { merge: true })
    await audit(req, 'unban', req.params.uid)
    res.json({ ok: true })
  } catch (e) { next(e) }
})

adminRouter.post('/users/:uid/suspend', async (req, res, next) => {
  try {
    const target = await authAdmin.getUser(req.params.uid)
    if (target.uid === res.locals.user!.uid) return res.status(400).json({ error: 'Você não pode suspender a si mesmo' })
    if (isAdminEmail(target.email)) return res.status(400).json({ error: 'Não é possível suspender um admin' })
    await authAdmin.updateUser(target.uid, { disabled: true })
    await audit(req, 'suspend', target.uid)
    res.json({ ok: true })
  } catch (e) { next(e) }
})

adminRouter.post('/users/:uid/reactivate', async (req, res, next) => {
  try {
    await authAdmin.updateUser(req.params.uid, { disabled: false })
    await db.collection('users').doc(req.params.uid).set(
      { banned: false, banExpiresAt: null, updatedAt: nowIso() }, { merge: true }).catch(() => {})
    await audit(req, 'reactivate', req.params.uid)
    res.json({ ok: true })
  } catch (e) { next(e) }
})

const noteSchema = z.object({ note: z.string().min(1).max(1000) })
adminRouter.post('/users/:uid/notes', async (req, res, next) => {
  try {
    const { note } = noteSchema.parse(req.body)
    await db.collection('users').doc(req.params.uid).collection('notes').add({
      note, createdBy: res.locals.user!.uid, createdByEmail: res.locals.user!.email, createdAt: nowIso(),
    })
    await audit(req, 'add_note', req.params.uid)
    res.json({ ok: true })
  } catch (e) { next(e) }
})

adminRouter.delete('/users/:uid', async (req, res, next) => {
  try {
    const target = await authAdmin.getUser(req.params.uid)
    if (target.uid === res.locals.user!.uid) return res.status(400).json({ error: 'Você não pode excluir a si mesmo' })
    if (isAdminEmail(target.email) || (await roleForUser(target)) === 'admin')
      return res.status(400).json({ error: 'Não é possível excluir um admin' })
    await authAdmin.deleteUser(target.uid)
    await db.collection('users').doc(target.uid).delete().catch(() => {})
    await audit(req, 'delete_user', target.uid, { targetEmail: target.email })
    res.json({ ok: true })
  } catch (e) { next(e) }
})
