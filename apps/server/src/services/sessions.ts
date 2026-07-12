import type { Request } from 'express'
import type { UserRecord } from 'firebase-admin/auth'
import { db, authAdmin } from '../firebase.js'
import { config, isAdminEmail } from '../config.js'
import { clientIp, parseAgent, deviceIdFromReq, geolocate } from '../util/tracking.js'

export type Role = 'admin' | 'support' | 'user'

const nowIso = () => new Date().toISOString()

/** Resolve a user's role: bootstrap admin emails/uid, then custom claims,
 *  then a Firestore role field. Admin can never be self-granted from client. */
export async function roleForUser(user: UserRecord): Promise<Role> {
  if (isAdminEmail(user.email) || (config.adminUid && user.uid === config.adminUid)) return 'admin'
  const claimRole = (user.customClaims?.role as string | undefined) || undefined
  if (claimRole === 'admin') return 'admin'
  if (claimRole === 'support') return 'support'
  try {
    const snap = await db.collection('users').doc(user.uid).get()
    const r = snap.exists ? (snap.data()?.role as string | undefined) : undefined
    if (r === 'admin' || r === 'support') return r
  } catch { /* firestore may be disabled */ }
  return 'user'
}

/** Record an explicit login event + upsert the device. Best-effort: never
 *  throws (auth must not break if Firestore is unavailable). */
export async function recordLogin(
  req: Request, user: UserRecord, opts: { method: string; success?: boolean; failureReason?: string | null },
): Promise<void> {
  try {
    const ip = clientIp(req)
    const ua = req.get('user-agent') || ''
    const { os, browser, deviceType } = parseAgent(ua)
    const { hash, name } = deviceIdFromReq(req)
    const geo = await geolocate(req, ip)
    const success = opts.success !== false

    // detect "new device" → suspicious
    let suspicious = false
    if (hash) {
      try {
        const dref = db.collection('users').doc(user.uid).collection('devices').doc(hash)
        const dsnap = await dref.get()
        suspicious = !dsnap.exists
        const prev = dsnap.exists ? (dsnap.data() as any) : null
        const recentIps: string[] = Array.from(new Set([ip, ...(prev?.recentIps || [])])).slice(0, 8)
        await dref.set({
          name: name || prev?.name || deviceType, ip, os, browser, deviceType,
          location: geo.location, city: geo.city, country: geo.country, userAgent: ua,
          createdAt: prev?.createdAt || nowIso(), lastSeenAt: nowIso(),
          loginCount: (prev?.loginCount || 0) + (success ? 1 : 0), recentIps,
        }, { merge: true })
      } catch { /* ignore */ }
    }

    await db.collection('user_login_events').add({
      userId: user.uid, email: user.email || null, loginAt: nowIso(), ip, os, browser, deviceType,
      city: geo.city, region: geo.region, country: geo.country, location: geo.location,
      userAgent: ua, method: opts.method, success, failureReason: opts.failureReason || null,
      suspicious, deviceHash: hash, deviceName: name,
    })

    if (success) {
      const uref = db.collection('users').doc(user.uid)
      const usnap = await uref.get()
      await uref.set({
        email: user.email || null, displayName: user.displayName || null,
        photoURL: user.photoURL || null,
        lastLoginAt: nowIso(), lastIp: ip, lastOs: os, lastBrowser: browser,
        loginCount: ((usnap.exists ? usnap.data()?.loginCount : 0) || 0) + 1,
        createdAt: usnap.exists ? usnap.data()?.createdAt || nowIso() : nowIso(),
        updatedAt: nowIso(),
      }, { merge: true })
    }
  } catch (e) {
    console.warn('[sessions] recordLogin failed:', (e as Error).message)
  }
}

/** Record a render/"corte" event: how many cuts, which profile, and the
 *  source links used. Best-effort (Firestore). Also bumps a cheap per-user
 *  counter so the users list can show totals without scanning events. */
export async function recordRenderEvent(
  user: { uid: string; email: string | null },
  data: { jobId: number; count: number; profileName: string; profileHandle: string; sources: string[] },
): Promise<void> {
  if (data.count <= 0) return
  try {
    await db.collection('render_events').add({
      userId: user.uid, email: user.email || null, at: nowIso(),
      jobId: data.jobId, count: data.count,
      profileName: data.profileName || null, profileHandle: data.profileHandle || null,
      sources: data.sources || [],
    })
    const uref = db.collection('users').doc(user.uid)
    const usnap = await uref.get()
    await uref.set({
      email: user.email || null,
      cutsTotal: ((usnap.exists ? usnap.data()?.cutsTotal : 0) || 0) + data.count,
      rendersTotal: ((usnap.exists ? usnap.data()?.rendersTotal : 0) || 0) + 1,
      lastRenderAt: nowIso(),
    }, { merge: true })
  } catch (e) {
    console.warn('[sessions] recordRenderEvent failed:', (e as Error).message)
  }
}

