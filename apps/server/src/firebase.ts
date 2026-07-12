import admin from 'firebase-admin'
import { config } from './config.js'

function loadServiceAccount(): admin.ServiceAccount | null {
  // 1) full JSON, base64-encoded (preferred for env-vars — no newline issues)
  if (config.firebase.serviceAccountB64) {
    try {
      const json = JSON.parse(Buffer.from(config.firebase.serviceAccountB64, 'base64').toString('utf8'))
      return {
        projectId: json.project_id,
        clientEmail: json.client_email,
        privateKey: json.private_key,
      }
    } catch (e) {
      console.error('[firebase] failed to parse FIREBASE_SERVICE_ACCOUNT_B64:', e)
    }
  }
  // 2) individual fields
  if (config.firebase.clientEmail && config.firebase.privateKey) {
    return {
      projectId: config.firebase.projectId,
      clientEmail: config.firebase.clientEmail,
      privateKey: config.firebase.privateKey.replace(/\\n/g, '\n'),
    }
  }
  return null
}

if (!admin.apps.length) {
  const sa = loadServiceAccount()
  if (sa) {
    admin.initializeApp({
      credential: admin.credential.cert(sa),
      projectId: config.firebase.projectId,
    })
    console.log('[firebase] initialized with service account for', config.firebase.projectId)
  } else {
    // Falls back to ADC — will fail at call time if no creds are present, but
    // lets the process boot so health checks pass.
    admin.initializeApp({ projectId: config.firebase.projectId })
    console.warn('[firebase] no service account found — admin/auth features disabled until creds are set')
  }
}

export const authAdmin = admin.auth()
export const db = admin.firestore()
try { db.settings({ ignoreUndefinedProperties: true }) } catch { /* already set */ }
export { admin }
