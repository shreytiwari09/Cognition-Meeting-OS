import { avatarColor, initials } from '../lib/format'

const TONES = {
  done:      'bg-done-bg text-done',
  pending:   'bg-pending-bg text-pending',
  overdue:   'bg-overdue-bg text-overdue',
  escalated: 'bg-escalated-bg text-escalated',
  info:      'bg-info-bg text-info',
  coral:     'bg-coral-soft text-coral-deep',
  dark:      'bg-panel text-white',
  outline:   'bg-white text-ink-2 border border-inset',
}
const DOTS = {
  done: 'bg-done', pending: 'bg-pending', overdue: 'bg-overdue', escalated: 'bg-escalated',
  info: 'bg-ink-3', coral: 'bg-coral', dark: 'bg-white', outline: 'bg-ink-3',
}

export function Icon({ name, className = '', fill = false, size }) {
  return (
    <span className={`icon ${fill ? 'icon-fill' : ''} ${className}`} style={size ? { fontSize: size } : undefined} aria-hidden="true">
      {name}
    </span>
  )
}

export function Logo({ dark = false, compact = false }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="w-9 h-9 rounded-xl bg-coral flex items-center justify-center shadow-coral shrink-0">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill="white" stroke="white" strokeWidth="1.2" strokeLinejoin="round" />
        </svg>
      </div>
      {!compact && (
        <div className="flex flex-col leading-none">
          <span className={`text-[17px] font-bold tracking-tight ${dark ? 'text-white' : 'text-ink'}`}>Cognition</span>
          <span className={`text-[10px] font-semibold tracking-[0.14em] uppercase mt-1 ${dark ? 'text-ink-3' : 'text-ink-2'}`}>MeetingOS</span>
        </div>
      )}
    </div>
  )
}

export function Avatar({ name, size = 32, ring = false }) {
  return (
    <div
      className={`rounded-full flex items-center justify-center text-white font-bold shrink-0 ${ring ? 'ring-2 ring-white' : ''}`}
      style={{ width: size, height: size, background: avatarColor(name), fontSize: Math.max(10, size * 0.36) }}
      title={name}
    >
      {initials(name)}
    </div>
  )
}

export function AvatarStack({ names = [], max = 4, size = 28 }) {
  const shown = names.slice(0, max)
  return (
    <div className="flex items-center">
      {shown.map((n, i) => <div key={n + i} className={i ? '-ml-2' : ''}><Avatar name={n} size={size} ring /></div>)}
      {names.length > max && (
        <div className="-ml-2 rounded-full bg-surface-container-high text-ink-2 font-semibold ring-2 ring-white flex items-center justify-center"
             style={{ width: size, height: size, fontSize: size * 0.36 }}>+{names.length - max}</div>
      )}
    </div>
  )
}

export function Chip({ tone = 'info', dot = false, pulse = false, children, className = '' }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] leading-none font-semibold whitespace-nowrap ${TONES[tone] || TONES.info} ${className}`}>
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${DOTS[tone] || DOTS.info} ${pulse ? 'anim-pulse' : ''}`} />}
      {children}
    </span>
  )
}

export function Spinner({ size = 28 }) {
  return (
    <div className="anim-spin rounded-full border-[3px] border-coral-soft border-t-coral" style={{ width: size, height: size }} />
  )
}

export function Loading({ label = 'Loading…' }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-24 text-ink-2 text-body-md">
      <Spinner />{label}
    </div>
  )
}