/** Aggregate a user's render history: total cuts, per-profile usage and the
 *  source links they've pulled from. */
export async function loadRenderStats(uid: string) {
  const events: any[] = []
  try {
    const snap = await db.collection('render_events').where('userId', '==', uid).limit(1000).get()
    snap.forEach((d) => events.push(d.data()))
  } catch { /* firestore disabled */ }
  events.sort((a, b) => (b.at || '').localeCompare(a.at || ''))

  let totalCuts = 0
  const profileMap = new Map<string, { name: string; handle: string; count: number }>()
  const sourceMap = new Map<string, number>()
  for (const e of events) {
    totalCuts += e.count || 0
    const key = (e.profileHandle || e.profileName || '—').toLowerCase()
    const prev = profileMap.get(key) || { name: e.profileName || '', handle: e.profileHandle || '', count: 0 }
    prev.count += e.count || 0
    profileMap.set(key, prev)
    for (const s of (e.sources || [])) if (s) sourceMap.set(s, (sourceMap.get(s) || 0) + 1)
  }
  return {
    totalCuts, renders: events.length,
    profilesUsed: [...profileMap.values()].sort((a, b) => b.count - a.count),
    sources: [...sourceMap.entries()].map(([url, count]) => ({ url, count })).sort((a, b) => b.count - a.count),
    recent: events.slice(0, 30).map((e) => ({
      at: e.at, count: e.count || 0, profileName: e.profileName || '', profileHandle: e.profileHandle || '',
      sources: e.sources || [],
    })),
  }
}

/** Passive device "last seen" upsert (throttled ~5min) on authed requests. */
export async function touchDevice(req: Request, user: UserRecord): Promise<void> {
  try {
    const { hash, name } = deviceIdFromReq(req)
    if (!hash) return
    const dref = db.collection('users').doc(user.uid).collection('devices').doc(hash)
    const dsnap = await dref.get()
    const prev = dsnap.exists ? (dsnap.data() as any) : null
    if (prev?.lastSeenAt && Date.now() - new Date(prev.lastSeenAt).getTime() < 5 * 60_000) return
    const ip = clientIp(req)
    const { os, browser, deviceType } = parseAgent(req.get('user-agent') || '')
    await dref.set({
      name: name || prev?.name || deviceType, ip, os, browser, deviceType,
      lastSeenAt: nowIso(), createdAt: prev?.createdAt || nowIso(),
      loginCount: prev?.loginCount || 0,
      recentIps: Array.from(new Set([ip, ...(prev?.recentIps || [])])).slice(0, 8),
    }, { merge: true })
  } catch { /* ignore */ }
}

// ---- admin reads -----------------------------------------------------------
export interface AdminUserRow {
  uid: string; email: string | null; displayName: string | null; photoURL: string | null
  role: Role; banned: boolean; disabled: boolean; createdAt: string | null; lastLoginAt: string | null
  lastIp: string | null; lastOs: string | null; lastBrowser: string | null; loginCount: number
  cutsTotal: number
}

export async function listUsers(): Promise<AdminUserRow[]> {
  const rows: AdminUserRow[] = []
  // pull Firestore summaries in one shot (best-effort)
  const summaries = new Map<string, any>()
  try {
    const snap = await db.collection('users').get()
    snap.forEach((d) => summaries.set(d.id, d.data()))
  } catch { /* firestore disabled */ }

  let pageToken: string | undefined
  do {
    const page = await authAdmin.listUsers(1000, pageToken)
    for (const u of page.users) {
      const s = summaries.get(u.uid) || {}
      rows.push({
        uid: u.uid, email: u.email || null, displayName: u.displayName || s.displayName || null,
        photoURL: u.photoURL || s.photoURL || null,
        role: await roleForUser(u),
        banned: !!s.banned, disabled: !!u.disabled,
        createdAt: u.metadata.creationTime || s.createdAt || null,
        lastLoginAt: u.metadata.lastSignInTime || s.lastLoginAt || null,
        lastIp: s.lastIp || null, lastOs: s.lastOs || null, lastBrowser: s.lastBrowser || null,
        loginCount: s.loginCount || 0, cutsTotal: s.cutsTotal || 0,
      })
    }
    pageToken = page.pageToken
  } while (pageToken)

  rows.sort((a, b) => (b.lastLoginAt || '').localeCompare(a.lastLoginAt || ''))
  return rows
}

