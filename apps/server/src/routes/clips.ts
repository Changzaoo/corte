import { Router } from 'express'
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import archiver from 'archiver'
import { requireAuth } from '../middleware/auth.js'
import { clips, OUTPUT_DIR } from '../store.js'
import { config } from '../config.js'

export const clipsRouter = Router()
clipsRouter.use(requireAuth)

// Abre no Explorer a pasta onde os cortes ficam salvos no PC (só modo local).
clipsRouter.post('/open-folder', (_req, res) => {
  const folder = path.resolve(OUTPUT_DIR)
  if (!config.localMode) return res.status(400).json({ error: 'Disponível apenas no app instalado no PC' })
  try {
    fs.mkdirSync(folder, { recursive: true })
    if (process.platform === 'win32') spawn('explorer.exe', [folder], { detached: true }).unref()
    else if (process.platform === 'darwin') spawn('open', [folder], { detached: true }).unref()
    else spawn('xdg-open', [folder], { detached: true }).unref()
    res.json({ ok: true, folder })
  } catch { res.status(400).json({ error: 'não foi possível abrir a pasta' }) }
})

// Lista TODOS os cortes já renderizados que estão na pasta do PC.
clipsRouter.get('/library', (_req, res) => {
  const folder = path.resolve(OUTPUT_DIR)
  try {
    const items = fs.readdirSync(folder)
      .filter((f) => /\.(mp4|webm|mov)$/i.test(f))
      .map((f) => { const st = fs.statSync(path.join(folder, f)); return { name: f, size: st.size, mtime: st.mtimeMs } })
      .sort((a, b) => b.mtime - a.mtime)
    res.json({ folder, count: items.length, items })
  } catch { res.json({ folder, count: 0, items: [] }) }
})

// Serve um arquivo de corte da pasta pelo nome (para preview/download).
clipsRouter.get('/file/:name', (req, res) => {
  const p = path.join(path.resolve(OUTPUT_DIR), path.basename(req.params.name))
  if (!fs.existsSync(p)) return res.status(404).end()
  res.sendFile(p)
})

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
  // nome dentro do zip = nome real do arquivo (a legenda), sem prefixo numérico
  list.forEach((c) => zip.file(c.path, { name: path.basename(c.path) }))
  zip.finalize()
})

clipsRouter.get('/:id/download', (req, res) => {
  const c = clips.get(Number(req.params.id))
  if (!c || c.owner !== res.locals.user!.uid || !fs.existsSync(c.path))
    return res.status(404).json({ error: 'Clipe não encontrado' })
  // inline (o <video> dos resultados usa esta rota); o atributo download do
  // <a> baixa com o nome real do arquivo vindo do Content-Disposition
  res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(path.basename(c.path))}`)
  res.sendFile(path.resolve(c.path))
})
