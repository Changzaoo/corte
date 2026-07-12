import { Router } from 'express'
import multer from 'multer'
import fs from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import { requireAuth } from '../middleware/auth.js'
import { AVATAR_DIR, OUTPUT_DIR, videos, newJob, updateJob, newClip } from '../store.js'
import { renderTweetPreview, renderTweetVideo, type RenderOpts } from '../render/tweetRender.js'

export const tweetRouter = Router()
tweetRouter.use(requireAuth)

const storage = multer.diskStorage({
  destination: (_r, _f, cb) => cb(null, AVATAR_DIR),
  filename: (_r, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.png'
    cb(null, `${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`)
  },
})
const upload = multer({ storage, limits: { fileSize: 8 * 1024 * 1024 } })

tweetRouter.post('/avatar', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Envie uma imagem' })
  res.json({ avatar_id: req.file.filename })
})

tweetRouter.get('/avatar/:id', (req, res) => {
  const p = path.join(AVATAR_DIR, path.basename(req.params.id))
  if (!fs.existsSync(p)) return res.status(404).end()
  res.sendFile(path.resolve(p))
})

tweetRouter.get('/save-location', (_req, res) => {
  res.json({ folder: 'Prontos › Template Tweet', pattern: 'AAAA-MM-DD Nome (#job)' })
})

const profileSchema = z.object({
  name: z.string().default('Usuário'),
  handle: z.string().default('usuario'),
  verified: z.boolean().default(true),
  avatar_id: z.string().nullable().default(null),
})
const styleSchema = z.object({
  bg: z.string().default('blur'),
  card: z.enum(['light', 'dark']).default('light'),
  hook: z.string().optional().default(''),
})

function avatarPath(avatarId: string | null): string | null {
  if (!avatarId) return null
  const p = path.join(AVATAR_DIR, path.basename(avatarId))
  return fs.existsSync(p) ? p : null
}

function optsFor(video: { path: string | null; width: number; height: number; duration: number },
  caption: string, profile: z.infer<typeof profileSchema>, style: z.infer<typeof styleSchema>): RenderOpts {
  return {
    videoPath: video.path!, srcW: video.width, srcH: video.height, duration: video.duration,
    caption: caption || '',
    profile: { name: profile.name, handle: profile.handle, verified: profile.verified, avatarPath: avatarPath(profile.avatar_id) },
    style: { card: style.card, hook: style.hook },
  }
}

const previewSchema = z.object({
  video_id: z.number(),
  caption: z.string().optional().default(''),
  card_mode: z.string().optional(),
  profile: profileSchema,
  style: styleSchema,
})
tweetRouter.post('/preview', async (req, res, next) => {
  try {
    const body = previewSchema.parse(req.body)
    const v = videos.get(body.video_id)
    if (!v || v.owner !== res.locals.user!.uid || !v.path || !v.ready)
      return res.status(400).json({ error: 'Vídeo não está pronto' })
    const buf = await renderTweetPreview(optsFor(v, body.caption, body.profile, body.style))
    res.setHeader('Content-Type', 'image/jpeg')
    res.setHeader('Cache-Control', 'no-store')
    res.end(buf)
  } catch (e) { next(e) }
})

const renderSchema = z.object({
  items: z.array(z.object({
    video_id: z.number(),
    caption: z.string().optional().default(''),
    card_mode: z.string().optional(),
  })).min(1),
  profile: profileSchema,
  style: styleSchema,
})
tweetRouter.post('/render', async (req, res, next) => {
  try {
    const body = renderSchema.parse(req.body)
    const owner = res.locals.user!.uid
    // validate all videos up-front
    for (const it of body.items) {
      const v = videos.get(it.video_id)
      if (!v || v.owner !== owner || !v.path || !v.ready)
        return res.status(400).json({ error: `Vídeo ${it.video_id} não está pronto` })
    }
    const job = newJob(owner)
    updateJob(job.id, { status: 'rendering', stageDetail: 'Renderizando…' })

    ;(async () => {
      let done = 0
      for (let i = 0; i < body.items.length; i++) {
        const it = body.items[i]
        const v = videos.get(it.video_id)!
        const out = path.join(OUTPUT_DIR, `tweet_${job.id}_${i + 1}.mp4`)
        try {
          updateJob(job.id, { stageDetail: `Renderizando ${i + 1}/${body.items.length}` })
          await renderTweetVideo(optsFor(v, it.caption, body.profile, body.style), out)
          const title = it.caption?.trim() || v.title
          newClip(owner, job.id, v.id, title, out)
          done++
        } catch (e) {
          console.error('[tweet] render failed for video', v.id, e)
        }
        updateJob(job.id, { progress: Math.round(((i + 1) / body.items.length) * 100) })
      }
      updateJob(job.id, done > 0
        ? { status: 'done', progress: 100, stageDetail: 'Concluído' }
        : { status: 'failed', error: 'Nenhum vídeo foi renderizado' })
    })().catch((e) => updateJob(job.id, { status: 'failed', error: e?.message || 'Falha no render' }))

    res.json({ job_id: job.id, count: body.items.length })
  } catch (e) { next(e) }
})
