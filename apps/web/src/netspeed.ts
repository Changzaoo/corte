// Telemetria de velocidade de rede — PASSIVA. Mede upload/download reais a
// partir do tráfego que o app já faz (streaming de vídeo, downloads, uploads de
// avatar/vídeo), sem nenhum speed test sintético. A "velocidade média" vem da
// estimativa do navegador (Network Information API). Reporta ao backend no
// máximo ~1x/dia por dispositivo (uploads reais podem forçar um envio extra).
import { api } from './api'

const REPORT_KEY = 'corte-netspeed-at'
const DAY = 24 * 3600_000
const MIN_BYTES = 200_000        // ignora transferências pequenas (ruído)

const downSamples: number[] = []
const upSamples: number[] = []
const seen = new Set<string>()
let started = false
let lastSent = 0

function median(a: number[]): number | null {
  if (!a.length) return null
  const s = [...a].sort((x, y) => x - y)
  const n = s.length
  const m = n % 2 ? s[(n - 1) >> 1] : (s[n / 2 - 1] + s[n / 2]) / 2
  return Math.round(m * 10) / 10
}

/** Amostra de UPLOAD real (chamada pelo helper de upload da api). */
export function recordUploadSample(bytes: number, ms: number): void {
  if (bytes <= 0 || ms <= 5) return
  const mbps = (bytes * 8) / (ms / 1000) / 1e6
  if (mbps > 0 && mbps < 10000) {
    upSamples.push(mbps)
    if (upSamples.length > 20) upSamples.shift()
    void report(true)   // upload real é sinal valioso — reporta (respeita o cap de 60s)
  }
}

/** Colhe amostras de DOWNLOAD das transferências grandes já realizadas. */
function collectDownloadSamples(): void {
  try {
    const entries = performance.getEntriesByType('resource') as PerformanceResourceTiming[]
    for (const e of entries) {
      if (seen.has(e.name)) continue
      seen.add(e.name)
      const bytes = e.transferSize || e.encodedBodySize || 0
      const dur = e.responseEnd - e.responseStart   // tempo só do corpo (mais fiel)
      if (bytes > MIN_BYTES && dur > 3) {
        const mbps = (bytes * 8) / (dur / 1000) / 1e6
        if (mbps > 0 && mbps < 10000) {
          downSamples.push(mbps)
          if (downSamples.length > 40) downSamples.shift()
        }
      }
    }
  } catch { /* Performance API indisponível */ }
}

interface Conn { avgMbps: number | null; rttMs: number | null; effectiveType: string | null }
function connInfo(): Conn {
  const nav = navigator as Navigator & { connection?: any; mozConnection?: any; webkitConnection?: any }
  const c = nav.connection || nav.mozConnection || nav.webkitConnection
  if (!c) return { avgMbps: null, rttMs: null, effectiveType: null }
  return {
    avgMbps: typeof c.downlink === 'number' ? c.downlink : null,
    rttMs: typeof c.rtt === 'number' ? c.rtt : null,
    effectiveType: typeof c.effectiveType === 'string' ? c.effectiveType : null,
  }
}

async function report(bypassDaily = false): Promise<void> {
  collectDownloadSamples()
  const conn = connInfo()
  const down = median(downSamples), up = median(upSamples)
  if (down == null && up == null && conn.avgMbps == null) return
  if (Date.now() - lastSent < 60_000) return
  if (!bypassDaily) {
    try { if (Date.now() - Number(localStorage.getItem(REPORT_KEY) || 0) < DAY) return } catch { /* */ }
  }
  lastSent = Date.now()
  try { localStorage.setItem(REPORT_KEY, String(Date.now())) } catch { /* */ }
  await api.reportNetSpeed({
    avgMbps: conn.avgMbps, downMbps: down, upMbps: up,
    rttMs: conn.rttMs, effectiveType: conn.effectiveType,
  }).catch(() => { /* best-effort */ })
}

/** Liga a telemetria (idempotente). Chamar quando o usuário estiver logado. */
export function initNetSpeed(): void {
  if (started || typeof window === 'undefined') return
  started = true
  // deixa o app carregar algum tráfego antes do 1º envio
  window.setTimeout(() => void report(), 8000)
  // recolhe novos downloads periodicamente
  window.setInterval(() => void report(), 5 * 60_000)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void report()
  })
}
