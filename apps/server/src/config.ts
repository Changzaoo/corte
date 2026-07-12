import 'dotenv/config'

const bool = (v: string | undefined, def = false) =>
  v == null ? def : ['1', 'true', 'yes', 'on'].includes(v.toLowerCase())

export const config = {
  port: Number(process.env.PORT || 4000),
  nodeEnv: process.env.NODE_ENV || 'development',

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
