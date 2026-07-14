import { Router } from 'express'
import multer from 'multer'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { requireAuth, requireApproved } from '../middleware/auth.js'
import { UPLOAD_DIR, DATA_DIR, newVideo, videos } from '../store.js'
import { cookiesStatus, startConnectInstagram } from '../instagram/connect.js'
import { probeVideo, lowerPriority } from '../render/probe.js'
import { downloadLimiter, directLimiter } from '../util/limiter.js'

export const videosRouter = Router()
videosRouter.use(requireAuth, requireApproved)

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const safe = file.originalname.replace(/[^\w.\-]+/g, '_').slice(-80)
    cb(null, `${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${safe}`)
  },
})
const upload = multer({ storage, limits: { fileSize: 500 * 1024 * 1024 } })

/** Resolve the yt-dlp binary: explicit env override first, then a binary
 *  bundled at apps/server/bin (used in prod/Render where PATH has no yt-dlp),
 *  then fall back to whatever is on PATH. */
function resolveYtdlp(): string {
  const binName = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp'
  const here = path.dirname(fileURLToPath(import.meta.url))
  const candidates = [
    process.env.YTDLP_PATH,
    path.resolve(here, '../../../bin', binName), // dist/src/routes -> apps/server/bin (build)
    path.resolve(here, '../../bin', binName),    // src/routes     -> apps/server/bin (dev)
    path.resolve(process.cwd(), 'apps/server/bin', binName),
    path.resolve(process.cwd(), 'bin', binName),
  ].filter(Boolean) as string[]
  for (const c of candidates) { try { if (fs.existsSync(c)) return c } catch { /* ignore */ } }
  return 'yt-dlp'
}
const YTDLP = resolveYtdlp()

/** Cookie args for sites that block anonymous access (Instagram, TikTok…).
 *  YTDLP_COOKIES=<path to cookies.txt>  OR
 *  YTDLP_COOKIES_FROM_BROWSER=chrome|edge|firefox|brave  (backend on the
 *  user's own machine → reuse the logged-in browser session). */
/** cookies.txt gerenciado pelo botão "Conectar Instagram", se existir e válido. */
function managedCookiesFile(): string | null {
  try {
    const p = path.join(DATA_DIR, 'cookies', 'cookies.txt')
    if (fs.existsSync(p) && fs.statSync(p).size > 50) return p
  } catch { /* */ }
  return null
}

function cookieArgs(): string[] {
  const file = process.env.YTDLP_COOKIES?.trim() || managedCookiesFile()
  if (file) return ['--cookies', file]
  const browser = process.env.YTDLP_COOKIES_FROM_BROWSER?.trim()
  if (browser) return ['--cookies-from-browser', browser]
  return []
}

function ytdlp(args: string[], timeoutMs = 180_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(YTDLP, args)
    lowerPriority(p.pid)
    let out = '', err = ''
    const timer = setTimeout(() => { p.kill('SIGKILL'); reject(new Error('yt-dlp expirou')) }, timeoutMs)
    p.stdout.on('data', (d) => { out += d.toString() })
    p.stderr.on('data', (d) => { err += d.toString() })
    p.on('error', () => { clearTimeout(timer); reject(new Error('yt-dlp não está instalado no servidor')) })
    p.on('close', (code) => { clearTimeout(timer); code === 0 ? resolve(out) : reject(new Error(err.slice(-300) || 'falha no download')) })
  })
}

async function fetchToFile(url: string, dest: string): Promise<void> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`download falhou (HTTP ${res.status})`)
  const buf = Buffer.from(await res.arrayBuffer())
  await fs.promises.writeFile(dest, buf)
}

