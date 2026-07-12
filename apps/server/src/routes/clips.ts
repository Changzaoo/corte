import { Router } from 'express'
import fs from 'node:fs'
import path from 'node:path'
import archiver from 'archiver'
import { requireAuth } from '../middleware/auth.js'
import { clips } from '../store.js'

export const clipsRouter = Router()
clipsRouter.use(requireAuth)

clipsRouter.get('/', (req, res) => {
  const owner = res.locals.user!.uid
  const jobId = Number(req.query.job_id)
  const list = [...clips.values()]
    .filter((c) => c.owner === owner && (!jobId || c.jobId === jobId))
    .map((c) => ({
      id: c.id, job_id: c.jobId, video_id: c.videoId, title: c.title,
      file_path: c.path, category: c.category, topic_label: c.title, created_at: c.createdAt,
    }))
  res.json(list)
})

clipsRouter.get('/download-all', (req, res) => {
  const owner = res.locals.user!.uid
  const jobId = Number(req.query.job_id)
  // optional subset: ?ids=1,2,3 → zip only those clips (baixar selecionados)
  const idsParam = typeof req.query.ids === 'string' ? req.query.ids : ''
  const onlyIds = new Set(idsParam.split(',').map((s) => Number(s.trim())).filter((n) => Number.isFinite(n) && n > 0))
  const list = [...clips.values()].filter((c) =>
    c.owner === owner && c.jobId === jobId && fs.existsSync(c.path) &&
    (onlyIds.size === 0 || onlyIds.has(c.id)))
  if (!list.length) return res.status(404).json({ error: 'Nenhum vídeo' })
  res.setHeader('Content-Type', 'application/zip')
  res.setHeader('Content-Disposition', `attachment; filename="template_${jobId}.zip"`)
  const zip = archiver('zip', { store: true })
  zip.on('error', () => res.end())
  zip.pipe(res)
  list.forEach((c, i) => zip.file(c.path, { name: `${i + 1}_${path.basename(c.path)}` }))
  zip.finalize()
})

clipsRouter.get('/:id/download', (req, res) => {
  const c = clips.get(Number(req.params.id))
  if (!c || c.owner !== res.locals.user!.uid || !fs.existsSync(c.path))
    return res.status(404).json({ error: 'Clipe não encontrado' })
  res.sendFile(path.resolve(c.path))
})