export async function loadUserDetails(uid: string) {
  const u = await authAdmin.getUser(uid)
  let summary: any = {}
  try { const s = await db.collection('users').doc(uid).get(); summary = s.exists ? s.data() : {} } catch { /* */ }
  const role = await roleForUser(u)

  const loginEvents: any[] = []
  try {
    // equality-only query (no orderBy) avoids needing a composite index;
    // we sort newest-first in memory.
    const snap = await db.collection('user_login_events').where('userId', '==', uid).limit(400).get()
    snap.forEach((d) => loginEvents.push({ id: d.id, ...d.data() }))
    loginEvents.sort((a, b) => (b.loginAt || '').localeCompare(a.loginAt || ''))
    loginEvents.length = Math.min(loginEvents.length, 200)
  } catch { /* firestore disabled */ }

  const devices: any[] = []
  try {
    const snap = await db.collection('users').doc(uid).collection('devices').orderBy('lastSeenAt', 'desc').get()
    snap.forEach((d) => devices.push({ id: d.id, ...d.data() }))
  } catch { /* */ }

  const notes: any[] = []
  try {
    const snap = await db.collection('users').doc(uid).collection('notes').orderBy('createdAt', 'desc').get()
    snap.forEach((d) => notes.push({ id: d.id, ...d.data() }))
  } catch { /* */ }

  const renderStats = await loadRenderStats(uid)

  return {
    user: {
      uid: u.uid, email: u.email || null, displayName: u.displayName || summary.displayName || null,
      photoURL: u.photoURL || summary.photoURL || null, role,
      banned: !!summary.banned, disabled: !!u.disabled,
      createdAt: u.metadata.creationTime || null, lastLoginAt: u.metadata.lastSignInTime || summary.lastLoginAt || null,
      lastIp: summary.lastIp || null, lastOs: summary.lastOs || null, lastBrowser: summary.lastBrowser || null,
      loginCount: summary.loginCount || 0,
    },
    loginEvents: loginEvents.map((e) => ({
      id: e.id, loginAt: e.loginAt, ip: e.ip, os: e.os, browser: e.browser, deviceType: e.deviceType,
      city: e.city, region: e.region, country: e.country, location: e.location,
      userAgent: e.userAgent, method: e.method, success: e.success !== false,
      failureReason: e.failureReason, suspicious: e.suspicious,
    })),
    devices: devices.map((d) => ({
      id: d.id, name: d.name, ip: d.ip, os: d.os, browser: d.browser, deviceType: d.deviceType,
      location: d.location, city: d.city, country: d.country, userAgent: d.userAgent,
      createdAt: d.createdAt, lastSeenAt: d.lastSeenAt, loginCount: d.loginCount || 0,
      recentIps: d.recentIps || [], trusted: (d.loginCount || 0) > 1, suspicious: (d.loginCount || 0) <= 1,
    })),
    notes: notes.map((n) => ({ id: n.id, note: n.note, createdByEmail: n.createdByEmail, createdAt: n.createdAt })),
    renderStats,
  }
}

export async function buildOverview() {
  const users = await listUsers()
  const dayAgo = Date.now() - 24 * 3600_000

  const recentLogins: any[] = []
  let logins24h = 0, failed24h = 0
  const osCount = new Map<string, number>()
  const byDay = new Map<string, number>()
  try {
    const snap = await db.collection('user_login_events').orderBy('loginAt', 'desc').limit(500).get()
    snap.forEach((d) => {
      const e = d.data()
      const t = new Date(e.loginAt).getTime()
      if (recentLogins.length < 40) recentLogins.push({
        id: d.id, loginAt: e.loginAt, ip: e.ip, os: e.os, browser: e.browser, deviceType: e.deviceType,
        location: e.location, country: e.country, success: e.success !== false,
      })
      if (t >= dayAgo) { if (e.success !== false) logins24h++; else failed24h++ }
      if (e.success !== false) {
        osCount.set(e.os || '—', (osCount.get(e.os || '—') || 0) + 1)
        const day = (e.loginAt || '').slice(0, 10)
        if (day) byDay.set(day, (byDay.get(day) || 0) + 1)
      }
    })
  } catch { /* firestore disabled */ }

  // If no login events yet, seed the OS chart from user summaries.
  if (osCount.size === 0) users.forEach((u) => { if (u.lastOs) osCount.set(u.lastOs, (osCount.get(u.lastOs) || 0) + 1) })

  let activeDevices = 0
  try {
    const snap = await db.collectionGroup('devices').get()
    activeDevices = snap.size
  } catch { /* */ }

  const usersByOs = [...osCount.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 8)
  const last7 = [...Array(7)].map((_, i) => {
    const d = new Date(Date.now() - (6 - i) * 86400_000).toISOString().slice(0, 10)
    return { date: d, count: byDay.get(d) || 0 }
  })

  return {
    stats: {
      totalUsers: users.length,
      admins: users.filter((u) => u.role === 'admin').length,
      bannedUsers: users.filter((u) => u.banned).length,
      logins24h, failedLogins24h: failed24h, activeDevices,
      totalCuts: users.reduce((sum, u) => sum + (u.cutsTotal || 0), 0),
    },
    recentLogins, usersByOs, loginsByDay: last7,
  }
}
