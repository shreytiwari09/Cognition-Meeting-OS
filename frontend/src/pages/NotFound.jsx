import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useDocumentTitle } from '../lib/pageMeta'
import { Icon, Logo } from '../components/ui'

const HOME = { pm: '/pm', manager: '/pm', employee: '/employee' }

export default function NotFound() {
  const navigate = useNavigate()
  const { userProfile } = useAuth()
  useDocumentTitle('Page not found')
  const home = (userProfile?.companyId && HOME[userProfile.role]) || '/'
  return (
    <div className="min-h-screen bg-canvas flex flex-col">
      <header className="px-6 h-16 flex items-center"><a href="/"><Logo /></a></header>
      <main id="main" className="flex-1 flex items-center justify-center p-6">
        <div className="bento p-10 sm:p-14 max-w-lg text-center">
          <p className="text-[72px] leading-none font-bold tracking-tight text-coral">404</p>
          <h1 className="text-headline-md text-ink mt-4">This page doesn’t exist</h1>
          <p className="text-body-md text-ink-2 mt-2">The link may be broken, or the page may have moved.</p>
          <div className="flex justify-center gap-2.5 mt-7">
            <button className="btn btn-secondary" onClick={() => navigate(-1)}><Icon name="arrow_back" size={18} />Go back</button>
            <button className="btn btn-primary" onClick={() => navigate(home)}><Icon name="home" size={18} />{home === '/' ? 'Home' : 'Dashboard'}</button>
          </div>
        </div>
      </main>
    </div>
  )
}
