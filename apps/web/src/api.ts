import { auth } from './firebase'
import { getDeviceId, getDeviceName } from './device'

// Base da API. Se o backend local (instalado no PC do usuário) estiver de pé,
// tudo passa a rodar nele — download, render e entrega no próprio computador.
const CLOUD_API = (import.meta.env.VITE_API_URL as string) || 'http://localhost:4000'
const LOCAL_API = 'http://localhost:4000'
const cloudIsLocal = CLOUD_API === LOCAL_API

// Estado ÚNICO e compartilhado (evita corrida entre componentes que checavam o
// backend em paralelo e discordavam — header dizia "No seu PC" e o gate pedia
// instalar). Uma sonda por vez, com throttle.
// Detecção GRUDENTA e PERSISTENTE: uma vez que o backend local é detectado, ele
// não volta pra nuvem por uma falha isolada da sonda (chamar http://localhost de
// um site https é intermitente). Só desiste após várias falhas seguidas. O estado
// fica salvo, então na volta já começa local (sem chamar o Render por engano).
const LS_KEY = 'cortes-backend-local'
const savedLocal = (() => { try { return localStorage.getItem(LS_KEY) === '1' } catch { return false } })()
let localUp = cloudIsLocal || savedLocal
let apiBase = localUp ? LOCAL_API : CLOUD_API
let failCount = 0
let lastProbe = 0
let probing: Promise<void> | null = null

async function probeLocal(): Promise<void> {
  if (cloudIsLocal) { localUp = true; apiBase = LOCAL_API; return }
  let ok = false
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 2500)
    const r = await fetch(`${LOCAL_API}/health`, { signal: ctrl.signal, cache: 'no-store' })
    clearTimeout(t)
    const j = r.ok ? await r.json().catch(() => ({} as { app?: string })) : {}
    ok = (j as { app?: string })?.app === 'cortes.digital'
  } catch { ok = false }
  if (ok) {
    failCount = 0; localUp = true
    try { localStorage.setItem(LS_KEY, '1') } catch { /* */ }
  } else {
    failCount += 1
    if (failCount >= 3) { localUp = false; try { localStorage.removeItem(LS_KEY) } catch { /* */ } }
  }
  apiBase = localUp ? LOCAL_API : CLOUD_API
}

async function resolveBase(): Promise<string> {
  const now = Date.now()
  if (!probing && now - lastProbe > 3000) { lastProbe = now; probing = probeLocal().finally(() => { probing = null }) }
  // se já sabemos que é local (persistido), não bloqueia a request esperando a sonda
  if (probing && !localUp) await probing
  return apiBase
}
const API_URL = () => apiBase
/** true quando o app está rodando contra o backend instalado no PC. */
export const isLocalBackend = () => localUp && !cloudIsLocal
/** Re-testa o backend local AGORA (ex.: após instalar). */
export const recheckBackend = async () => { lastProbe = 0; await resolveBase(); return isLocalBackend() }

// Roteamento duplo: login/admin SEMPRE na nuvem (é lá que está o Firestore com
// os dados de usuários/analytics). O resto (download/render/entrega) roda no
// backend local quando ele existe. Sem isso, o admin dá 500 no backend local
// (que não tem credenciais do Firebase).
const CLOUD_ONLY = ['/api/admin', '/api/me']
const isCloudOnly = (p: string) => CLOUD_ONLY.some((c) => p.startsWith(c))
async function baseFor(path: string): Promise<string> {
  if (isCloudOnly(path)) return CLOUD_API
  return resolveBase()
}

// ---- shared types (subset of the down app + admin) -------------------------
export interface PreparedVideo { video_id: number; stream_url: string; ready: boolean; title: string }
export interface VideoInfo {
  id: number; title: string; source_url: string | null; ready: boolean
  duration: number; error?: string | null; stream_url: string
}
export interface JobStatus {
  id: number; category: string
  status: 'pending' | 'processing' | 'rendering' | 'done' | 'failed'
  progress: number; error_message: string | null; stage_detail?: string | null
  created_at: string; updated_at: string
}
export interface Clip {
  id: number; job_id: number; video_id: number | null; title: string | null
  file_path: string | null; category: string | null; topic_label?: string
  created_at: string
}
export interface ProfileVideo {
  id: string | null; url: string; title: string | null; thumbnail: string | null
  duration: number | null; video_url?: string | null
}
export interface ProfileVideos { profile: string; count: number; videos: ProfileVideo[] }

