import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fightStudioApi } from './server/api'

// Internal-only tool: binds to loopback and the API refuses non-loopback
// callers. There is intentionally no `build` script and no deploy config.
export default defineConfig({
  plugins: [react(), fightStudioApi()],
  // Serve the shipped WebP artwork (portraits, followers, locations) read-only.
  publicDir: path.resolve(__dirname, '../../web/public'),
  server: {
    host: '127.0.0.1',
    port: 3777,
    strictPort: true,
  },
})
