import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Dev: /api/* and /ws are proxied to the Noonshift backend (same-origin, no CORS).
// Prod build: set VITE_API_URL / VITE_WS_URL (see src/api/noonshift.ts).
export default defineConfig({
  plugins: [
    tailwindcss(),
    react()
  ],
  server: {
    port: 5174, // the ops dashboard (web/) takes 5173
    proxy: {
      '/api': { target: 'http://localhost:8000', rewrite: (p) => p.replace(/^\/api/, '') },
      '/ws': { target: 'ws://localhost:8000', ws: true },
    },
  },
})