// ---- admin types -----------------------------------------------------------
export type Role = 'admin' | 'support' | 'user'
export interface MeProfile {
  uid: string; email: string | null; displayName: string | null
  photoURL: string | null; role: Role; banned: boolean; disabled: boolean
  createdAt: string | null; lastLoginAt: string | null; approved: boolean
}
export interface LoginEvent {
  id: string; loginAt: string; ip: string; os: string; browser: string
  deviceType: string; city: string | null; region: string | null; country: string | null
  location: string | null; userAgent: string; method: string; success: boolean
  failureReason?: string | null; suspicious?: boolean
}
export interface DeviceRecord {
  id: string; name: string; ip: string; os: string; browser: string; deviceType: string
  location: string | null; city: string | null; country: string | null
  userAgent: string; createdAt: string; lastSeenAt: string; loginCount: number
  recentIps: string[]; trusted: boolean; suspicious: boolean; current?: boolean
}
export interface AdminUser {
  uid: string; email: string | null; displayName: string | null; photoURL: string | null
  role: Role; banned: boolean; disabled: boolean; createdAt: string | null
  lastLoginAt: string | null; lastIp: string | null; lastOs: string | null
  lastBrowser: string | null; loginCount: number; cutsTotal: number; approved: boolean
}
export interface AdminOverview {
  stats: {
    totalUsers: number; admins: number; bannedUsers: number
    logins24h: number; failedLogins24h: number; activeDevices: number; totalCuts: number
  }
  recentLogins: LoginEvent[]
  usersByOs: { name: string; count: number }[]
  loginsByDay: { date: string; count: number }[]
  activityByHour: { hour: number; cuts: number; sessions: number }[]
  peakHourByUse: number | null
  peakHourByCuts: number | null
}
export interface RenderStats {
  totalCuts: number; renders: number
  profilesUsed: { name: string; handle: string; count: number }[]
  sources: { url: string; count: number }[]
  recent: { at: string; count: number; profileName: string; profileHandle: string; sources: string[] }[]
  activity: {
    byHour: { hour: number; cuts: number; sessions: number }[]
    byDay: { date: string; cuts: number; sessions: number }[]
    activeDays: number; logins: number
    peakHourByCuts: number | null; peakHourByUse: number | null
    firstAt: string | null; lastAt: string | null
  }
}
export interface AdminUserDetails {
  user: AdminUser; loginEvents: LoginEvent[]; devices: DeviceRecord[]
  notes: { id: string; note: string; createdByEmail: string | null; createdAt: string }[]
  renderStats: RenderStats
}

