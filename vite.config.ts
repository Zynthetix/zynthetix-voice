import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist/renderer',
    rollupOptions: {
      input: {
        pill: path.resolve(__dirname, 'src/renderer/pill.html'),
        settings: path.resolve(__dirname, 'src/renderer/settings.html'),
        dashboard: path.resolve(__dirname, 'src/dashboard/index.html'),
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
