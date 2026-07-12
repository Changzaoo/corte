import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider } from 'firebase/auth'

// Firebase WEB config is public by design (the apiKey only identifies the
// project; security is enforced by Auth rules + backend token verification).
// Values come from VITE_FIREBASE_* env with a safe fallback to the project.
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyAVtAUs3Fa6YI5l8hPLD7Qow5tNE-bYeLw',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'corte-69134.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'corte-69134',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'corte-69134.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '421353469226',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:421353469226:web:a1ca884243c03d7a41da53',
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || 'G-FHHCEQ013M',
}

export const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
export const googleProvider = new GoogleAuthProvider()
