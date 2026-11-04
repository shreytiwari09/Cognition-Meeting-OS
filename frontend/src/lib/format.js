// Small presentation helpers shared across screens

export const ROLE_LABEL = { pm: 'Owner', manager: 'Manager', employee: 'Employee' }

export const DEPARTMENTS = ['Engineering', 'Product', 'Design', 'Data & Analytics', 'Marketing', 'Sales',
  'Customer Success', 'Operations', 'Finance', 'People & HR', 'Legal']

export function duration(minutes, estimated) {
  if (!minutes) return ''
  const text = minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60 ? `${minutes % 60}m` : ''}`.trim() : `${minutes} min`
  return estimated ? `~${text}` : text
}

export const TASK_STATUS = {
  pending:     { label: 'Pending',     tone: 'pending' },
  in_progress: { label: 'In progress', tone: 'pending' },
  done:        { label: 'Done',        tone: 'done' },
  overdue:     { label: 'Overdue',     tone: 'overdue' },
  escalated:   { label: 'Escalated',   tone: 'escalated' },
}

export const MEETING_STATUS = {
  processing: { label: 'Processing', tone: 'coral', pulse: true },
  completed:  { label: 'Completed',  tone: 'done' },
  failed:     { label: 'Failed',     tone: 'overdue' },
}

export const PERSON_STATUS = {
  at_risk:   { label: 'At risk',         tone: 'overdue' },
  attention: { label: 'Needs attention', tone: 'pending' },
  on_track:  { label: 'On track',        tone: 'done' },
  no_tasks:  { label: 'No tasks yet',    tone: 'info' },
}

export const SEVERITY = {
  critical: { label: 'Critical', tone: 'overdue' },
  warning:  { label: 'Warning',  tone: 'pending' },
  info:     { label: 'Info',     tone: 'info' },
}

export function initials(name = '') {
  return name.trim().split(/\s+/).slice(0, 2).map(p => p[0]?.toUpperCase() || '').join('') || '?'
}

const AVATAR_COLORS = ['#ff5722', '#15803d', '#1d4ed8', '#7c3aed', '#b45309', '#0e7490', '#be185d', '#4d7c0f']
export function avatarColor(name = '') {
  let h = 0
  for (const ch of name.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}

export const titleCase = s => (s || '').replace(/\b\w/g, c => c.toUpperCase())

export function pct(v) {
  return v === null || v === undefined ? '—' : `${Math.round(v * 100)}%`
}

export function shortDate(d) {
  if (!d) return ''
  const date = new Date(d)
  return Number.isNaN(date.getTime()) ? String(d) : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function dateTime(d) {
  if (!d) return ''
  const date = new Date(d)
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ', ' +
         date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

export function relativeDay(d) {
  if (!d) return ''
  const date = new Date(d)
  if (Number.isNaN(date.getTime())) return String(d)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const that = new Date(date); that.setHours(0, 0, 0, 0)
  const days = Math.round((that - today) / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  if (days === -1) return 'Yesterday'
  if (days > 1 && days < 7) return `In ${days} days`
  if (days < -1 && days > -7) return `${-days} days ago`
  return shortDate(date)
}

// Days until a task deadline (negative = overdue); null when there is no usable date
export function daysUntil(deadline) {
  if (!deadline) return null
  const date = new Date(deadline)
  if (Number.isNaN(date.getTime())) return null
  const today = new Date(); today.setHours(0, 0, 0, 0)
  date.setHours(0, 0, 0, 0)
  return Math.round((date - today) / 86400000)
}

export function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

export const rateTone = r => (r === null || r === undefined ? 'info' : r >= 0.8 ? 'done' : r >= 0.6 ? 'pending' : 'overdue')