// ===== Instagram via gallery-dl (o yt-dlp não dá conta do IG) — mesma lógica
//       do projeto `down`: perfil/reel/post normalizado, crawl perfil→abas→mídia,
//       com link direto do CDN (video_url) para o prepare baixar rápido. =========
function resolveGalleryDl(): string {
  const binName = process.platform === 'win32' ? 'gallery-dl.exe' : 'gallery-dl'
  const here = path.dirname(fileURLToPath(import.meta.url))
  const candidates = [
    process.env.GALLERYDL_PATH,
    path.resolve(here, '../../../bin', binName),
    path.resolve(here, '../../bin', binName),
    path.resolve(process.cwd(), 'apps/server/bin', binName),
  ].filter(Boolean) as string[]
  for (const c of candidates) { try { if (fs.existsSync(c)) return c } catch { /* */ } }
  return 'gallery-dl'
}
const GALLERYDL = resolveGalleryDl()

function gdlCookieArgs(): string[] {
  const file = process.env.YTDLP_COOKIES?.trim() || managedCookiesFile()
  if (file) return ['--cookies', file]
  const b = process.env.YTDLP_COOKIES_FROM_BROWSER?.trim()
  if (b) return ['--cookies-from-browser', b]
  return []
}

function galleryDl(args: string[], timeoutMs = 300_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(GALLERYDL, args)
    lowerPriority(p.pid)
    let out = '', err = ''
    const timer = setTimeout(() => { p.kill('SIGKILL'); reject(new Error('gallery-dl expirou')) }, timeoutMs)
    p.stdout.on('data', (d) => { out += d.toString() })
    p.stderr.on('data', (d) => { err += d.toString() })
    p.on('error', () => { clearTimeout(timer); reject(new Error('gallery-dl não está instalado (necessário para Instagram)')) })
    p.on('close', (code) => { clearTimeout(timer); (code === 0 || out.trim()) ? resolve(out) : reject(new Error(err.slice(-400) || 'gallery-dl falhou')) })
  })
}

const isInstagram = (url: string) => /instagram\.com/i.test(url)

const IG_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36'
const IG_RESERVED = ['p', 'reel', 'reels', 'tv', 'stories', 'explore', 'accounts', 'direct']

/** Lê os cookies do Instagram (Netscape) do arquivo configurado/gerenciado. */
function readIgCookies(): Record<string, string> | null {
  const file = process.env.YTDLP_COOKIES?.trim() || managedCookiesFile()
  if (!file) return null
  try {
    const out: Record<string, string> = {}
    for (const ln of fs.readFileSync(file, 'utf8').split('\n')) {
      const p = ln.replace(/\r$/, '').split('\t')
      if (p.length >= 7 && p[0].toLowerCase().includes('instagram')) out[p[5]] = p[6]
    }
    return out.sessionid ? out : null
  } catch { return null }
}

