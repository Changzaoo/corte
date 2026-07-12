import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import { config } from './config.js'
import './firebase.js'
import { meRouter } from './routes/me.js'
import { adminRouter } from './routes/admin.js'
import { videosRouter, downloaderRouter } from './routes/videos.js'
import { tweetRouter } from './routes/tweet.js'
import { jobsRouter } from './routes/jobs.js'
import { clipsRouter } from './routes/clips.js'

const app = express()
app.set('trust proxy', 1)

// helmet — allow the web app (different origin) to embed images/video from here
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: false,
}))

const allowAll = config.corsOrigins.includes('*')
app.use(cors({
  origin: allowAll ? true : config.corsOrigins,
  credentials: false,
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Corte-Device-ID', 'X-Corte-Device-Name'],
}))

app.use(express.json({ limit: '2mb' }))
app.use(rateLimit({ windowMs: 15 * 60_000, max: 1000, standardHeaders: true, legacyHeaders: false }))

app.get('/', (_req, res) => res.json({ ok: true, service: 'corte-api', ts: new Date().toISOString() }))
app.get('/health', (_req, res) => res.json({ ok: true }))

app.use('/api/me', meRouter)
app.use('/api/admin', adminRouter)
app.use('/api/videos', videosRouter)
app.use('/api/downloader', downloaderRouter)
app.use('/api/tweet', tweetRouter)
app.use('/api/jobs', jobsRouter)
app.use('/api/clips', clipsRouter)

// central error handler → JSON { error }
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const msg = err?.issues ? err.issues.map((i: any) => i.message).join('; ') : (err?.message || 'Erro interno')
  const code = err?.status || (err?.issues ? 400 : 500)
  if (code >= 500) console.error('[error]', err)
  res.status(code).json({ error: msg })
})

app.listen(config.port, () => {
  console.log(`[corte-api] listening on :${config.port} (${config.nodeEnv})`)
  console.log(`[corte-api] admin emails: ${config.adminEmails.join(', ') || '(none)'}`)
})
