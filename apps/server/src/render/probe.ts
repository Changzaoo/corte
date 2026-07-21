import { spawn } from 'node:child_process'
import os from 'node:os'
import ffmpegPath from 'ffmpeg-static'

export const FFMPEG = (ffmpegPath as unknown as string) || 'ffmpeg'

/** Anti-sufocamento: roda o processo em prioridade BAIXA para o PC do usuário
 *  continuar usável durante renders/downloads pesados. Best-effort. */
export function lowerPriority(pid: number | undefined): void {
  if (!pid) return
  try { os.setPriority(pid, os.constants.priority.PRIORITY_BELOW_NORMAL) } catch { /* já saiu */ }
}

export interface Probe { width: number; height: number; duration: number }

/** Probe dimensions + duration using the ffmpeg binary (no ffprobe needed) —
 *  parsed from ffmpeg's stderr banner. */
export function probeVideo(input: string): Promise<Probe> {
  return new Promise((resolve, reject) => {
    const p = spawn(FFMPEG, ['-hide_banner', '-i', input])
    let err = ''
    p.stderr.on('data', (d) => { err += d.toString() })
    p.on('error', reject)
    p.on('close', () => {
      const dim = err.match(/Video:.*?(\d{2,5})x(\d{2,5})/)
      const dur = err.match(/Duration:\s*(\d+):(\d+):(\d+\.?\d*)/)
      const width = dim ? Number(dim[1]) : 0
      const height = dim ? Number(dim[2]) : 0
      const duration = dur ? Number(dur[1]) * 3600 + Number(dur[2]) * 60 + Number(dur[3]) : 0
      if (!width || !height) return reject(new Error('não foi possível ler o vídeo (formato inválido?)'))
      resolve({ width, height, duration })
    })
  })
}

/** true se o vídeo tem faixa de áudio (parseia o banner do ffmpeg). Usado para
 *  aplicar a cadeia de áudio anti-detecção só quando há som. */
export function hasAudio(input: string): Promise<boolean> {
  return new Promise((resolve) => {
    const p = spawn(FFMPEG, ['-hide_banner', '-i', input])
    let err = ''
    p.stderr.on('data', (d) => { err += d.toString() })
    p.on('error', () => resolve(false))
    p.on('close', () => resolve(/\bAudio:/.test(err)))
  })
}

export function runFfmpeg(args: string[], onProgress?: (line: string) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(FFMPEG, ['-hide_banner', '-y', ...args])
    lowerPriority(p.pid)
    let err = ''
    p.stderr.on('data', (d) => { const s = d.toString(); err += s; onProgress?.(s) })
    p.on('error', reject)
    p.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`ffmpeg falhou (código ${code}): ${err.slice(-500)}`))
    })
  })
}
