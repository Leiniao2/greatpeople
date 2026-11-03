import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    port: 3001,
    strictPort: true,
    proxy: {
      '/auth': 'http://localhost:8080',
      '/profile': 'http://localhost:8080',
      '/battle': 'http://localhost:8080',
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    // Several minigame audits play whole games for every config, difficulty
    // and many seeds; under a full parallel run they can pass 5 s.
    testTimeout: 20_000,
    coverage: { provider: 'v8', reporter: ['text', 'lcov'] },
  },
})
