import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  root: '.',
  publicDir: resolve(__dirname, '../../'), // Serve from project root
  server: {
    port: 5173,
    open: true,
  },
  preview: {
    port: 5173,
  },
  // Enable client-side routing with React Router
  appType: 'spa',
});

