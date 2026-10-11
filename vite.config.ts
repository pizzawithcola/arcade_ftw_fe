import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5070,
    strictPort: true,
    // Relative URLs are used everywhere, so proxying here keeps local
    // development identical to production (same-origin through CloudFront).
    proxy: {
      '/health': 'http://localhost:5071',
      '/api': {
        target: 'ws://localhost:5071',
        ws: true,
      },
    },
  },
})
