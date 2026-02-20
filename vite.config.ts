import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist/renderer',
    rollupOptions: {
      input: {
        pill: path.resolve(__dirname, 'src/renderer/pill.html'),
        settings: path.resolve(__dirname, 'src/renderer/settings.html'),
      }
    }
  },
  server: {
    port: 5173
  }
})
