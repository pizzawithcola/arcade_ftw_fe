import react from '@vitejs/plugin-react'
import { createLogger, defineConfig } from 'vite'

// A kiosk tab that reloads drops its socket mid-frame, and http-proxy reports
// that as `write EPIPE` with a stack trace - which reads like a backend failure
// but only ever means "the browser went away". Everything else still prints.
const logger = createLogger()
const logError = logger.error.bind(logger)
const VANISHED = new Set(['EPIPE', 'ECONNRESET'])
logger.error = (msg, options) => {
  const code = (options?.error as NodeJS.ErrnoException | undefined)?.code
  if (msg.includes('ws proxy') && code && VANISHED.has(code)) return
  logError(msg, options)
}

// https://vite.dev/config/
export default defineConfig({
  customLogger: logger,
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
