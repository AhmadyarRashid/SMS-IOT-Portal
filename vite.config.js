import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'https://go.smsiotpk.com',
        changeOrigin: true,
        secure: true,
        headers: {
          Origin: 'https://go.smsiotpk.com',
        },
      },
      '/auth': {
        target: 'https://go.smsiotpk.com',
        changeOrigin: true,
        secure: true,
        headers: {
          Origin: 'https://go.smsiotpk.com',
        },
      },
    },
  },
})
