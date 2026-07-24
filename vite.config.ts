import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'src') },
  },
  build: {
    // Day JSON lives in public/ and is fetched at runtime, so it never enters the
    // bundle graph. Keep the JS bundle small and cacheable.
    target: 'es2022',
  },
})
