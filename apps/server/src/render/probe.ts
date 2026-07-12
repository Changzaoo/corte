import { spawn } from 'node:child_process'
import ffmpegPath from 'ffmpeg-static'

export const FFMPEG = (ffmpegPath as unknown as string) || 'ffmpeg'

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

export function runFfmpeg(args: string[], onProgress?: (line: string) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(FFMPEG, ['-hide_banner', '-y', ...args])
    let err = ''
    p.stderr.on('data', (d) => { const s = d.toString(); err += s; onProgress?.(s) })
    p.on('error', reject)
    p.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`ffmpeg falhou (código ${code}): ${err.slice(-500)}`))
    })
  })
}
