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
import { systemRouter } from './routes/system.js'

const app = express()
app.set('trust proxy', 1)

// helmet — allow the web app (different origin) to embed images/video from here
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: false,
}))

// Private Network Access (Chrome): sem este header o navegador BLOQUEIA um site
// público (https://cortes.digital) de acessar o backend local (localhost) — o
// app cairia no servidor da nuvem. Precisa vir antes do CORS/preflight.
app.use((_req, res, next) => {
  res.setHeader('Access-Control-Allow-Private-Network', 'true')
  // expõe timing de recursos cross-origin ao app (só métricas de tempo/tamanho,
  // não o conteúdo) → telemetria passiva de velocidade de download no navegador.
  res.setHeader('Timing-Allow-Origin', '*')
  next()
})

const allowAll = config.corsOrigins.includes('*')
// Origens sempre liberadas (o domínio oficial + previews da Vercel + localhost),
// independente do CORS_ORIGINS configurado no painel do Render.
const ALWAYS_ALLOW = [
  /^https:\/\/(www\.)?cortes\.digital$/i,
  /\.vercel\.app$/i,
  /^https?:\/\/localhost(:\d+)?$/i,
  /^https?:\/\/127\.0\.0\.1(:\d+)?$/i,
]
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true) // apps nativos / curl / same-origin
    if (allowAll) return cb(null, true)
    if (config.corsOrigins.includes(origin)) return cb(null, true)
    if (ALWAYS_ALLOW.some((re) => re.test(origin))) return cb(null, true)
    return cb(null, false)
  },
  credentials: false,
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Corte-Device-ID', 'X-Corte-Device-Name'],
}))

app.use(express.json({ limit: '2mb' }))
app.use(rateLimit({ windowMs: 15 * 60_000, max: 1000, standardHeaders: true, legacyHeaders: false }))

app.get('/', (_req, res) => res.json({ ok: true, service: 'corte-api', ts: new Date().toISOString() }))
// 'app' marca que é o backend do cortes.digital (detecção do "instalado no PC");
// 'local' indica que roda em modo local (na máquina do usuário).
app.get('/health', (_req, res) => res.json({ ok: true, app: 'cortes.digital', local: config.localMode }))

app.use('/api/me', meRouter)
app.use('/api/admin', adminRouter)
app.use('/api/videos', videosRouter)
app.use('/api/downloader', downloaderRouter)
app.use('/api/tweet', tweetRouter)
app.use('/api/jobs', jobsRouter)
app.use('/api/clips', clipsRouter)
app.use('/api/system', systemRouter)

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
