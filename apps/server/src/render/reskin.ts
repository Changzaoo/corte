/**
 * Re-skin: vídeo que JÁ vem com um card de template embutido (cabeçalho de
 * perfil + legenda estáticos acima de um vídeo interno). Em vez de criar outro
 * card por cima, detectamos o layout comparando frames e trocamos SÓ o avatar,
 * nome, @ e (opcionalmente) a legenda — o vídeo interno fica intocado.
 *
 * Porte do módulo Python `apps/api/tweet_render.py` (Pillow + numpy) do projeto
 * de referência, usando `sharp` para pixels/rasterização e o binário ffmpeg.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import sharp from 'sharp'
import { FFMPEG, probeVideo, runFfmpeg, hasAudio } from './probe.js'
import { type UniquifySpec, NEUTRAL, audioChain, speedSetpts, encodeArgs } from './uniquify.js'

const THEMES = {
  light: { card: '#FFFFFF', text: '#0F1419', muted: '#536471', border: '#CFD9DE' },
  dark: { card: '#16181C', text: '#E7E9EA', muted: '#71767B', border: '#38444D' },
}
const BADGE_BLUE = '#1D9BF0'

type RGB = [number, number, number]

interface Zone { y0: number; y1: number; x0: number; x1: number; bg: RGB }
export interface ReskinLayout {
  w: number; h: number; videoTop: number; videoBottom: number; bg: RGB
  branding: Zone | null
  caption: Zone | null
  labels: { y0: number; y1: number }[]
  bottom: Zone[]
}

interface Frame { data: Buffer; w: number; h: number }

const escXml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

// ---------------------------------------------------------------------------
// Extração de frames + leitura de pixels
// ---------------------------------------------------------------------------

async function grabFrame(videoPath: string, t: number, out: string, scaleW?: number): Promise<Frame | null> {
  try {
    const vf = scaleW ? ['-vf', `scale=${scaleW}:-2`] : []
    await runFfmpeg(['-ss', t.toFixed(2), '-i', videoPath, ...vf, '-frames:v', '1', out])
    const { data, info } = await sharp(out).removeAlpha().raw().toBuffer({ resolveWithObject: true })
    return { data: data as Buffer, w: info.width, h: info.height }
  } catch {
    return null
  } finally {
    fs.rm(out, () => {})
  }
}

// A análise roda no event loop do node — cede a vez entre etapas pesadas para
// o backend não ficar surdo (site lento) durante a detecção.
const yieldLoop = () => new Promise<void>((r) => setImmediate(r))

// ---- helpers de pixel (frame RGB contíguo, 3 canais) ----------------------
function maxChanDiff(a: Frame, b: Frame, i: number): number {
  const o = i * 3
  const d0 = Math.abs(a.data[o] - b.data[o])
  const d1 = Math.abs(a.data[o + 1] - b.data[o + 1])
  const d2 = Math.abs(a.data[o + 2] - b.data[o + 2])
  return d0 > d1 ? (d0 > d2 ? d0 : d2) : (d1 > d2 ? d1 : d2)
}

function median(vals: number[]): number {
  vals.sort((a, b) => a - b)
  const n = vals.length
  return n % 2 ? vals[(n - 1) >> 1] : (vals[n / 2 - 1] + vals[n / 2]) / 2
}

// ---------------------------------------------------------------------------
// Análise de uma faixa estática (retângulo [yStart,yEnd) x [xLo,xHi) do frame)
// ---------------------------------------------------------------------------
interface Analysis {
  yStart: number; rows: number; bw: number; xLo: number
  content: Uint8Array; soft: Uint8Array
  blocks: [number, number][]  // (y0,y1) em coords do frame
  meanContent: number
  frame: Frame
}

function analyze(frame: Frame, yStart: number, yEnd: number, xLo: number, xHi: number, H: number): Analysis | null {
  const rows = yEnd - yStart
  const bw = xHi - xLo
  if (rows < 4) return null
  const content = new Uint8Array(rows * bw)
  const soft = new Uint8Array(rows * bw)
  const rowd = new Float64Array(rows)
  const tmp: number[] = new Array(bw)
  let contentSum = 0
  for (let r = 0; r < rows; r++) {
    const y = yStart + r
    const base = y * frame.w
    // mediana da própria linha por canal
    for (let ch = 0; ch < 3; ch++) {
      for (let c = 0; c < bw; c++) tmp[c] = frame.data[(base + xLo + c) * 3 + ch]
      const med = median(tmp)
      if (ch === 0) medR[r] = med; else if (ch === 1) medG[r] = med; else medB[r] = med
    }
    let hits = 0
    for (let c = 0; c < bw; c++) {
      const o = (base + xLo + c) * 3
      const dr = Math.abs(frame.data[o] - medR[r])
      const dg = Math.abs(frame.data[o + 1] - medG[r])
      const db = Math.abs(frame.data[o + 2] - medB[r])
      const diff = dr > dg ? (dr > db ? dr : db) : (dg > db ? dg : db)
      const idx = r * bw + c
      if (diff > 26) { content[idx] = 1; hits++; contentSum++ }
      if (diff > 12) soft[idx] = 1
    }
    rowd[r] = hits / bw
  }
  // blocos verticais de conteúdo (linhas com rowd>0.008), tolerando um vão
  const blocks: [number, number][] = []
  const gapMax = Math.max(8, Math.round(H * 0.012))
  let inB = false, s = 0, gap = 0
  for (let r = 0; r < rows; r++) {
    if (rowd[r] > 0.008) { if (!inB) { inB = true; s = r } gap = 0 }
    else if (inB) { gap++; if (gap > gapMax) { blocks.push([s, r - gap + 1]); inB = false } }
  }
  if (inB) blocks.push([s, rows])
  const kept = blocks.filter(([a, b]) => (b - a) >= H * 0.010)
  // converte para coords do frame
  const framed: [number, number][] = kept.map(([a, b]) => [a + yStart, b + yStart])
  return {
    yStart, rows, bw, xLo, content, soft,
    blocks: framed, meanContent: contentSum / (rows * bw), frame,
  }
}

// buffers de mediana reutilizados por análise (evita realocar por linha)
let medR = new Float64Array(0), medG = new Float64Array(0), medB = new Float64Array(0)

// ---------------------------------------------------------------------------
// Detecção do card embutido
// ---------------------------------------------------------------------------
export async function detectExistingCard(videoPath: string): Promise<ReskinLayout | null> {
  let dur = 0, origW = 0, origH = 0
  try {
    const p = await probeVideo(videoPath)
    dur = p.duration; origW = p.width; origH = p.height
  } catch { return null }
  if (dur <= 0.5 || !origW || !origH) return null
  const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), 'vc_reskin_det_'))
  try {
    // detecta em RESOLUÇÃO REDUZIDA (~5x menos pixels que 1080p): os loops de
    // pixel são JS puro no event loop — em full-res o backend travava segundos
    // por vídeo e o site inteiro ficava lento. Coordenadas voltam à escala
    // original no final.
    const scaleW = Math.min(640, origW)
    const times = [0.15, 0.35, 0.55, 0.75, 0.9].map((f) => Math.max(0.1, dur * f))
    const frames: Frame[] = []
    for (let i = 0; i < times.length; i++) {
      const f = await grabFrame(videoPath, times[i], path.join(tmpdir, `det_${i}.png`), scaleW)
      if (f) frames.push(f)
    }
    if (frames.length < 3) return null
    const W = frames[0].w, H = frames[0].h
    if (frames.some((f) => f.w !== W || f.h !== H)) return null

    // 1) região em movimento = vídeo interno (persistência entre pares)
    const nPairs = frames.length - 1
    const rowHits = new Int32Array(H)
    const colHits = new Int32Array(W)
    for (let p = 0; p < nPairs; p++) {
      const a = frames[p], b = frames[p + 1]
      const rowCnt = new Int32Array(H)
      const colCnt = new Int32Array(W)
      for (let y = 0; y < H; y++) {
        const base = y * W
        for (let x = 0; x < W; x++) {
          if (maxChanDiff(a, b, base + x) > 18) { rowCnt[y]++; colCnt[x]++ }
        }
      }
      for (let y = 0; y < H; y++) if (rowCnt[y] / W > 0.03) rowHits[y]++
      for (let x = 0; x < W; x++) if (colCnt[x] / H > 0.03) colHits[x]++
      await yieldLoop()   // deixa o backend responder HTTP entre os pares
    }
    const need = Math.max(2, Math.floor((nPairs + 1) / 2))
    const rows: number[] = [], cols: number[] = []
    for (let y = 0; y < H; y++) if (rowHits[y] >= need) rows.push(y)
    for (let x = 0; x < W; x++) if (colHits[x] >= need) cols.push(x)
    if (!rows.length || !cols.length) return null
    const vy0 = rows[0], vy1 = rows[rows.length - 1]
    const vx0 = cols[0], vx1 = cols[cols.length - 1]
    if ((vx1 - vx0) < W * 0.5 || (vy1 - vy0) < H * 0.2) return null
    if (vy0 < H * 0.08) return null

    // 2) faixas estáticas na região central da página
    const xLo = Math.floor(W * 0.08), xHi = Math.floor(W * 0.92)
    const midFrame = frames[Math.floor(frames.length / 2)]
    if (medR.length < Math.max(H, 1)) { medR = new Float64Array(H); medG = new Float64Array(H); medB = new Float64Array(H) }

    const top = analyze(midFrame, 0, vy0, xLo, xHi, H)
    if (!top || !top.blocks.length) return null
    if (top.meanContent > 0.30) return null

    const bw = top.bw
    // conteúdo de content/soft está em coords de banda: idx = (y-yStart)*bw + (x-xLo)
    const contentAt = (y: number, x: number) => top.content[(y - top.yStart) * bw + (x - xLo)]
    const softAt = (y: number, x: number) => top.soft[(y - top.yStart) * bw + (x - xLo)]

    const colContentMean = (y0: number, y1: number, x: number) => {
      let s = 0; for (let y = y0; y < y1; y++) s += contentAt(y, x); return s / (y1 - y0)
    }

    const xbounds = (y0: number, y1: number, thr = 0.008): [number, number] | null => {
      let first = -1, last = -1
      for (let x = xLo; x < xHi; x++) {
        if (colContentMean(y0, y1, x) > thr) { if (first < 0) first = x; last = x }
      }
      return first < 0 ? null : [first, last]
    }

    const localBg = (y0: number, y1: number): RGB => {
      y0 = Math.max(0, y0); y1 = Math.min(vy0, y1)
      const rs: number[] = [], gs: number[] = [], bs: number[] = []
      for (let y = y0; y < y1; y++) {
        const base = y * W
        for (let x = xLo; x < xHi; x++) {
          if (!contentAt(y, x)) { const o = (base + x) * 3; rs.push(midFrame.data[o]); gs.push(midFrame.data[o + 1]); bs.push(midFrame.data[o + 2]) }
        }
      }
      if (!rs.length) {
        for (let y = y0; y < y1; y++) { const base = y * W; for (let x = xLo; x < xHi; x++) { const o = (base + x) * 3; rs.push(midFrame.data[o]); gs.push(midFrame.data[o + 1]); bs.push(midFrame.data[o + 2]) } }
      }
      return [Math.round(median(rs)), Math.round(median(gs)), Math.round(median(bs))]
    }

    const colorfulFrac = (y0: number, y1: number): number => {
      let n = 0, sat = 0
      for (let y = y0; y < y1; y++) {
        const base = y * W
        for (let x = xLo; x < xHi; x++) {
          if (contentAt(y, x)) { const o = (base + x) * 3; const r = midFrame.data[o], g = midFrame.data[o + 1], b = midFrame.data[o + 2]; const mx = Math.max(r, g, b), mn = Math.min(r, g, b); n++; if (mx - mn > 45) sat++ }
        }
      }
      return n ? sat / n : 0
    }

    const xclusters = (y0: number, y1: number): [number, number][] => {
      const groups: [number, number][] = []
      const gapMax = Math.max(10, Math.round(bw * 0.04))
      let inG = false, s = 0, gap = 0
      for (let xi = 0; xi < bw; xi++) {
        const x = xLo + xi
        if (colContentMean(y0, y1, x) > 0.008) { if (!inG) { inG = true; s = xi } gap = 0 }
        else if (inG) { gap++; if (gap > gapMax) { groups.push([s, xi - gap + 1]); inG = false } }
      }
      if (inG) groups.push([s, bw])
      return groups.filter(([a, b]) => b - a > 3)
    }

    const isLabelRow = (y0: number, y1: number): boolean => {
      if ((y1 - y0) > H * 0.055 || y0 < vy0 * 0.35) return false
      const cl = xclusters(y0, y1)
      if (cl.length < 2) return false
      const gaps: number[] = [], widths = cl.map(([a, b]) => b - a)
      for (let i = 0; i < cl.length - 1; i++) gaps.push(cl[i + 1][0] - cl[i][1])
      return Math.max(...gaps) > bw * 0.30 && widths.reduce((a, b) => a + b, 0) < bw * 0.55
        && Math.min(...widths) / Math.max(...widths) > 0.25
    }

    const labels = top.blocks.filter(([a, b]) => isLabelRow(a, b))
    const candBlocks = top.blocks.filter((blk) => !labels.includes(blk))

    // classificação por posição: com 2+ blocos, o último (colado no vídeo) é a
    // legenda — a menos que seja muito colorido (outro logo). Com 1 bloco só é
    // marca do autor antigo, será coberto.
    let captionBlk: [number, number] | null = null
    let brandingBlks = candBlocks.slice()
    if (candBlocks.length >= 2 && colorfulFrac(candBlocks[candBlocks.length - 1][0], candBlocks[candBlocks.length - 1][1]) < 0.50) {
      captionBlk = candBlocks[candBlocks.length - 1]
      brandingBlks = candBlocks.slice(0, -1)
    }

    let branding: Zone | null = null
    if (brandingBlks.length) {
      let by0 = brandingBlks[0][0], by1 = brandingBlks[brandingBlks.length - 1][1]
      if (!(H * 0.02 <= (by1 - by0) && (by1 - by0) <= H * 0.40)) return null
      // expansão por histerese usando o rastro fraco (soft) do logo
      const softRowd = (y: number) => { let s = 0; for (let x = xLo; x < xHi; x++) s += softAt(y, x); return s / bw }
      const floors = top.blocks.filter((blk) => blk[0] >= by1 && !brandingBlks.includes(blk)).map((blk) => blk[0])
      const floorY = Math.min(...(floors.length ? floors : [vy0]), vy0) - 2
      const grow = Math.round(H * 0.05)
      const g0 = by0, g1 = by1
      while (by0 > Math.max(0, g0 - grow) && softRowd(by0 - 1) > 0.004) by0--
      while (by1 < Math.min(floorY, g1 + grow) && softRowd(by1) > 0.004) by1++
      if (by0 <= 2) by0 = 0
      let first = -1, last = -1
      for (let x = xLo; x < xHi; x++) { let s = 0; for (let y = by0; y < by1; y++) s += softAt(y, x); if (s / (by1 - by0) > 0.004) { if (first < 0) first = x; last = x } }
      const xb: [number, number] | null = first >= 0 ? [first, last] : xbounds(by0, by1)
      if (!xb) return null
      branding = { y0: by0, y1: by1, x0: xb[0], x1: xb[1], bg: localBg(by0 - 8, by1 + 8) }
    }

    let cap: Zone | null = null
    if (captionBlk) {
      const [cy0, cy1] = captionBlk
      let xc = xbounds(cy0, cy1, 0.006)
      if (!xc) xc = branding ? [branding.x0, branding.x1] : [xLo, xHi]
      cap = { y0: cy0, y1: cy1, x0: xc[0], x1: xc[1], bg: localBg(cy0 - 6, cy1 + 6) }
    }

    if (!branding && !cap) return null

    // 3) faixa estática ABAIXO do vídeo → patches de cobertura (sem redesenho)
    const bottom: Zone[] = []
    if (H - vy1 > H * 0.04) {
      const bot = analyze(midFrame, vy1 + 2, H, xLo, xHi, H)
      if (bot) {
        const bContentAt = (y: number, x: number) => bot.content[(y - bot.yStart) * bot.bw + (x - xLo)]
        for (const [a, b] of bot.blocks) {
          let first = -1, last = -1
          for (let x = xLo; x < xHi; x++) { let s = 0; for (let y = a; y < b; y++) s += bContentAt(y, x); if (s / (b - a) > 0.008) { if (first < 0) first = x; last = x } }
          if (first < 0) continue
          const rs: number[] = [], gs: number[] = [], bs: number[] = []
          for (let y = a; y < b; y++) { const base = y * W; for (let x = xLo; x < xHi; x++) { if (!bContentAt(y, x)) { const o = (base + x) * 3; rs.push(midFrame.data[o]); gs.push(midFrame.data[o + 1]); bs.push(midFrame.data[o + 2]) } } }
          const bg: RGB = rs.length ? [Math.round(median(rs)), Math.round(median(gs)), Math.round(median(bs))] : [0, 0, 0]
          bottom.push({ y0: a, y1: b, x0: first, x1: last, bg })
        }
      }
    }

    const refBg = (branding || cap!).bg
    // volta as coordenadas para a escala ORIGINAL do vídeo (detecção foi
    // feita em resolução reduzida)
    const sx = origW / W, sy = origH / H
    const zx = (z: Zone): Zone => ({
      y0: Math.round(z.y0 * sy), y1: Math.round(z.y1 * sy),
      x0: Math.round(z.x0 * sx), x1: Math.round(z.x1 * sx), bg: z.bg,
    })
    return {
      w: origW, h: origH,
      videoTop: Math.round(vy0 * sy), videoBottom: Math.round(vy1 * sy), bg: refBg,
      branding: branding ? zx(branding) : null,
      caption: cap ? zx(cap) : null,
      labels: labels.map(([a, b]) => ({ y0: Math.round(a * sy), y1: Math.round(b * sy) })),
      bottom: bottom.map(zx),
    }
  } catch (e) {
    return null
  } finally {
    fs.rmSync(tmpdir, { recursive: true, force: true })
  }
}

// ---------------------------------------------------------------------------
// Overlay (PNG transparente WxH) que cobre a marca antiga e desenha o perfil novo
// ---------------------------------------------------------------------------

// largura aproximada de texto (sem métricas reais de fonte no SVG server-side)
const isEmoji = (cp: number) => cp >= 0x1F000 || (cp >= 0x2600 && cp <= 0x27BF) || (cp >= 0x2190 && cp <= 0x21FF) || cp === 0xFE0F || cp === 0x200D || cp === 0x20E3 || (cp >= 0x1F1E6 && cp <= 0x1F1FF)
function measure(text: string, size: number, bold: boolean): number {
  let w = 0
  for (const ch of text) {
    const cp = ch.codePointAt(0)!
    w += isEmoji(cp) ? size : size * (bold ? 0.58 : 0.55)
  }
  return w
}
function wrapText(text: string, size: number, maxW: number, maxLines = 8): string[] {
  const lines: string[] = []
  for (const raw of (text || '').split(/\r?\n/)) {
    let cur = ''
    for (const word of raw.split(' ')) {
      const cand = (cur + ' ' + word).trim()
      if (measure(cand, size, false) <= maxW || !cur) cur = cand
      else { lines.push(cur); cur = word }
    }
    lines.push(cur)
  }
  if (lines.length > maxLines) { lines.length = maxLines; lines[maxLines - 1] = lines[maxLines - 1].replace(/\s+$/, '') + '…' }
  return lines
}

const rgb = (c: RGB) => `rgb(${c[0]},${c[1]},${c[2]})`
const FONT = "font-family=\"'DejaVu Sans','Segoe UI',Roboto,Arial,sans-serif\""

function badgeSvg(x: number, y: number, size: number): string {
  const s = size
  return `<g transform="translate(${x},${y})">
    <circle cx="${s / 2}" cy="${s / 2}" r="${s / 2}" fill="${BADGE_BLUE}"/>
    <polyline points="${s * 0.26},${s * 0.52} ${s * 0.44},${s * 0.70} ${s * 0.76},${s * 0.32}" fill="none" stroke="#fff" stroke-width="${s * 0.10}" stroke-linecap="round" stroke-linejoin="round"/>
  </g>`
}

async function avatarSvg(avatarPath: string | null, cx: number, cy: number, dia: number, name: string, uid: string): Promise<string> {
  const r = dia / 2
  if (avatarPath && fs.existsSync(avatarPath)) {
    try {
      const buf = await sharp(avatarPath).resize(dia, dia, { fit: 'cover' }).png().toBuffer()
      const uri = `data:image/png;base64,${buf.toString('base64')}`
      return `<clipPath id="av${uid}"><circle cx="${cx + r}" cy="${cy + r}" r="${r}"/></clipPath>
        <image href="${uri}" x="${cx}" y="${cy}" width="${dia}" height="${dia}" clip-path="url(#av${uid})"/>`
    } catch { /* cai no inicial */ }
  }
  const initial = escXml((name.trim()[0] || '?').toUpperCase())
  return `<circle cx="${cx + r}" cy="${cy + r}" r="${r}" fill="#3B82F6"/>
    <text x="${cx + r}" y="${cy + r + dia * 0.18}" ${FONT} font-size="${Math.round(dia * 0.5)}" font-weight="700" fill="#fff" text-anchor="middle">${initial}</text>`
}

