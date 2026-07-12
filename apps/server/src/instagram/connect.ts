import fs from 'node:fs'
import path from 'node:path'
import { chromium, type Browser } from 'playwright-core'
import { DATA_DIR } from '../store.js'

/** Arquivo de cookies gerenciado pelo app (login do Instagram via botão). */
export function managedCookiesPath(): string {
  const dir = path.join(DATA_DIR, 'cookies')
  fs.mkdirSync(dir, { recursive: true })
  return path.join(dir, 'cookies.txt')
}

/** cookies do Playwright → formato Netscape (cookies.txt) que yt-dlp/gallery-dl leem. */
function toNetscape(cookies: Array<{ name: string; value: string; domain: string; path: string; expires: number; secure: boolean }>): string {
  const lines = ['# Netscape HTTP Cookie File', '# Gerado pelo cortes.digital', '']
  for (const c of cookies) {
    const includeSub = c.domain.startsWith('.') ? 'TRUE' : 'FALSE'
    const expires = c.expires && c.expires > 0 ? Math.floor(c.expires) : 0
    lines.push([c.domain, includeSub, c.path || '/', c.secure ? 'TRUE' : 'FALSE', String(expires), c.name, c.value].join('\t'))
  }
  return lines.join('\n') + '\n'
}

async function launchBrowser(): Promise<Browser> {
  // Usa um navegador JÁ instalado (perfil novo, sem a criptografia de cookies do
  // perfil real) — o usuário loga nessa janela e nós lemos a sessão.
  for (const channel of ['msedge', 'chrome', 'chrome-beta', 'msedge-beta']) {
    try { return await chromium.launch({ headless: false, channel }) } catch { /* tenta o próximo */ }
  }
  const brave = 'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe'
  if (fs.existsSync(brave)) return await chromium.launch({ headless: false, executablePath: brave })
  return await chromium.launch({ headless: false }) // chromium do próprio Playwright, se houver
}

// estado do processo de conexão (é interativo/assíncrono)
let running = false
let lastMessage = ''

function igCookieCount(file: string): number {
  try {
    if (!fs.existsSync(file)) return 0
    return fs.readFileSync(file, 'utf8').split('\n')
      .filter((l) => l.trim() && !l.startsWith('#') && /instagram\.com/i.test(l)).length
  } catch { return 0 }
}

export function cookiesStatus(): { connected: boolean; count: number; connecting: boolean; message: string } {
  // conta cookies do IG no arquivo gerenciado OU no YTDLP_COOKIES configurado
  let count = igCookieCount(managedCookiesPath())
  const env = process.env.YTDLP_COOKIES?.trim()
  if (!count && env) count = igCookieCount(env)
  return { connected: count > 0, count, connecting: running, message: lastMessage }
}

/** Abre o navegador para o login do Instagram e, ao detectar a sessão, salva os
 *  cookies. Roda em segundo plano; o front acompanha por /instagram/status. */
export function startConnectInstagram(): { started: boolean; message: string } {
  if (running) return { started: false, message: 'Já há uma conexão em andamento.' }
  running = true
  lastMessage = 'Abrindo o navegador — faça login no Instagram…'

  void (async () => {
    let browser: Browser | null = null
    try {
      browser = await launchBrowser()
      const ctx = await browser.newContext()
      const page = await ctx.newPage()
      await page.goto('https://www.instagram.com/accounts/login/', { waitUntil: 'domcontentloaded', timeout: 60_000 })

      const deadline = Date.now() + 5 * 60_000 // até 5 min para o login
      let ok = false
      while (Date.now() < deadline) {
        const cookies = await ctx.cookies('https://www.instagram.com').catch(() => [])
        if (cookies.some((c) => c.name === 'sessionid' && c.value)) { ok = true; break }
        await page.waitForTimeout(1500).catch(() => { throw new Error('janela fechada') })
      }
      if (!ok) throw new Error('Login não detectado (tempo esgotado).')

      await page.waitForTimeout(1200)
      const all = await ctx.cookies()
      const ig = all.filter((c) => c.domain.includes('instagram.com'))
      fs.writeFileSync(managedCookiesPath(), toNetscape(ig), 'utf8')
      lastMessage = `Instagram conectado — ${ig.length} cookies salvos.`
    } catch (e) {
      lastMessage = e instanceof Error ? e.message : 'Falha ao conectar o Instagram.'
    } finally {
      running = false
      if (browser) await browser.close().catch(() => {})
    }
  })()

  return { started: true, message: lastMessage }
}
