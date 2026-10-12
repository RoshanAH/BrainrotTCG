import { StrictMode } from 'react'
import { MotionConfig } from 'framer-motion'
import { createRoot } from 'react-dom/client'
import './styles/index.css'
import App from './App'
import { runMigrations } from './utils/migrations'

runMigrations()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Respect the OS "reduce motion" setting for every framer-motion animation. */}
    <MotionConfig reducedMotion="user">
      <App />
    </MotionConfig>
  </StrictMode>,
)
