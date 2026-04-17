import { defineConfig, transformWithOxc } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    react(),
  ],
  resolve: {
    extensions: ['.js', '.jsx', '.json', '.mjs']
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3000'
    }
  }
})
