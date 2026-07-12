import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { jobs } from '../store.js'

export const jobsRouter = Router()
jobsRouter.use(requireAuth)

jobsRouter.get('/:id', (req, res) => {
  const j = jobs.get(Number(req.params.id))
  if (!j || j.owner !== res.locals.user!.uid) return res.status(404).json({ error: 'Job não encontrado' })
  res.json({
    id: j.id, category: 'tweet', status: j.status, progress: j.progress,
    error_message: j.error, stage_detail: j.stageDetail,
    created_at: j.createdAt, updated_at: j.updatedAt,
  })
})
