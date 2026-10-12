import { StrictMode } from 'react'
import { MotionConfig } from 'framer-motion'
import { createRoot } from 'react-dom/client'
import './styles/index.css'
import App from './App'
import { runMigrations } from './utils/migrations'
import { migratePullLog } from './game/history'

runMigrations()
migratePullLog()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Respect the OS "reduce motion" setting for every framer-motion animation. */}
    <MotionConfig reducedMotion="user">
      <App />
    </MotionConfig>
  </StrictMode>,
)
