import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getNotifications } from '../api'
import { useAuth } from '../contexts/AuthContext'
import { relativeDay } from '../lib/format'
import { Icon } from './ui'

const KIND_ICON = {
  accept: ['assignment_ind', 'bg-coral-wash text-coral-deep'], overdue: ['schedule', 'bg-overdue-bg text-overdue'],
  due: ['event', 'bg-pending-bg text-pending'], declined: ['do_not_disturb_on', 'bg-overdue-bg text-overdue'],
  review: ['approval', 'bg-pending-bg text-pending'], meeting: ['task_alt', 'bg-forest-soft text-forest'],
  failed: ['error', 'bg-overdue-bg text-overdue'],
}
const POLL_MS = 60000

// Bell with a count of items that are new since the person last opened it
export default function NotificationsBell() {
  const { userProfile } = useAuth()
  const navigate = useNavigate()
  const ref = useRef(null)
  const seenKey = `notifications_seen_${userProfile?.uid}`
  const [items, setItems] = useState([])
  const [open, setOpen] = useState(false)
  const [lastSeen, setLastSeen] = useState(() => { try { return localStorage.getItem(seenKey) || '' } catch { return '' } })

  const load = useCallback(() => getNotifications().then(r => setItems(r.data.items)).catch(() => {}), [])

  useEffect(() => {
    load()
    const t = setInterval(load, POLL_MS)
    return () => clearInterval(t)
  }, [load])

  useEffect(() => {
    if (!open) return
    const onClick = e => { if (!ref.current?.contains(e.target)) setOpen(false) }
    const onKey = e => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onClick); document.removeEventListener('keydown', onKey) }
  }, [open])

  const unread = items.filter(i => (i.at || '') > lastSeen).length

  function toggle() {
    if (!open) {
      load()
      const now = new Date().toISOString()
      setTimeout(() => { setLastSeen(now); try { localStorage.setItem(seenKey, now) } catch { /* private mode */ } }, 1500)
    }
    setOpen(!open)
  }

  return (
    <div className="relative" ref={ref}>
      <button onClick={toggle} aria-label={`Notifications${unread ? ` (${unread} new)` : ''}`} aria-expanded={open}
              className="relative w-9 h-9 rounded-full bg-surface-container hover:bg-surface-container-high flex items-center justify-center text-ink-2">
        <Icon name="notifications" size={20} />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-coral text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-canvas">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-12 w-[min(380px,calc(100vw-2rem))] bg-white rounded-card overflow-hidden anim-fade-up z-50"
             style={{ boxShadow: '0 16px 40px -8px rgba(24,24,27,0.22), 0 0 0 1px rgba(0,0,0,0.05)' }}>
          <div className="px-5 py-4 border-b border-surface-container flex items-center justify-between">
            <p className="text-label-lg text-ink">Notifications</p>
            <span className="text-[12px] text-ink-2">{items.length ? `${items.length} item${items.length > 1 ? 's' : ''}` : ''}</span>
          </div>
          {items.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <Icon name="notifications_off" size={28} className="text-ink-3" />
              <p className="text-body-md text-ink-2 mt-2">You’re all caught up.</p>
            </div>
          ) : (
            <ul className="max-h-[420px] overflow-y-auto divide-y divide-surface-container">
              {items.map(item => {
                const [icon, tone] = KIND_ICON[item.kind] || ['info', 'bg-surface-container text-ink-2']
                const isNew = (item.at || '') > lastSeen
                return (
                  <li key={item.id}>
                    <button onClick={() => { setOpen(false); navigate(item.link) }}
                            className={`w-full text-left px-5 py-3.5 flex gap-3 hover:bg-surface-container-low ${isNew ? 'bg-coral-wash/40' : ''}`}>
                      <span className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${tone}`}><Icon name={icon} size={18} /></span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-2">
                          <span className="text-label-md text-ink">{item.title}</span>
                          <span className="text-[11px] text-ink-3 shrink-0">{item.at ? relativeDay(item.at) : ''}</span>
                        </span>
                        <span className="block text-body-sm text-ink-2 mt-0.5 line-clamp-2">{item.body}</span>
                      </span>
                      {isNew && <span className="w-2 h-2 rounded-full bg-coral mt-2 shrink-0" />}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
