import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import sharp from 'sharp'
import { TMP_DIR } from '../store.js'
import { runFfmpeg } from './probe.js'
import { detectExistingCard, buildReskinOverlay, composeReskinVideo, composeReskinFrame } from './reskin.js'

const W = 1080, H = 1920

export type CardMode = 'auto' | 'card' | 'reskin'
export interface RenderProfile { name: string; handle: string; verified: boolean; avatarPath: string | null }
export interface RenderStyle { card: 'light' | 'dark'; hook?: string; bg?: string }
export interface RenderOpts {
  videoPath: string; srcW: number; srcH: number; duration: number
  caption: string; profile: RenderProfile; style: RenderStyle
  cardMode?: CardMode
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

function wrap(text: string, maxChars: number): string[] {
  const out: string[] = []
  for (const para of text.split(/\r?\n/)) {
    if (!para.trim()) { out.push(''); continue }
    let line = ''
    for (const word of para.split(/\s+/)) {
      if ((line + ' ' + word).trim().length > maxChars) {
        if (line) out.push(line)
        line = word.length > maxChars ? word.slice(0, maxChars) : word
      } else line = (line ? line + ' ' : '') + word
    }
    if (line) out.push(line)
  }
  return out.slice(0, 8)
}

interface Layout { MW: number; MH: number; MX: number; MY: number }

async function buildCard(opts: RenderOpts): Promise<{ cardPath: string; maskPath: string } & Layout> {
  const light = opts.style.card !== 'dark'
  const cardBg = light ? '#ffffff' : '#16181c'
  const nameCol = light ? '#0f1419' : '#e7e9ea'
  const handleCol = '#536471'
  const capCol = light ? '#0f1419' : '#e7e9ea'
  const font = "font-family=\"'DejaVu Sans','Segoe UI',Roboto,Arial,sans-serif\""

  const hook = (opts.style.hook || '').trim()
  const hookH = hook ? 104 : 0
  const pad = 34
  const margin = 40
  const cardX = margin, cardW = W - margin * 2
  const avatarD = 88, avatarR = avatarD / 2

  const capLines = opts.caption.trim() ? wrap(opts.caption.trim(), 46) : []
  const capFs = 36, capLh = 48
  const captionH = capLines.length * capLh

  // media area follows source aspect, capped so the card stays sensible
  const MW = cardW - pad * 2
  const ratio = opts.srcH && opts.srcW ? opts.srcH / opts.srcW : 1
  const MH = Math.min(Math.max(Math.round(MW * ratio), 420), 1180)
  const headerH = avatarD

  const cardH = pad + headerH + 24 + captionH + (captionH ? 24 : 8) + MH + pad
  const cardTop = hookH + Math.max(24, Math.round((H - hookH - cardH) / 2))
  const contentTop = cardTop + pad

  const avatarCx = cardX + pad + avatarR
  const avatarCy = contentTop + avatarR
  const textX = cardX + pad + avatarD + 22
  const nameY = contentTop + 40
  const handleY = contentTop + 78
  const capTop = contentTop + headerH + 24 + capFs
  const MX = cardX + pad
  const MY = cardTop + pad + headerH + 24 + captionH + (captionH ? 24 : 8)

  // avatar: embedded image (circle-clipped) or a colored initial
  let avatarSvg = ''
  if (opts.profile.avatarPath && fs.existsSync(opts.profile.avatarPath)) {
    const buf = await sharp(opts.profile.avatarPath).resize(avatarD, avatarD, { fit: 'cover' }).png().toBuffer()
    const uri = `data:image/png;base64,${buf.toString('base64')}`
    avatarSvg = `<clipPath id="av"><circle cx="${avatarCx}" cy="${avatarCy}" r="${avatarR}"/></clipPath>
      <image href="${uri}" x="${avatarCx - avatarR}" y="${avatarCy - avatarR}" width="${avatarD}" height="${avatarD}" clip-path="url(#av)"/>`
  } else {
    const initial = esc((opts.profile.name.trim()[0] || '?').toUpperCase())
    avatarSvg = `<circle cx="${avatarCx}" cy="${avatarCy}" r="${avatarR}" fill="#1d9bf0"/>
      <text x="${avatarCx}" y="${avatarCy + 14}" ${font} font-size="40" font-weight="700" fill="#ffffff" text-anchor="middle">${initial}</text>`
  }

  const nameEsc = esc(opts.profile.name.trim() || 'Usuário')
  const nameW = Math.min(nameEsc.length * 20, cardW - avatarD - pad * 3 - 60)
  const badge = opts.profile.verified
    ? `<g transform="translate(${textX + nameW + 12}, ${nameY - 26})">
         <circle cx="15" cy="15" r="15" fill="#1d9bf0"/>
         <path d="M8 15 l4 4 l8 -9" stroke="#ffffff" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
       </g>` : ''

  const captionSvg = capLines.map((l, i) =>
    `<text x="${cardX + pad}" y="${capTop + i * capLh}" ${font} font-size="${capFs}" fill="${capCol}">${esc(l)}</text>`
  ).join('\n')

  const hookSvg = hook ? `
    <rect x="0" y="0" width="${W}" height="${hookH}" fill="#1d9bf0"/>
    <text x="${W / 2}" y="${hookH / 2 + 20}" ${font} font-size="52" font-weight="800" fill="#ffffff" text-anchor="middle">${esc(hook.slice(0, 60))}</text>
  ` : ''

  const svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
    ${hookSvg}
    <rect x="${cardX}" y="${cardTop}" width="${cardW}" height="${cardH}" rx="32" ry="32" fill="${cardBg}"/>
    ${avatarSvg}
    <text x="${textX}" y="${nameY}" ${font} font-size="38" font-weight="700" fill="${nameCol}">${nameEsc}</text>
    ${badge}
    <text x="${textX}" y="${handleY}" ${font} font-size="32" fill="${handleCol}">@${esc(opts.profile.handle.trim() || 'usuario')}</text>
    ${captionSvg}
    <rect x="${MX}" y="${MY}" width="${MW}" height="${MH}" rx="24" ry="24" fill="#000000"/>
  </svg>`

  const maskSvg = `<svg width="${MW}" height="${MH}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${MW}" height="${MH}" fill="#000000"/>
    <rect x="0" y="0" width="${MW}" height="${MH}" rx="24" ry="24" fill="#ffffff"/>
  </svg>`

  const tag = crypto.randomBytes(6).toString('hex')
  const cardPath = path.join(TMP_DIR, `card_${tag}.png`)
  const maskPath = path.join(TMP_DIR, `mask_${tag}.png`)
  await sharp(Buffer.from(svg)).png().toFile(cardPath)
  await sharp(Buffer.from(maskSvg)).png().toFile(maskPath)
  return { cardPath, maskPath, MW, MH, MX, MY }
}

const isHexColor = (s?: string) => !!s && /^#?[0-9a-fA-F]{6}$/.test(s)

function filterGraph(L: Layout, bg?: string): string {
  const { MW, MH, MX, MY } = L
  // Fundo: 'blur' (desfoque do próprio vídeo) OU uma cor sólida (#RRGGBB).
  const bgLayer = isHexColor(bg)
    ? `color=c=0x${bg!.replace('#', '')}:s=${W}x${H}[bg]`
    : `[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},gblur=sigma=26,eq=brightness=-0.28:saturation=1.08,setsar=1[bg]`
  return [
    bgLayer,
    `[0:v]scale=${MW}:${MH}:force_original_aspect_ratio=increase,crop=${MW}:${MH},setsar=1[m0]`,
    `[2:v]scale=${MW}:${MH},format=gray[mk]`,
    `[m0][mk]alphamerge[med]`,
    `[bg][1:v]overlay=0:0:format=auto[c1]`,
    `[c1][med]overlay=${MX}:${MY}:format=auto[vout]`,
  ].join(';')
}

/** Reskin (troca só o perfil num card já embutido no vídeo) quando o modo pede
 *  e a detecção encontra um card. Retorna o PNG do overlay + layout, ou null. */
async function tryReskin(opts: RenderOpts): Promise<{ overlayPath: string } | null> {
  const mode = opts.cardMode || 'auto'
  if (mode === 'card') return null
  const layout = await detectExistingCard(opts.videoPath)
  if (!layout) return null
  const overlayPath = await buildReskinOverlay(
    layout,
    { name: opts.profile.name, handle: opts.profile.handle, verified: opts.profile.verified },
    opts.profile.avatarPath, opts.caption, TMP_DIR,
  )
  return { overlayPath }
}

/** Full render → mp4 at outPath. */
export async function renderTweetVideo(opts: RenderOpts, outPath: string): Promise<void> {
  const rs = await tryReskin(opts)
  if (rs) {
    try { await composeReskinVideo(opts.videoPath, rs.overlayPath, outPath) }
    finally { fs.rm(rs.overlayPath, () => {}) }
    return
  }
  const L = await buildCard(opts)
  try {
    await runFfmpeg([
      '-i', opts.videoPath,
      '-loop', '1', '-i', L.cardPath,
      '-loop', '1', '-i', L.maskPath,
      '-filter_complex', filterGraph(L, opts.style.bg),
      '-map', '[vout]', '-map', '0:a?',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '128k', '-r', '30', '-shortest', '-movflags', '+faststart',
      outPath,
    ])
  } finally {
    fs.rm(L.cardPath, () => {}); fs.rm(L.maskPath, () => {})
  }
}

/** Single frame → jpeg buffer (identical pipeline as the final video). */
export async function renderTweetPreview(opts: RenderOpts): Promise<Buffer> {
  const still = opts.duration > 1 ? Math.min(opts.duration * 0.5, opts.duration - 0.2) : 0
  const rs = await tryReskin(opts)
  if (rs) {
    const out = path.join(TMP_DIR, `prev_${crypto.randomBytes(6).toString('hex')}.jpg`)
    try {
      await composeReskinFrame(opts.videoPath, rs.overlayPath, still, out)
      return await fs.promises.readFile(out)
    } finally {
      fs.rm(rs.overlayPath, () => {}); fs.rm(out, () => {})
    }
  }
  const L = await buildCard(opts)
  const outPath = path.join(TMP_DIR, `prev_${crypto.randomBytes(6).toString('hex')}.jpg`)
  try {
    await runFfmpeg([
      ...(still > 0 ? ['-ss', still.toFixed(2)] : []),
      '-i', opts.videoPath,
      '-loop', '1', '-i', L.cardPath,
      '-loop', '1', '-i', L.maskPath,
      '-filter_complex', filterGraph(L, opts.style.bg),
      '-map', '[vout]', '-frames:v', '1', '-q:v', '3',
      outPath,
    ])
    return await fs.promises.readFile(outPath)
  } finally {
    fs.rm(L.cardPath, () => {}); fs.rm(L.maskPath, () => {}); fs.rm(outPath, () => {})
  }
}
