import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Proxy API calls during dev so you don't need CORS config on the server
    proxy: {
      '/rover-data': 'http://localhost:3000',
      '/map-state':  'http://localhost:3000',
      '/reset':      'http://localhost:3000',
      '/history':    'http://localhost:3000',
      '/health':     'http://localhost:3000',
    }
  }
})