/** username de uma URL de PERFIL do Instagram (não post/reel). */
function igProfileUsername(url: string): string | null {
  const m = url.match(/^https?:\/\/(?:www\.)?instagram\.com\/([^/?#]+)\/?$/)
  if (m && !IG_RESERVED.includes(m[1].toLowerCase())) return m[1]
  return null
}

/** RÁPIDO: lista os vídeos de um perfil batendo direto na API web do Instagram
 *  (a mesma do site logado). Segundos, paginado, pega o perfil inteiro. */
const igListCache = new Map<string, { at: number; videos: IgVideo[] }>()
const IG_CACHE_TTL = 600_000 // 10 min — busca repetida do mesmo perfil volta na hora

async function instagramApiList(username: string, limit = 300): Promise<IgVideo[]> {
  const cached = igListCache.get(username.toLowerCase())
  if (cached && Date.now() - cached.at < IG_CACHE_TTL) return cached.videos
  const cookies = readIgCookies()
  if (!cookies) throw new Error('cookies do Instagram necessários (clique em Conectar Instagram)')
  const headers: Record<string, string> = {
    'User-Agent': IG_UA,
    'x-ig-app-id': '936619743392459',
    'x-csrftoken': cookies.csrftoken || '',
    'x-requested-with': 'XMLHttpRequest',
    Referer: `https://www.instagram.com/${username}/`,
    Accept: '*/*',
    Cookie: Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; '),
  }
  const videos: IgVideo[] = []
  let maxId: string | null = null
  for (let page = 0; videos.length < limit && page < 20; page++) {
    const params = new URLSearchParams({ count: '33' })
    if (maxId) params.set('max_id', maxId)
    const r = await fetch(`https://www.instagram.com/api/v1/feed/user/${username}/username/?${params}`, { headers })
    if (r.status === 429 && !videos.length) throw new Error('O Instagram limitou temporariamente as consultas (rate-limit). Aguarde ~30 min e tente de novo.')
    if (r.status !== 200) { if (videos.length) break; throw new Error(`API web do Instagram respondeu HTTP ${r.status}`) }
    const data = await r.json() as { items?: any[]; more_available?: boolean; next_max_id?: string }
    for (const m of (data.items || [])) {
      let v: any = m.media_type === 2 ? m : null
      if (!v && m.media_type === 8) v = (m.carousel_media || []).find((s: any) => s.media_type === 2)
      const code = m.code
      if (!v || !code) continue
      const capText = String((m.caption || {}).text || '')
      const cap = capText.split('\n')
      const thumbs = (v.image_versions2 || {}).candidates || []
      const vurls = v.video_versions || []
      videos.push({
        id: code, url: `https://www.instagram.com/p/${code}/`,
        title: (cap.find((l) => l.trim()) || code).slice(0, 90),
        caption: capText,
        thumbnail: thumbs[0]?.url || null,
        duration: v.video_duration || null,
        video_url: vurls[0]?.url || null,
      })
    }
    if (!data.more_available || !data.next_max_id) break
    maxId = data.next_max_id
    await new Promise((res) => setTimeout(res, 350))
  }
  const out = videos.slice(0, limit)
  if (out.length) igListCache.set(username.toLowerCase(), { at: Date.now(), videos: out })
  return out
}

/** Aceita link de perfil OU de um post/reel e normaliza. */
function normalizeProfileUrl(url: string): string {
  url = url.trim()
  if (!url.startsWith('http')) url = 'https://' + url
  if (url.includes('instagram.com')) {
    const m1 = url.match(/instagram\.com\/(?:[^/?#]+\/)?(?:p|reels?|tv)\/([A-Za-z0-9_-]{5,})/)
    if (m1) return `https://www.instagram.com/p/${m1[1]}/`
    const m2 = url.match(/^https?:\/\/(?:www\.)?instagram\.com\/([^/?#]+)/)
    if (m2 && !['p', 'reel', 'reels', 'tv', 'stories'].includes(m2[1])) return `https://www.instagram.com/${m2[1]}/`
  }
  return url
}

interface IgVideo { id: string; url: string; title: string; caption?: string; thumbnail: string | null; duration: number | null; video_url: string | null }

/** Lista vídeos de um perfil/post do Instagram (perfil → abas posts/reels → mídia). */
async function instagramList(url: string): Promise<IgVideo[]> {
  const posts = new Map<string, IgVideo>()
  let queue = [url]; const seen = new Set<string>()
  let lastErr: string | null = null

  const collect = (meta: Record<string, unknown>) => {
    const isVideo = !!meta.video_url || ['mp4', 'webm'].includes(String(meta.extension || '')) || meta.type === 'reel'
    if (!isVideo) return
    const code = String(meta.post_shortcode || meta.shortcode || '')
    if (!code) return
    const cur = posts.get(code)
    const desc = String(meta.description || '').split('\n')
    posts.set(code, {
      id: code, url: `https://www.instagram.com/p/${code}/`,
      title: cur?.title || (desc.find((l) => l.trim()) || code).slice(0, 90),
      thumbnail: (meta.display_url || meta.thumbnail || cur?.thumbnail || null) as string | null,
      duration: (meta.video_duration ?? cur?.duration ?? null) as number | null,
      video_url: (meta.video_url || cur?.video_url || null) as string | null,
    })
  }

  for (let depth = 0; depth < 3; depth++) {
    const batch = queue.filter((u) => !seen.has(u))
    if (!batch.length) break
    batch.forEach((u) => seen.add(u))
    const next: string[] = []
    // cada aba/URL é independente: uma falhar (ex.: aba "posts" vazia) não
    // pode derrubar as outras — só falha de verdade se nada for encontrado.
    for (const u of batch) {
      try {
        const out = await galleryDl(['-j', '--range', '1-100', '-o', 'include=posts,reels', '-o', 'sleep-request=2.0-4.0', ...gdlCookieArgs(), u])
        const msgs = JSON.parse(out) as unknown[]
        for (const msg of msgs) {
          if (!Array.isArray(msg) || !msg.length) continue
          if (msg[0] === -1) { const e = (msg[1] || {}) as Record<string, string>; lastErr = e.message || e.error || lastErr; continue }
          if (msg[0] === 6 && typeof msg[1] === 'string') { next.push(msg[1]); continue }
          if ((msg[0] === 2 || msg[0] === 3) && msg.length >= 2) {
            const meta = (msg[0] === 3 ? msg[2] : msg[1]) as Record<string, unknown>
            if (meta && typeof meta === 'object') collect(meta)
          }
        }
      } catch (e) { lastErr = e instanceof Error ? e.message : String(e) }
    }
    queue = next
  }
  if (!posts.size && lastErr) throw new Error(lastErr)
  return [...posts.values()]
}

/** Baixa UM post/reel do Instagram para destDir via gallery-dl. Retorna o caminho. */
async function instagramDownloadTo(url: string, destDir: string): Promise<string> {
  await fs.promises.mkdir(destDir, { recursive: true })
  const out = await galleryDl(['-D', destDir, '--filter', "extension in ('mp4', 'webm')", ...gdlCookieArgs(), url], 600_000)
  const files = out.split('\n').map((l) => l.trim().replace(/^#\s*/, '')).filter(Boolean)
  if (!files.length) throw new Error('gallery-dl não baixou nada')
  let p = files[files.length - 1]
  if (!path.isAbsolute(p)) p = path.join(destDir, path.basename(p))
  if (!fs.existsSync(p)) throw new Error('arquivo baixado não encontrado')
  return p
}

videosRouter.post('/prepare', upload.single('file'), async (req, res, next) => {
  const owner = res.locals.user!.uid
  try {
    const title = (req.body?.title as string) || ''
    const sourceUrl = (req.body?.source_url as string) || ''
    const directUrl = (req.body?.direct_url as string) || ''

    // 1) uploaded file
    if (req.file) {
      const p = probe(req.file.path)
      const info = await p
      const v = newVideo(owner, { title: title || req.file.originalname.replace(/\.[^.]+$/, ''), path: req.file.path, ...info, ready: true })
      return res.json({ video_id: v.id, stream_url: `/api/videos/${v.id}/stream`, ready: true, title: v.title })
    }

    // 2) direct CDN url → fetch immediately
    if (directUrl) {
      const dest = path.join(UPLOAD_DIR, `${Date.now()}_direct.mp4`)
      await directLimiter.run(() => fetchToFile(directUrl, dest))
      const info = await probe(dest)
      const v = newVideo(owner, { title: title || 'Vídeo', path: dest, sourceUrl: sourceUrl || directUrl, ...info, ready: true })
      return res.json({ video_id: v.id, stream_url: `/api/videos/${v.id}/stream`, ready: true, title: v.title })
    }

    // 3) source url → yt-dlp (async: return id immediately, poll /videos/:id)
    if (sourceUrl) {
      const v = newVideo(owner, { title: title || 'Baixando…', sourceUrl, ready: false })
      const dest = path.join(UPLOAD_DIR, `${Date.now()}_${v.id}.mp4`)
      // anti-sufocamento: no máximo N downloads simultâneos — adicionar um
      // perfil inteiro de uma vez não dispara 20 yt-dlp ao mesmo tempo
      void downloadLimiter.run(async () => {
        try {
          let outPath = dest
          if (isInstagram(sourceUrl)) {
            // Instagram → gallery-dl (yt-dlp não suporta)
            outPath = await instagramDownloadTo(normalizeProfileUrl(sourceUrl), UPLOAD_DIR)
          } else {
            await ytdlp([...cookieArgs(), '-f', 'mp4/best', '--no-playlist', '-o', dest, sourceUrl])
          }
          const info = await probe(outPath)
          Object.assign(v, { path: outPath, ...info, ready: true, title: title || v.title })
        } catch (e) {
          v.error = e instanceof Error ? e.message : 'falha no download'
        }
      })
      return res.json({ video_id: v.id, stream_url: `/api/videos/${v.id}/stream`, ready: false, title: v.title })
    }

    return res.status(400).json({ error: 'Envie um arquivo, source_url ou direct_url' })
  } catch (e) { next(e) }
})

function probe(p: string) { return probeVideo(p) }

videosRouter.get('/:id', (req, res) => {
  const v = videos.get(Number(req.params.id))
  if (!v || v.owner !== res.locals.user!.uid) return res.status(404).json({ error: 'Vídeo não encontrado' })
  res.json({
    id: v.id, title: v.title, source_url: v.sourceUrl, ready: v.ready, duration: v.duration,
    error: v.error, stream_url: `/api/videos/${v.id}/stream`,
  })
})

videosRouter.get('/:id/stream', (req, res) => {
  const v = videos.get(Number(req.params.id))
  if (!v || v.owner !== res.locals.user!.uid || !v.path || !fs.existsSync(v.path))
    return res.status(404).json({ error: 'Vídeo não encontrado' })
  res.sendFile(path.resolve(v.path))
})

export const downloaderRouter = Router()
downloaderRouter.use(requireAuth, requireApproved)

// ---- Conectar Instagram: abre o navegador para login e copia os cookies ----
downloaderRouter.get('/instagram/status', (_req, res) => res.json(cookiesStatus()))
downloaderRouter.post('/instagram/connect', (_req, res) => res.json(startConnectInstagram()))

// Lista os vídeos de um link único OU de um perfil/canal.
// Instagram → gallery-dl (yt-dlp falha com "Unsupported URL"); resto → yt-dlp.
downloaderRouter.post('/list', async (req, res, next) => {
  const raw = (req.body?.url as string || '').trim()
  if (!raw) return res.status(400).json({ error: 'Informe um link' })
  const url = normalizeProfileUrl(raw)
  try {
    if (isInstagram(url)) {
      // Caminho RÁPIDO: perfil via API web direta (segundos, pega tudo).
      // Fallback: crawl via gallery-dl (mais lento) para posts/reels avulsos ou
      // se a API web falhar.
      const username = igProfileUsername(url)
      let videos: IgVideo[] = []
      if (username) {
        try { videos = await instagramApiList(username) }
        catch (e) { console.warn('[ig] API web falhou, tentando gallery-dl:', (e as Error).message) }
      }
      if (!videos.length) videos = await instagramList(url)
      if (!videos.length) {
        return res.status(400).json({
          error: 'Nenhum vídeo encontrado. Se o perfil é privado ou exige login, ' +
            'clique em "Conectar Instagram" no topo para logar.',
        })
      }
      return res.json({ profile: url, count: videos.length, videos })
    }

    const out = await ytdlp([...cookieArgs(), '--flat-playlist', '--dump-single-json', '--no-warnings', url], 60_000)
    const j = JSON.parse(out)
    const entries: any[] = j.entries || [j]
    const videos = entries.filter(Boolean).map((e) => ({
      id: e.id || null,
      url: e.url && e.url.startsWith('http') ? e.url : (e.webpage_url || `https://youtu.be/${e.id}`),
      title: e.title || null,
      thumbnail: e.thumbnail || (e.thumbnails?.[0]?.url ?? null),
      duration: e.duration || null,
      video_url: null,
    }))
    res.json({ profile: j.title || j.uploader || url, count: videos.length, videos })
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Não foi possível ler o link.' })
  }
})