// ---- request helper: attaches Firebase idToken + device headers ------------
async function authHeaders(): Promise<Record<string, string>> {
  const h: Record<string, string> = {
    'X-Corte-Device-ID': getDeviceId(),
    'X-Corte-Device-Name': getDeviceName(),
  }
  try {
    const token = await auth.currentUser?.getIdToken()
    if (token) h.Authorization = `Bearer ${token}`
  } catch { /* not signed in yet */ }
  return h
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const base = await baseFor(path)
  const headers = await authHeaders()
  headers['Content-Type'] = 'application/json'
  const res = await fetch(`${base}${path}`, {
    method, headers, body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const e = await res.json().catch(() => ({ detail: 'Erro' }))
    throw new Error(e.detail || e.error || `HTTP ${res.status}`)
  }
  if (res.status === 204) return undefined as unknown as T
  return res.json()
}

async function upload<T>(path: string, fd: FormData): Promise<T> {
  const base = await baseFor(path)
  const headers = await authHeaders()
  const res = await fetch(`${base}${path}`, { method: 'POST', headers, body: fd })
  if (!res.ok) {
    const e = await res.json().catch(() => ({ detail: 'Erro' }))
    throw new Error(e.detail || `HTTP ${res.status}`)
  }
  return res.json()
}

export const api = {
  base: API_URL,

  // ---- account / me --------------------------------------------------------
  getMe: () => request<MeProfile>('GET', '/api/me'),
  getMySessions: () => request<{ devices: DeviceRecord[]; loginEvents: LoginEvent[] }>('GET', '/api/me/sessions'),
  recordLogin: (method: string) => request<void>('POST', '/api/me/session', { method }),

  // ---- admin ---------------------------------------------------------------
  adminOverview: () => request<AdminOverview>('GET', '/api/admin/overview'),
  adminListUsers: (q = '') => request<{ users: AdminUser[] }>('GET', `/api/admin/users${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  adminUserDetails: (uid: string) => request<AdminUserDetails>('GET', `/api/admin/users/${uid}/details`),
  adminSetRole: (uid: string, role: Role) => request<{ ok: boolean }>('POST', `/api/admin/users/${uid}/role`, { role }),
  adminBan: (uid: string, reason: string, duration: 'permanent' | '1d' | '7d' | '30d') =>
    request<{ ok: boolean }>('POST', `/api/admin/users/${uid}/ban`, { reason, duration }),
  adminApprove: (uid: string) => request<{ ok: boolean }>('POST', `/api/admin/users/${uid}/approve`),
  adminUnapprove: (uid: string) => request<{ ok: boolean }>('POST', `/api/admin/users/${uid}/unapprove`),
  adminUnban: (uid: string) => request<{ ok: boolean }>('POST', `/api/admin/users/${uid}/unban`),
  adminSuspend: (uid: string) => request<{ ok: boolean }>('POST', `/api/admin/users/${uid}/suspend`),
  adminReactivate: (uid: string) => request<{ ok: boolean }>('POST', `/api/admin/users/${uid}/reactivate`),
  adminDelete: (uid: string) => request<{ ok: boolean }>('DELETE', `/api/admin/users/${uid}`),
  adminAddNote: (uid: string, note: string) => request<{ ok: boolean }>('POST', `/api/admin/users/${uid}/notes`, { note }),

  // ---- videos (shared) -----------------------------------------------------
  prepareVideo: (data: { file?: File; source_url?: string; direct_url?: string; title?: string }) => {
    const fd = new FormData()
    if (data.file) fd.append('file', data.file)
    if (data.source_url) fd.append('source_url', data.source_url)
    if (data.direct_url) fd.append('direct_url', data.direct_url)
    if (data.title) fd.append('title', data.title)
    return upload<PreparedVideo>('/api/videos/prepare', fd)
  },
  getVideoInfo: (id: number) => request<VideoInfo>('GET', `/api/videos/${id}`),
  streamUrl: (id: number, token?: string) =>
    `${API_URL()}/api/videos/${id}/stream${token ? `?token=${encodeURIComponent(token)}` : ''}`,
  listProfileVideos: (url: string) => request<ProfileVideos>('POST', '/api/downloader/list', { url }),
  instagramStatus: () => request<{ connected: boolean; count: number; connecting: boolean; message: string }>('GET', '/api/downloader/instagram/status'),
  instagramConnect: () => request<{ started: boolean; message: string }>('POST', '/api/downloader/instagram/connect'),

  // current Firebase idToken — needed to authenticate media loaded via
  // <video src>/<a href> (which can't carry an Authorization header).
  authToken: async (): Promise<string | null> => {
    try { return (await auth.currentUser?.getIdToken()) || null } catch { return null }
  },

  // ---- jobs / clips --------------------------------------------------------
  getJob: (id: number) => request<JobStatus>('GET', `/api/jobs/${id}`),
  listClips: (jobId: number) => request<Clip[]>('GET', `/api/clips?job_id=${jobId}`),
  downloadClip: (id: number, token?: string) =>
    `${API_URL()}/api/clips/${id}/download${token ? `?token=${encodeURIComponent(token)}` : ''}`,
  openClipsFolder: () => request<{ ok: boolean; folder: string }>('POST', '/api/clips/open-folder'),
  clipsLibrary: () => request<{ folder: string; count: number; items: { name: string; size: number; mtime: number }[] }>('GET', '/api/clips/library'),
  clipFileUrl: (name: string, token?: string) =>
    `${API_URL()}/api/clips/file/${encodeURIComponent(name)}${token ? `?token=${encodeURIComponent(token)}` : ''}`,
  downloadAllUrl: (jobId: number, token?: string, ids?: number[]) => {
    const qs = new URLSearchParams({ job_id: String(jobId) })
    if (ids && ids.length) qs.set('ids', ids.join(','))
    if (token) qs.set('token', token)
    return `${API_URL()}/api/clips/download-all?${qs.toString()}`
  },

  // ---- tweet template ------------------------------------------------------
  tweetUploadAvatar: (file: File) => {
    const fd = new FormData()
    fd.append('file', file)
    return upload<{ avatar_id: string }>('/api/tweet/avatar', fd)
  },
  tweetAvatarUrl: (avatarId: string) => `${API_URL()}/api/tweet/avatar/${encodeURIComponent(avatarId)}`,
  tweetSaveLocation: () => request<{ folder: string; pattern: string }>('GET', '/api/tweet/save-location'),
  tweetRender: (data: {
    items: { video_id: number; caption: string; card_mode?: 'auto' | 'card' | 'reskin' }[]
    profile: { name: string; handle: string; verified: boolean; avatar_id: string | null }
    style: { bg: string; card: 'light' | 'dark'; hook?: string }
  }) => request<{ job_id: number; count: number }>('POST', '/api/tweet/render', data),
  tweetPreview: async (data: {
    video_id: number; caption?: string; card_mode?: 'auto' | 'card' | 'reskin'
    profile: { name: string; handle: string; verified: boolean; avatar_id: string | null }
    style: { bg: string; card: 'light' | 'dark'; hook?: string }
  }): Promise<string> => {
    const base = await resolveBase()
    const headers = await authHeaders()
    headers['Content-Type'] = 'application/json'
    const res = await fetch(`${base}/api/tweet/preview`, {
      method: 'POST', headers, body: JSON.stringify(data),
    })
    if (!res.ok) {
      const e = await res.json().catch(() => ({ detail: 'Falha no preview' }))
      throw new Error(e.detail || `HTTP ${res.status}`)
    }
    return URL.createObjectURL(await res.blob())
  },
}