export interface ReskinProfile { name: string; handle: string; verified: boolean }

export async function buildReskinOverlay(
  layout: ReskinLayout, profile: ReskinProfile, avatarPath: string | null, caption: string, outDir: string,
): Promise<string> {
  const W = layout.w, H = layout.h
  const branding = layout.branding, cap = layout.caption
  const refBg: RGB = (branding || cap || { bg: layout.bg }).bg || layout.bg || [0, 0, 0]
  const lum = 0.299 * refBg[0] + 0.587 * refBg[1] + 0.114 * refBg[2]
  const theme = lum < 128 ? THEMES.dark : THEMES.light

  const name = (profile.name || 'Usuário').trim().slice(0, 40)
  const handle = (profile.handle || 'usuario').trim().replace(/^@+/, '').slice(0, 32)
  const verified = profile.verified

  const padX = Math.max(12, Math.round(W * 0.03))
  const padY = Math.max(10, Math.round(H * 0.008))
  let dia = Math.max(48, Math.round(H * 0.056))
  const anchorX = branding ? branding.x0 : (cap ? cap.x0 : Math.round(W * 0.1))

  const parts: string[] = []
  const uid = crypto.randomBytes(3).toString('hex')
  // baseline aproximado: topo + ascent (~0.8 do corpo)
  const baseline = (topY: number, size: number) => topY + size * 0.8

  if (branding) {
    const { x0: bx0, x1: bx1, y0: by0, y1: by1 } = branding
    const zoneH = by1 - by0
    if (zoneH < dia) dia = Math.max(40, zoneH)
    const fName = Math.max(18, Math.round(dia * 0.40))
    const fHandle = Math.max(14, Math.round(dia * 0.33))
    const tx = bx0 + dia + Math.max(10, Math.round(dia * 0.26))
    const nw = measure(name, fName, true)
    const hw = measure(`@${handle}`, fHandle, false)
    const badgeW = verified ? Math.round(dia * 0.5) : 0
    const needX1 = Math.round(tx + Math.max(nw + badgeW, hw)) + padX

    const covX0 = bx0 <= W * 0.09 ? 0 : bx0 - padX
    const covY0 = by0 <= H * 0.25 ? 0 : by0 - padY
    const covX1 = bx1 >= W * 0.91 ? W : Math.max(bx1 + padX, needX1)
    parts.push(`<rect x="${covX0}" y="${covY0}" width="${covX1 - covX0}" height="${(by1 + padY) - covY0}" fill="${rgb(branding.bg)}"/>`)

    const ay = by0 + Math.max(0, Math.floor((zoneH - dia) / 2))
    parts.push(await avatarSvg(avatarPath, bx0, ay, dia, name, uid))
    const nameY = ay + Math.max(0, Math.round(dia * 0.04))
    parts.push(`<text x="${tx}" y="${baseline(nameY, fName)}" ${FONT} font-size="${fName}" font-weight="700" fill="${theme.text}">${escXml(name)}</text>`)
    if (verified) {
      const bs = Math.max(12, Math.round(dia * 0.37))
      parts.push(badgeSvg(Math.round(tx + nw + dia * 0.11), nameY + Math.round(dia * 0.07), bs))
    }
    parts.push(`<text x="${tx}" y="${baseline(ay + Math.round(dia * 0.50), fHandle)}" ${FONT} font-size="${fHandle}" fill="${theme.muted}">@${escXml(handle)}</text>`)
    if (bx1 > W * 0.8) {
      const fMenu = Math.max(14, Math.round(dia * 0.37))
      const mw = measure('···', fMenu, true)
      parts.push(`<text x="${bx1 - mw}" y="${baseline(ay + Math.max(0, Math.round(dia * 0.02)), fMenu)}" ${FONT} font-size="${fMenu}" font-weight="700" fill="${theme.muted}">···</text>`)
    }
  }

  // legenda — só se o usuário digitou; vazio mantém a original do vídeo
  if (caption.trim()) {
    let limitY = layout.videoTop - Math.max(6, Math.round(H * 0.004))
    for (const lb of layout.labels) limitY = Math.min(limitY, lb.y0 - Math.max(6, Math.round(H * 0.004)))
    let cy0: number | null = null, cx0 = 0, origX1 = 0, origY1 = 0, cbg: RGB = [0, 0, 0]
    if (cap) { cy0 = cap.y0; cx0 = cap.x0; origX1 = cap.x1; origY1 = cap.y1; cbg = cap.bg }
    else if (branding) { cy0 = branding.y1 + padY * 2; cx0 = anchorX; origX1 = W - anchorX; origY1 = cy0; cbg = branding.bg }
    if (cy0 != null && limitY - cy0 >= H * 0.018) {
      const maxW = cx0 < W / 2 ? Math.round(W - 2 * cx0) : Math.round(W * 0.8)
      let size = Math.max(16, Math.round(dia * 0.40))
      let lines: string[] = [], lineH = 0
      while (size >= 16) {
        lines = wrapText(caption, size, maxW)
        lineH = Math.round(size * 1.35)
        if (cy0 + lines.length * lineH <= limitY || size <= 16) break
        size -= 3
      }
      const coverY1 = Math.min(Math.max(origY1, cy0 + lines.length * lineH), limitY)
      const rectX1 = Math.max(origX1 + padX, cx0 + maxW + padX)
      parts.push(`<rect x="${cx0 - padX}" y="${cy0 - padY}" width="${rectX1 - (cx0 - padX)}" height="${(coverY1 + padY) - (cy0 - padY)}" fill="${rgb(cbg)}"/>`)
      let yy = cy0
      for (const ln of lines) {
        if (yy + lineH > limitY) break
        parts.push(`<text x="${cx0}" y="${baseline(yy, size)}" ${FONT} font-size="${size}" fill="${theme.text}">${escXml(ln)}</text>`)
        yy += lineH
      }
    }
  }

  // marcas abaixo do vídeo: apenas apagadas com a cor local do fundo
  for (const b of layout.bottom) {
    parts.push(`<rect x="${b.x0 - 10}" y="${b.y0 - 8}" width="${(b.x1 + 10) - (b.x0 - 10)}" height="${(b.y1 + 8) - (b.y0 - 8)}" fill="${rgb(b.bg)}"/>`)
  }

  const svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">${parts.join('')}</svg>`
  const p = path.join(outDir, `reskin_${uid}.png`)
  await sharp(Buffer.from(svg)).png().toFile(p)
  return p
}

