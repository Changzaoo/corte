// Anti-detecção do TikTok (e afins): os detectores de conteúdo não-original
// casam o vídeo por fingerprint VISUAL (hash perceptual dos frames) + fingerprint
// de ÁUDIO. O card por cima não altera o vídeo-fonte embaixo — o hash bate com o
// original e o vídeo cai em "não se qualifica para recomendação".
//
// Aqui geramos, POR CLIPE, um conjunto de transformações imperceptíveis que
// quebram os dois fingerprints: espelho, micro-zoom/enquadramento, jitter de
// cor, grão, deslocamento de pitch (preservando a duração → sem dessincronizar)
// e micro mudança de velocidade + encode randomizado. Cada saída fica com uma
// assinatura diferente. Desligável com UNIQUIFY=0.

export interface UniquifySpec {
  mirror: boolean      // espelho horizontal (só a mídia interna no modo card)
  speed: number        // 0.97..1.03 — muda timing de frame + tempo do áudio
  pitch: number        // 0.96..1.04 — desloca o pitch preservando a duração
  brightness: number   // -0.03..0.03
  contrast: number     // 0.97..1.04
  saturation: number   // 0.95..1.07
  hue: number          // -5..5 graus
  zoom: number         // 1.00..1.03 — zoom+crop = enquadramento deslocado
  noise: number        // 0..7 — grão temporal leve
  crf: number          // 19..23
  keyint: number       // 48..120 — GOP randomizado
  abr: number          // 120..160 kbps áudio
}

const enabled = () => process.env.UNIQUIFY !== '0'
const rnd = (a: number, b: number) => a + Math.random() * (b - a)
const r3 = (a: number, b: number) => +rnd(a, b).toFixed(3)
const r4 = (a: number, b: number) => +rnd(a, b).toFixed(4)

/** Spec neutra (identidade) — usada no preview para ficar fiel ao estilo sem
 *  aplicar as transformações (o preview é só conferência de card/legenda). */
export const NEUTRAL: UniquifySpec = {
  mirror: false, speed: 1, pitch: 1, brightness: 0, contrast: 1, saturation: 1,
  hue: 0, zoom: 1, noise: 0, crf: 20, keyint: 60, abr: 128,
}

/** Gera uma assinatura aleatória. allowMirror=false no reskin (espelhar
 *  inverteria o card já embutido no vídeo). */
export function randomUniquify(opts?: { allowMirror?: boolean }): UniquifySpec {
  if (!enabled()) return NEUTRAL
  return {
    mirror: (opts?.allowMirror ?? true) && Math.random() < 0.5,
    speed: r4(0.97, 1.03),
    pitch: r4(0.96, 1.04),
    brightness: r3(-0.03, 0.03),
    contrast: r3(0.97, 1.04),
    saturation: r3(0.95, 1.07),
    hue: +rnd(-5, 5).toFixed(1),
    zoom: r4(1.0, 1.03),
    noise: Math.round(rnd(2, 7)),
    crf: Math.round(rnd(19, 23)),
    keyint: Math.round(rnd(48, 120)),
    abr: Math.round(rnd(120, 160)),
  }
}

/** Operações de filtro aplicadas à MÍDIA interna (antes de virar [m0]).
 *  O zoom é tratado pelo chamador (precisa de MW/MH). */
export function mediaColorOps(s: UniquifySpec): string {
  const ops: string[] = []
  if (s.mirror) ops.push('hflip')
  if (s.brightness || s.contrast !== 1 || s.saturation !== 1)
    ops.push(`eq=brightness=${s.brightness}:contrast=${s.contrast}:saturation=${s.saturation}`)
  if (s.hue) ops.push(`hue=h=${s.hue}`)
  if (s.noise) ops.push(`noise=alls=${s.noise}:allf=t`)
  return ops.length ? ',' + ops.join(',') : ''
}

/** zoom+crop centrado — mantém o tamanho MWxMH mas desloca o enquadramento. */
export function zoomOp(s: UniquifySpec, mw: number, mh: number): string {
  if (s.zoom <= 1) return ''
  return `,scale=ceil(iw*${s.zoom}/2)*2:ceil(ih*${s.zoom}/2)*2,crop=${mw}:${mh}`
}

/** Cadeia de áudio: desloca o pitch preservando a DURAÇÃO (asetrate→atempo) e
 *  aplica a velocidade geral (casa com o setpts do vídeo → sem dessincronizar). */
export function audioChain(s: UniquifySpec, sr = 44100): string {
  const tempoBack = (1 / s.pitch)
  const parts = [
    `asetrate=${Math.round(sr * s.pitch)}`,
    `aresample=${sr}`,
    `atempo=${tempoBack.toFixed(5)}`,
  ]
  if (s.speed !== 1) parts.push(`atempo=${s.speed.toFixed(5)}`)
  return parts.join(',')
}

/** setpts para a velocidade do vídeo (aplicado no stream final composto). */
export function speedSetpts(s: UniquifySpec): string {
  return s.speed !== 1 ? `setpts=PTS/${s.speed.toFixed(5)}` : 'setpts=PTS'
}

/** Args de encode randomizados + remoção de metadados do original. */
export function encodeArgs(s: UniquifySpec): string[] {
  return [
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', String(s.crf), '-pix_fmt', 'yuv420p',
    '-x264opts', `keyint=${s.keyint}:min-keyint=${Math.max(12, Math.round(s.keyint / 2))}:scenecut=40`,
    '-c:a', 'aac', '-b:a', `${s.abr}k`, '-r', '30', '-shortest',
    '-movflags', '+faststart', '-map_metadata', '-1',
  ]
}
