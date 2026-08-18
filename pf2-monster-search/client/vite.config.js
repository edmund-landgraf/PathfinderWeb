import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api/': 'http://localhost:3333',
      '/schemas': 'http://localhost:3333',
      '/images': 'http://localhost:3333'
    }
  }
});
