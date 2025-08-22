import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Important: app is served under /profile_card/ in Flask
  base: '/profile_card/',
})
