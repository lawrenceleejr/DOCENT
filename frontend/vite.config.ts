import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Same-origin API in dev, matching the nginx proxy in production.
      '/api': 'http://localhost:8000',
    },
  },
});
