import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** Raiz do app instalado (a pasta que contém package.json/apps/scripts).
 *  O vbs do instalador roda o node com cwd = AppDir; em dev o cwd é a raiz do
 *  repo. Fallback: sobe a partir deste arquivo até achar o package.json raiz. */
export function appDir(): string {
  const looksRight = (d: string) => fs.existsSync(path.join(d, 'package.json')) && fs.existsSync(path.join(d, 'apps', 'server'))
  if (looksRight(process.cwd())) return process.cwd()
  let d = path.dirname(fileURLToPath(import.meta.url))
  for (let i = 0; i < 8; i++) {
    if (looksRight(d)) return d
    d = path.dirname(d)
  }
  return process.cwd()
}

/** Sha instalado: version.json (gravado pelo updater) tem prioridade sobre o
 *  build-info.json (carimbado na raiz quando o instalador é compilado). */
export function installedSha(): { sha: string | null; updatedAt: string | null } {
  const root = appDir()
  for (const f of ['version.json', 'build-info.json']) {
    try {
      const j = JSON.parse(fs.readFileSync(path.join(root, f), 'utf8'))
      if (typeof j.sha === 'string' && j.sha) return { sha: j.sha, updatedAt: j.updatedAt || j.builtAt || null }
    } catch { /* próximo */ }
  }
  return { sha: null, updatedAt: null }
}
