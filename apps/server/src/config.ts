import { config as loadEnv } from 'dotenv'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

// Carrega o .env de forma robusta, INDEPENDENTE do diretório de trabalho: o app
// instalado roda com o cwd na raiz, mas o .env fica em apps/server/.env. Tenta o
// cwd e também apps/server/.env relativo a este arquivo (dev via src e build via dist).
const _here = path.dirname(fileURLToPath(import.meta.url))
loadEnv()                                              // <cwd>/.env
loadEnv({ path: path.resolve(_here, '../../.env') })   // dist/src -> apps/server/.env
loadEnv({ path: path.resolve(_here, '../.env') })      // src      -> apps/server/.env

const bool = (v: string | undefined, def = false) =>
  v == null ? def : ['1', 'true', 'yes', 'on'].includes(v.toLowerCase())

export const config = {
  port: Number(process.env.PORT || 4000),
  nodeEnv: process.env.NODE_ENV || 'development',

  // LOCAL_MODE: backend rodando na maquina do proprio usuario. Pula a
  // verificacao do Firebase (nao precisa de service account) e trata o usuario
  // local como dono/admin. O pipeline de download/render/entrega roda 100% local.
  localMode: bool(process.env.LOCAL_MODE, false),

  // CORS: comma-separated allowlist of web origins. '*' allows all (dev).
  corsOrigins: (process.env.CORS_ORIGINS || '*')
    .split(',').map((s) => s.trim()).filter(Boolean),

  // Bootstrap admins: these emails are always treated as admin (super-admins),
  // independent of Firebase custom claims. Comma-separated.
  adminEmails: (process.env.ADMIN_EMAILS || 'redcanidsvinicius@gmail.com,perdibitcoin@gmail.com')
    .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
  adminUid: process.env.ADMIN_UID || 'PKrc1M1Fhdceq0Y83BueSMKTPQe2',

  // Server pepper used to hash device ids before storing them.
  deviceHashSecret: process.env.DEVICE_HASH_SECRET || 'corte-dev-device-pepper',

  // Firebase Admin credentials
  firebase: {
    projectId: process.env.FIREBASE_PROJECT_ID || 'corte-69134',
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL || '',
    // private key may arrive with literal \n — normalized in firebase.ts
    privateKey: process.env.FIREBASE_PRIVATE_KEY || '',
    serviceAccountB64: process.env.FIREBASE_SERVICE_ACCOUNT_B64 || '',
  },

  // enable IP geolocation lookups via ipapi.co (public IPs only)
  geoLookup: bool(process.env.GEO_LOOKUP, true),

  // filesystem roots for uploads / rendered clips (ephemeral on Render)
  dataDir: process.env.DATA_DIR || '.data',
}

export const isAdminEmail = (email: string | null | undefined) =>
  !!email && config.adminEmails.includes(email.toLowerCase())
