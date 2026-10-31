import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Pulse Operations Admin Console for admin.pulse.com
export default defineConfig({
  plugins: [react()],
  build: {
    emptyOutDir: true,
    outDir: 'dist',
  },
  server: {
    port: 5174,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
})