// ---------------------------------------------------------------------------
// Composição: sobrepõe o patch estático no vídeo inteiro (vídeo interno intocado)
// ---------------------------------------------------------------------------
export async function composeReskinVideo(videoPath: string, overlayPng: string, outPath: string, spec?: UniquifySpec): Promise<void> {
  const s = spec ?? NEUTRAL
  const withAudio = await hasAudio(videoPath)
  // vídeo inteiro (card embutido) + overlay do perfil novo → jitter de cor/grão
  // e velocidade; SEM espelho/zoom (inverteria/cortaria o card já embutido)
  const colorOps: string[] = []
  if (s.brightness || s.contrast !== 1 || s.saturation !== 1)
    colorOps.push(`eq=brightness=${s.brightness}:contrast=${s.contrast}:saturation=${s.saturation}`)
  if (s.hue) colorOps.push(`hue=h=${s.hue}`)
  if (s.noise) colorOps.push(`noise=alls=${s.noise}:allf=t`)
  const vchain = ['[0:v][1:v]overlay=0:0:format=auto', ...colorOps, 'format=yuv420p', speedSetpts(s)].join(',')
  const parts = [`${vchain}[outv]`]
  const maps = ['-map', '[outv]']
  if (withAudio) { parts.push(`[0:a]${audioChain(s)}[outa]`); maps.push('-map', '[outa]') }
  else maps.push('-map', '0:a?')
  await runFfmpeg([
    '-i', videoPath,
    '-loop', '1', '-i', overlayPng,
    '-filter_complex', parts.join(';'),
    ...maps,
    ...encodeArgs(s),
    outPath,
  ])
}

export async function composeReskinFrame(videoPath: string, overlayPng: string, stillTime: number, outPath: string): Promise<void> {
  await runFfmpeg([
    '-ss', stillTime.toFixed(2), '-i', videoPath,
    '-loop', '1', '-i', overlayPng,
    '-filter_complex', '[0:v][1:v]overlay=0:0:format=auto[outv]',
    '-map', '[outv]', '-frames:v', '1', '-q:v', '3',
    outPath,
  ])
}
