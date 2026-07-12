import fs from 'node:fs'
import path from 'node:path'
import { config } from './config.js'

export const DATA_DIR = path.resolve(config.dataDir)
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads')
export const AVATAR_DIR = path.join(DATA_DIR, 'avatars')
export const OUTPUT_DIR = path.join(DATA_DIR, 'output')
export const TMP_DIR = path.join(DATA_DIR, 'tmp')
for (const d of [DATA_DIR, UPLOAD_DIR, AVATAR_DIR, OUTPUT_DIR, TMP_DIR]) fs.mkdirSync(d, { recursive: true })

export interface VideoRec {
  id: number; owner: string; title: string; path: string | null; sourceUrl: string | null
  width: number; height: number; duration: number; ready: boolean; error: string | null; createdAt: string
}
export interface JobRec {
  id: number; owner: string; status: 'pending' | 'processing' | 'rendering' | 'done' | 'failed'
  progress: number; stageDetail: string | null; error: string | null; createdAt: string; updatedAt: string
}
export interface ClipRec {
  id: number; jobId: number; owner: string; videoId: number | null; title: string | null
  path: string; category: string | null; createdAt: string
}

let vSeq = 1, jSeq = 1, cSeq = 1
export const videos = new Map<number, VideoRec>()
export const jobs = new Map<number, JobRec>()
export const clips = new Map<number, ClipRec>()

export const nowIso = () => new Date().toISOString()

export function newVideo(owner: string, partial: Partial<VideoRec>): VideoRec {
  const id = vSeq++
  const rec: VideoRec = {
    id, owner, title: partial.title || `Vídeo ${id}`, path: partial.path || null,
    sourceUrl: partial.sourceUrl || null, width: partial.width || 0, height: partial.height || 0,
    duration: partial.duration || 0, ready: partial.ready || false, error: partial.error || null, createdAt: nowIso(),
  }
  videos.set(id, rec)
  return rec
}
export function newJob(owner: string): JobRec {
  const id = jSeq++
  const rec: JobRec = { id, owner, status: 'pending', progress: 0, stageDetail: null, error: null, createdAt: nowIso(), updatedAt: nowIso() }
  jobs.set(id, rec)
  return rec
}
export function updateJob(id: number, patch: Partial<JobRec>) {
  const j = jobs.get(id); if (!j) return
  Object.assign(j, patch, { updatedAt: nowIso() })
}
export function newClip(owner: string, jobId: number, videoId: number | null, title: string | null, filePath: string): ClipRec {
  const id = cSeq++
  const rec: ClipRec = { id, jobId, owner, videoId, title, path: filePath, category: 'tweet', createdAt: nowIso() }
  clips.set(id, rec)
  return rec
}
