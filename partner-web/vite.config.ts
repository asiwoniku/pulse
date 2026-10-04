import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The partner web runs on its own dev port and proxies /api to the Pulse Python
// service, so the browser never needs to know the service's host and CORS stays
// same-origin in development exactly as it is behind one reverse proxy later.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
})