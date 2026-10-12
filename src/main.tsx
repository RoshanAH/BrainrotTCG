import { StrictMode } from 'react'
import { MotionConfig } from 'framer-motion'
import { createRoot } from 'react-dom/client'
import './styles/index.css'
import App from './App'
import { runMigrations } from './utils/migrations'
import { migratePullLog } from './game/history'
import { receiveSave } from './game/move'

// A window the site's old address opened to hand over a save does only that (see game/move.ts).
receiveSave().then((receiver) => {
  if (receiver) return
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
})
