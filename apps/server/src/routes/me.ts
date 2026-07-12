import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { recordLogin, touchDevice, loadUserDetails, isApproved } from '../services/sessions.js'
import { config } from '../config.js'

export const meRouter = Router()

meRouter.use(requireAuth)

meRouter.get('/', async (_req, res) => {
  const u = res.locals.user!
  const r = u.record
  // passive device last-seen update (throttled)
  void touchDevice(_req, r)
  const approved = config.localMode ? true : await isApproved({ uid: u.uid, role: u.role })
  res.json({
    uid: r.uid, email: r.email || null, displayName: r.displayName || null,
    photoURL: r.photoURL || null, role: u.role, approved,
    banned: false, disabled: !!r.disabled,
    createdAt: r.metadata.creationTime || null, lastLoginAt: r.metadata.lastSignInTime || null,
  })
})

// Explicit "I just logged in" beacon → records a login event with IP/OS/geo.
meRouter.post('/session', async (req, res) => {
  const u = res.locals.user!
  const method = typeof req.body?.method === 'string' ? req.body.method : 'session'
  await recordLogin(req, u.record, { method, success: true })
  res.status(204).end()
})

meRouter.get('/sessions', async (_req, res) => {
  const u = res.locals.user!
  const details = await loadUserDetails(u.uid)
  res.json({ devices: details.devices, loginEvents: details.loginEvents })
})
