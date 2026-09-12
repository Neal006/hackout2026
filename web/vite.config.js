import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Dev: /api/* and /ws are proxied to the FastAPI backend so the app is same-origin.
// Prod build: set VITE_API_URL (see src/context/GlobalStateContext.jsx).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:8000', rewrite: (p) => p.replace(/^\/api/, '') },
      '/ws': { target: 'ws://localhost:8000', ws: true },
    },
  },
})
