import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { getExtensionStatus } from '../api'
import { ROLE_LABEL } from '../lib/format'
import { Avatar, Icon, Logo } from './ui'
import CompanyChat from './CompanyChat'
import NotificationsBell from './NotificationsBell'
import { useDocumentTitle, usePageMeta } from '../lib/pageMeta'

const STAFF_NAV = [
  { to: '/pm', icon: 'grid_view', label: 'Meetings' },
  { to: '/manager', icon: 'insights', label: 'Team Performance' },
  { to: '/employee', icon: 'task_alt', label: 'My Work' },
  { to: '/connect-extension', icon: 'extension', label: 'Extension' },
]
const EMPLOYEE_NAV = [{ to: '/employee', icon: 'task_alt', label: 'My Work' }]

const HOME = { pm: '/pm', manager: '/pm', employee: '/employee' }

// Breadcrumb trail for the current page: [{ label, to? }]
function useCrumbs(isStaff) {
  const { pathname } = useLocation()
  const [params] = useSearchParams()
  const { crumb } = usePageMeta()
  if (pathname.startsWith('/pm')) return [{ label: 'Meetings & Transcripts' }]
  if (pathname.startsWith('/manager')) {
    return params.get('tab') === 'members'
      ? [{ label: 'Team Performance', to: '/manager' }, { label: 'Members & invites' }]
      : [{ label: 'Team Performance' }]
  }
  if (pathname.startsWith('/employee')) return [{ label: 'My Work' }]
  if (pathname.startsWith('/connect-extension')) return [{ label: 'Chrome Extension' }]
  if (pathname.startsWith('/meeting/')) {
    return [isStaff ? { label: 'Meetings', to: '/pm' } : { label: 'My Work', to: '/employee' }, { label: crumb || 'Meeting' }]
  }
  return [{ label: 'MeetingOS' }]
}

function UserMenu() {
  const { userProfile, logout } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const onClick = e => { if (!ref.current?.contains(e.target)) setOpen(false) }
    const onKey = e => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onClick); document.removeEventListener('keydown', onKey) }
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(!open)} aria-haspopup="menu" aria-expanded={open} aria-label="Account menu"
              className="rounded-full focus-visible:ring-2 focus-visible:ring-coral">
        <Avatar name={userProfile?.name || '?'} size={34} />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-12 w-64 bg-white rounded-card p-2 anim-fade-up z-50"
             style={{ boxShadow: '0 16px 40px -8px rgba(24,24,27,0.2), 0 0 0 1px rgba(0,0,0,0.05)' }}>
          <div className="flex items-center gap-3 px-3 py-3 border-b border-surface-container mb-1">
            <Avatar name={userProfile?.name || '?'} size={38} />
            <div className="min-w-0">
              <p className="text-label-lg text-ink capitalize truncate">{userProfile?.name}</p>
              <p className="text-[12px] text-ink-2 truncate">{userProfile?.email}</p>
              <p className="text-[11px] text-coral-deep font-semibold mt-0.5">{ROLE_LABEL[userProfile?.role]}</p>
            </div>
          </div>
          <button role="menuitem" onClick={() => { setOpen(false); navigate('/employee') }} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-body-md text-ink hover:bg-surface-container-low">
            <Icon name="task_alt" size={19} className="text-ink-2" />My work
          </button>
          <button role="menuitem" onClick={async () => { await logout(); navigate('/login') }} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-body-md text-overdue hover:bg-overdue-bg">
            <Icon name="logout" size={19} />Sign out
          </button>
        </div>
      )}
    </div>
  )
}

