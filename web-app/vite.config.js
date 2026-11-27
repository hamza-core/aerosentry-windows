import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The dev server runs on 5173, which the backend's CORS list (Cors:Origins) already allows.
export default defineConfig({
  plugins: [react()],
  // strictPort: the backend only allows :5173 (CORS). If it is busy, fail loudly instead of silently moving to :5174,
  // where every call would be blocked and the app would say it cannot reach the server.
  server: { port: 5173, strictPort: true, host: true },
  test: { environment: 'jsdom', globals: true, setupFiles: './src/test-setup.js' },
})
