import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: '0.0.0.0',
    port: 5173,
    watch: { usePolling: process.env.VITE_POLLING === 'true' },
    // En dev, Vite joue le rôle du reverse proxy (en prod c'est Nginx)
    proxy: { '/api': { target: process.env.API_URL || 'http://backend:3000', changeOrigin: true } },
  },
});
