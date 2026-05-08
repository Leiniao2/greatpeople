import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    proxy: {
      '/auth': 'http://localhost:8080',
      '/profile': 'http://localhost:8080',
      '/battle': 'http://localhost:8080',
    },
  },
})
