import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Pulse Partner operations workspace for logistics companies
export default defineConfig({
  plugins: [react()],
  build: {
    emptyOutDir: true,
  },
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