import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The site's path: GitHub Pages serves it under /BrainrotTCG/; another host can set BASE_PATH=/.
export default defineConfig({
  base: process.env.BASE_PATH ?? '/BrainrotTCG/',
  plugins: [react()],
})
