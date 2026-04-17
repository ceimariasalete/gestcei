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
      '/api': 'http://localhost:3000',
      '/supabase': {
        target: 'https://104.18.38.10',
        changeOrigin: true,
        secure: false,
        headers: {
          'Host': 'xyxpyljufhnwuqmpqbxx.supabase.co'
        },
        rewrite: (path) => path.replace(/^\/supabase/, '')
      }
    }
  }
})
