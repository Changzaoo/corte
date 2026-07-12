/**
 * Grant/revoke the `admin` custom claim for a user by email.
 * Usage:  npm run set-admin -- user@example.com          (grant admin)
 *         npm run set-admin -- user@example.com support   (grant support)
 *         npm run set-admin -- user@example.com user      (reset to user)
 *
 * Note: emails listed in ADMIN_EMAILS are ALWAYS admin regardless of claims.
 */
import '../src/firebase.js'
import { authAdmin, db } from '../src/firebase.js'

async function main() {
  const email = process.argv[2]
  const role = (process.argv[3] || 'admin') as 'admin' | 'support' | 'user'
  if (!email) { console.error('Uso: npm run set-admin -- <email> [admin|support|user]'); process.exit(1) }
  const user = await authAdmin.getUserByEmail(email)
  const claims = { ...(user.customClaims || {}) }
  if (role === 'user') delete (claims as any).role
  else (claims as any).role = role
  await authAdmin.setCustomUserClaims(user.uid, claims)
  await db.collection('users').doc(user.uid).set({ role, updatedAt: new Date().toISOString() }, { merge: true }).catch(() => {})
  console.log(`✓ ${email} (${user.uid}) → role: ${role}`)
  process.exit(0)
}
main().catch((e) => { console.error(e); process.exit(1) })