function Sidebar({ onNavigate }) {
  const { userProfile, logout } = useAuth()
  const navigate = useNavigate()
  const isStaff = userProfile?.role === 'pm' || userProfile?.role === 'manager'
  const [extension, setExtension] = useState(null)

  useEffect(() => {
    if (isStaff) getExtensionStatus().then(r => setExtension(r.data)).catch(() => {})
  }, [isStaff])

  return (
    <aside className="h-full w-72 bg-inverse-surface flex flex-col justify-between p-4">
      <div className="flex flex-col gap-7">
        <Link to={HOME[userProfile?.role] || '/'} onClick={onNavigate} className="px-2 pt-1 self-start rounded-xl focus-visible:ring-2 focus-visible:ring-coral" aria-label="Go to your dashboard"><Logo dark /></Link>
        <nav className="flex flex-col gap-1" aria-label="Main">
          {(isStaff ? STAFF_NAV : EMPLOYEE_NAV).map(item => (
            <NavLink
              key={item.to} to={item.to} onClick={onNavigate}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-2.5 rounded-2xl text-label-lg transition-all ${
                  isActive ? 'bg-white text-ink shadow-sm' : 'text-[#c8c5ca] hover:bg-white/10 hover:text-white'}`}
            >
              <Icon name={item.icon} size={20} />{item.label}
            </NavLink>
          ))}
        </nav>
      </div>

      <div className="flex flex-col gap-3">
        {isStaff && (
          <button
            onClick={() => { navigate('/connect-extension'); onNavigate?.() }}
            className="text-left rounded-2xl bg-white/6 hover:bg-white/10 p-4 transition-colors"
          >
            <span className={`flex items-center gap-1.5 text-label-sm ${extension?.connected ? 'text-mint' : 'text-[#fdba74]'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${extension?.connected ? 'bg-mint anim-pulse' : 'bg-[#fdba74]'}`} />
              Chrome extension
            </span>
            <p className="text-body-sm text-[#e4e1e6] mt-1 leading-snug">
              {extension === null ? 'Checking…' : extension.connected
                ? 'Connected. Meetings are captured automatically when you join a Meet.'
                : 'Not connected. Connect it to capture Google Meet automatically.'}
            </p>
          </button>
        )}
        <div className="flex items-center justify-between rounded-full bg-white/8 p-1.5 pr-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <Avatar name={userProfile?.name || '?'} size={36} />
            <div className="min-w-0">
              <p className="text-label-lg text-white truncate capitalize">{userProfile?.name}</p>
              <p className="text-label-sm text-ink-3">{ROLE_LABEL[userProfile?.role] || ''}</p>
            </div>
          </div>
          <button
            onClick={async () => { await logout(); navigate('/login') }}
            title="Sign out"
            className="w-9 h-9 rounded-full flex items-center justify-center text-ink-3 hover:text-white hover:bg-white/10"
          >
            <Icon name="logout" size={19} />
          </button>
        </div>
      </div>
    </aside>
  )
}

export default function AppShell({ children }) {
  const { userProfile } = useAuth()
  const navigate = useNavigate()
  const [drawer, setDrawer] = useState(false)
  const isStaff = userProfile?.role === 'pm' || userProfile?.role === 'manager'
  const crumbs = useCrumbs(isStaff)
  useDocumentTitle(crumbs[crumbs.length - 1].label)

  useEffect(() => {
    if (!drawer) return
    const onKey = e => { if (e.key === 'Escape') setDrawer(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [drawer])

  return (
    <div className="min-h-screen bg-canvas">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] btn btn-dark btn-sm">Skip to content</a>
      <div className="hidden lg:block fixed inset-y-0 left-0 z-50"><Sidebar /></div>

      {drawer && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <Sidebar onNavigate={() => setDrawer(false)} />
          <button className="flex-1 bg-black/40" aria-label="Close menu" onClick={() => setDrawer(false)} />
        </div>
      )}

      <div className="lg:pl-72 flex flex-col min-h-screen">
        <header className="sticky top-0 z-40 h-16 bg-canvas/85 backdrop-blur-xl border-b border-black/4">
          <div className="h-full px-4 sm:px-8 flex items-center justify-between gap-4">
            <nav aria-label="Breadcrumb" className="flex items-center gap-2 min-w-0">
              <button className="lg:hidden w-9 h-9 -ml-1 rounded-full flex items-center justify-center hover:bg-surface-container" onClick={() => setDrawer(true)} aria-label="Open menu">
                <Icon name="menu" />
              </button>
              <Link to={HOME[userProfile?.role] || '/'} className="hidden sm:inline text-label-md text-ink-2 hover:text-ink">MeetingOS</Link>
              {crumbs.map((c, i) => (
                <span key={i} className={`flex items-center gap-2 min-w-0 ${i < crumbs.length - 1 ? 'hidden sm:flex' : ''}`}>
                  <span className="hidden sm:inline text-ink-3">/</span>
                  {c.to
                    ? <Link to={c.to} className="text-label-md text-ink-2 hover:text-ink whitespace-nowrap">{c.label}</Link>
                    : <span className="text-label-lg text-ink truncate" aria-current="page">{c.label}</span>}
                </span>
              ))}
            </nav>
            <div className="flex items-center gap-3">
              {isStaff && (
                <button className="btn btn-primary btn-sm" onClick={() => navigate('/pm?upload=1')}>
                  <Icon name="add" size={18} /><span className="hidden sm:inline">Upload transcript</span>
                </button>
              )}
              <NotificationsBell />
              <UserMenu />
            </div>
          </div>
        </header>

        <main id="main" tabIndex={-1} className="flex-1 w-full max-w-[1320px] mx-auto px-4 sm:px-8 py-8 outline-none">{children}</main>
      </div>

      <CompanyChat />
    </div>
  )
}
