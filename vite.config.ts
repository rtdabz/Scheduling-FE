import { createLogger, defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// A client dropping its live-updates socket (tab closed, laptop asleep, dev tunnel
// recycled) aborts the proxied WebSocket mid-write. Vite already handles the error,
// but logs a full stack trace for it ("write ECONNABORTED"). Those disconnects are
// normal, so keep them out of the log; every other proxy error is still printed.
const CLIENT_DISCONNECT_CODES = new Set(['ECONNABORTED', 'ECONNRESET', 'EPIPE'])
const logger = createLogger()
const logError = logger.error.bind(logger)
logger.error = (msg, options) => {
  const code = (options?.error as NodeJS.ErrnoException | undefined)?.code
  if (code && CLIENT_DISCONNECT_CODES.has(code) && msg.includes('ws proxy')) return
  logError(msg, options)
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const hmrHost = env.VITE_HMR_HOST

  return {
    customLogger: logger,
    plugins: [react()],
    // Loaded only through dynamic import(), so the dev server would otherwise discover them mid-session,
    // re-bundle, and fail the in-flight import with "504 Outdated Optimize Dep".
    optimizeDeps: {
      include: ['jspdf', 'jspdf-autotable', 'pusher-js', 'papaparse', 'read-excel-file/browser', 'mammoth', 'pdfjs-dist'],
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/') || id.includes('node_modules/react-router-dom/')) return 'react-vendor';
            if (id.includes('node_modules/@tanstack/react-table/')) return 'table-vendor';
            if (id.includes('node_modules/axios/') || id.includes('node_modules/react-joyride/') || id.includes('node_modules/@floating-ui/')) return 'utility-vendor';
            return undefined;
          },
        },
      },
    },
    server: {
      host: '0.0.0.0',
      port: 5173,
      strictPort: true,
      allowedHosts: [
        '18933xwt-5173.asse.devtunnels.ms',
        '18933xwt-8000.asse.devtunnels.ms',
      ],
      hmr: hmrHost ? {
        protocol: 'wss',
        host: hmrHost,
        clientPort: 443,
      } : undefined,
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:8000',
          changeOrigin: true,
        },
        // Live-updates socket (Laravel Reverb). Proxied so the browser connects
        // to the page's own origin, which also works through dev tunnels.
        '^/app/': {
          target: 'ws://127.0.0.1:8080',
          ws: true,
          changeOrigin: true,
        },
      },
    },
  }
})
