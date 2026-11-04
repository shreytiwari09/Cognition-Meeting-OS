import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

// New page → start at the top (but keep in-page #anchors and query-only changes like tabs where they are)
export default function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }) }, [pathname])
  return null
}
