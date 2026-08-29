import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
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
    hmr: {
      protocol: 'wss',
      host: '18933xwt-5173.asse.devtunnels.ms',
      clientPort: 443,
    },
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
})
