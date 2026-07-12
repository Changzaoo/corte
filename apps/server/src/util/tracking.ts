import type { Request } from 'express'
import crypto from 'node:crypto'
import { UAParser } from 'ua-parser-js'
import { config } from '../config.js'

/** First public IP from the proxy chain (Render/Vercel set x-forwarded-for). */
export function clientIp(req: Request): string {
  const fwd = req.get('x-forwarded-for')?.split(',')[0]?.trim()
  const ip = fwd || req.ip || req.socket.remoteAddress || ''
  return ip.replace(/^::ffff:/, '') || 'desconhecido'
}

export interface ParsedAgent { os: string; browser: string; deviceType: string }

export function parseAgent(ua: string): ParsedAgent {
  const p = new UAParser(ua || '')
  const os = p.getOS()
  const br = p.getBrowser()
  const dev = p.getDevice()
  const osName = [os.name, os.version].filter(Boolean).join(' ') || 'Desconhecido'
  const brName = [br.name, br.version?.split('.')[0]].filter(Boolean).join(' ') || 'Desconhecido'
  const type = dev.type || (/(mobile|android|iphone)/i.test(ua) ? 'mobile' : 'desktop')
  return { os: osName, browser: brName, deviceType: type }
}

export function deviceIdFromReq(req: Request): { raw: string | null; hash: string | null; name: string | null } {
  const raw = (req.get('x-corte-device-id') || '').trim() || null
  const name = (req.get('x-corte-device-name') || '').trim() || null
  const hash = raw
    ? crypto.createHash('sha256').update(`${config.deviceHashSecret}:${raw}`).digest('hex').slice(0, 32)
    : null
  return { raw, hash, name }
}

const PRIVATE = /^(10\.|127\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1|fc|fd|localhost|desconhecido)/i

export interface GeoInfo { location: string | null; city: string | null; region: string | null; country: string | null }

/** Edge headers first (Vercel/Cloudflare), then ipapi.co fallback. */
export async function geolocate(req: Request, ip: string): Promise<GeoInfo> {
  const country = req.get('x-vercel-ip-country') || req.get('cf-ipcountry') || null
  const city = req.get('x-vercel-ip-city') || null
  const region = req.get('x-vercel-ip-country-region') || null
  if (country || city) {
    const location = [city && decodeURIComponent(city), region, country].filter(Boolean).join(', ') || null
    return { location, city: city ? decodeURIComponent(city) : null, region, country }
  }
  if (PRIVATE.test(ip)) return { location: 'Rede local', city: null, region: null, country: null }
  if (!config.geoLookup) return { location: null, city: null, region: null, country: null }
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 1500)
    const res = await fetch(`https://ipapi.co/${encodeURIComponent(ip)}/json/`, { signal: ctrl.signal })
    clearTimeout(t)
    if (!res.ok) throw new Error('geo http')
    const j = (await res.json()) as { city?: string; region?: string; country_name?: string; country?: string }
    const c = j.country_name || j.country || null
    const location = [j.city, j.region, c].filter(Boolean).join(', ') || null
    return { location, city: j.city || null, region: j.region || null, country: c }
  } catch {
    return { location: null, city: null, region: null, country: null }
  }
}
