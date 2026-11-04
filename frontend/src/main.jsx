import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// Icon glyphs are ligatures: until the (large) icon font arrives they'd render as words like "arrow_forward".
// Keep them invisible until the browser confirms the font is usable; give up after 15s rather than hide forever.
const ICON_FONT = '24px "Material Symbols Outlined"'
const started = Date.now()
const waitForIcons = () => {
  const ready = document.fonts?.check(ICON_FONT) && [...document.fonts].some(f => f.family.includes('Material Symbols') && f.status === 'loaded')
  if (ready || !document.fonts || Date.now() - started > 15000) document.documentElement.classList.add('icons-ready')
  else { document.fonts.load(ICON_FONT, 'home').catch(() => {}); setTimeout(waitForIcons, 150) }
}
waitForIcons()

async function start() {
  // Dev-only preview mode with sample data (see src/dev/mock.js); never part of production builds
  if (import.meta.env.DEV && localStorage.getItem('meetingos_mock')) await import('./dev/mock.js')
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
start()