export function EmptyState({ icon = 'inbox', title, text, action }) {
  return (
    <div className="bento flex flex-col items-center text-center px-6 py-14">
      <div className="w-14 h-14 rounded-2xl bg-coral-wash text-coral flex items-center justify-center mb-4">
        <Icon name={icon} size={28} />
      </div>
      <p className="text-headline-sm text-ink">{title}</p>
      {text && <p className="text-body-md text-ink-2 mt-1 max-w-md">{text}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function ProgressBar({ value = 0, tone = 'coral', height = 6, track = 'bg-subtle' }) {
  const fill = { coral: 'bg-coral', done: 'bg-done', pending: 'bg-[#f59e0b]', overdue: 'bg-overdue', dark: 'bg-panel', info: 'bg-ink-3' }[tone]
  return (
    <div className={`w-full rounded-full overflow-hidden ${track}`} style={{ height }}>
      <div className={`h-full rounded-full ${fill} transition-all duration-500`} style={{ width: `${Math.max(0, Math.min(100, value * 100))}%` }} />
    </div>
  )
}

export function Segmented({ options, value, onChange, className = '' }) {
  return (
    <div className={`segmented ${className}`}>
      {options.map(o => (
        <button key={o.value} type="button" data-active={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}{o.count !== undefined && <span className="ml-1.5 text-ink-3">{o.count}</span>}
        </button>
      ))}
    </div>
  )
}

export function StatCard({ title, icon, value, unit, sub, tone, children, hero = false }) {
  if (hero) {
    return (
      <div className="rounded-bento bg-coral text-white p-6 shadow-coral flex flex-col justify-between min-h-[176px]">
        <div className="flex items-start justify-between gap-3">
          <p className="text-label-lg text-white/90">{title}</p>
          {icon && <Icon name={icon} className="text-white/90" />}
        </div>
        <div>
          <p className="text-[44px] leading-none font-bold tracking-tight">{value}{unit && <span className="text-headline-sm ml-1.5">{unit}</span>}</p>
          {sub && <p className="text-body-sm text-white/85 mt-2">{sub}</p>}
          {children}
        </div>
      </div>
    )
  }
  const color = { done: 'text-done', overdue: 'text-overdue', pending: 'text-pending', coral: 'text-coral' }[tone] || 'text-ink'
  return (
    <div className="bento p-6 flex flex-col justify-between min-h-[176px]">
      <div className="flex items-start justify-between gap-3">
        <p className="text-label-lg text-ink-2">{title}</p>
        {icon && <div className="w-8 h-8 rounded-full bg-surface-container-low flex items-center justify-center text-ink-2"><Icon name={icon} size={18} /></div>}
      </div>
      <div>
        <p className={`text-[44px] leading-none font-bold tracking-tight ${color}`}>{value}{unit && <span className="text-body-md font-semibold text-ink-2 ml-1.5">{unit}</span>}</p>
        {sub && <p className="text-body-sm text-ink-2 mt-2">{sub}</p>}
        {children}
      </div>
    </div>
  )
}

export function SectionHeader({ eyebrow, title, subtitle, actions }) {
  return (
    <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-5 mb-8">
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow text-ink-2 mb-2 flex items-center gap-1.5">{eyebrow}</p>}
        <h1 className="text-headline-lg text-ink">{title}</h1>
        {subtitle && <p className="text-body-md text-ink-2 mt-1.5 max-w-2xl">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2.5 flex-wrap shrink-0">{actions}</div>}
    </div>
  )
}

export function EvidenceQuote({ quote, speaker, label = 'Verbatim evidence', tone = 'coral', compact = false }) {
  if (!quote) return null
  const bar = tone === 'done' ? 'border-done' : tone === 'overdue' ? 'border-overdue' : 'border-coral'
  return (
    <div className={`rounded-tile bg-surface-container-low border-l-[3px] ${bar} ${compact ? 'px-3 py-2' : 'px-4 py-3'}`}>
      {!compact && <p className="eyebrow text-coral-deep mb-1.5 flex items-center gap-1"><Icon name="format_quote" size={14} />{label}</p>}
      <p className="text-body-sm italic text-ink leading-relaxed">“{quote}”</p>
      {speaker && <p className="text-[12px] text-ink-2 mt-1.5">— {speaker}</p>}
    </div>
  )
}
