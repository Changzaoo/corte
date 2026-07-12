import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The web app talks to the backend via VITE_API_URL (set in .env / Vercel).
// In dev we also proxy /api → localhost:4000 as a convenience.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:4000', changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
})
