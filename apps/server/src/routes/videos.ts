import { Router } from 'express'
import multer from 'multer'
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { requireAuth } from '../middleware/auth.js'
import { UPLOAD_DIR, newVideo, videos } from '../store.js'
import { probeVideo } from '../render/probe.js'

export const videosRouter = Router()
videosRouter.use(requireAuth)

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const safe = file.originalname.replace(/[^\w.\-]+/g, '_').slice(-80)
    cb(null, `${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${safe}`)
  },
})
const upload = multer({ storage, limits: { fileSize: 500 * 1024 * 1024 } })

const YTDLP = process.env.YTDLP_PATH || 'yt-dlp'

function ytdlp(args: string[], timeoutMs = 180_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(YTDLP, args)
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
      await fetchToFile(directUrl, dest)
      const info = await probe(dest)
      const v = newVideo(owner, { title: title || 'Vídeo', path: dest, sourceUrl: sourceUrl || directUrl, ...info, ready: true })
      return res.json({ video_id: v.id, stream_url: `/api/videos/${v.id}/stream`, ready: true, title: v.title })
    }

    // 3) source url → yt-dlp (async: return id immediately, poll /videos/:id)
    if (sourceUrl) {
      const v = newVideo(owner, { title: title || 'Baixando…', sourceUrl, ready: false })
      const dest = path.join(UPLOAD_DIR, `${Date.now()}_${v.id}.mp4`)
      ;(async () => {
        try {
          await ytdlp(['-f', 'mp4/best', '--no-playlist', '-o', dest, sourceUrl])
          const info = await probe(dest)
          Object.assign(v, { path: dest, ...info, ready: true, title: title || v.title })
        } catch (e) {
          v.error = e instanceof Error ? e.message : 'falha no download'
        }
      })()
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
downloaderRouter.use(requireAuth)

// List videos of a single link OR a profile/channel (best-effort via yt-dlp).
downloaderRouter.post('/list', async (req, res, next) => {
  const url = (req.body?.url as string || '').trim()
  if (!url) return res.status(400).json({ error: 'Informe um link' })
  try {
    const out = await ytdlp(['--flat-playlist', '--dump-single-json', '--no-warnings', url], 60_000)
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
    res.status(400).json({ error: e instanceof Error ? e.message : 'Não foi possível ler o link. (yt-dlp indisponível?)' })
  }
})
