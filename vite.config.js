import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages project-site deployment.
// Repository name is GYM-TRACKER-FIREBASE; change base if you rename the repo.
export default defineConfig({
  plugins: [react()],
  base: '/Tracker_App/',
})
