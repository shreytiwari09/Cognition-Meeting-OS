import { Icon } from './ui'

// "Setup progress" card: what to do next, for owners and managers, until done or dismissed
function buildSteps({ role, team, meetingCount }) {
  const managers  = team.filter(m => m.role === 'manager').length
  const employees = team.filter(m => m.role === 'employee').length
  const upload = { id: 'upload', title: 'Add your first meeting', done: meetingCount > 0, status: `${meetingCount} uploaded`,
                   action: 'upload', actionLabel: 'Upload', alt: 'extension', altLabel: 'Use extension' }
  if (role === 'pm') {
    return [
      { id: 'register', title: 'Company registered', done: true, status: 'Done' },
      { id: 'managers', title: 'Invite your managers', done: managers > 0, status: `${managers} joined`, action: 'team', actionLabel: 'Invite' },
      { id: 'teams', title: 'Managers invite their teams', done: employees > 0, status: `${employees} joined`, action: 'team', actionLabel: 'View team' },
      upload,
    ]
  }
  return [
    { id: 'team', title: 'Invite your team', done: employees > 0, status: `${employees} joined`, action: 'team', actionLabel: 'Invite' },
    upload,
    { id: 'extension', title: 'Connect the Chrome extension', done: false, status: 'Optional', action: 'extension', actionLabel: 'Connect' },
  ]
}

export default function OnboardingChecklist({ role, team, meetingCount, dismissed, onAction, onDismiss }) {
  const steps = buildSteps({ role, team, meetingCount })
  const required = steps.filter(s => s.status !== 'Optional')
  if (dismissed || required.every(s => s.done)) return null
  const doneCount = steps.filter(s => s.done).length

  return (
    <div className="bento p-6 mb-8 anim-fade-up">
      <div className="flex items-center justify-between gap-4 mb-5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-forest-soft text-forest flex items-center justify-center"><Icon name="flag" size={20} /></div>
          <p className="text-headline-sm text-ink">Setup progress: {doneCount} of {steps.length} steps complete</p>
        </div>
        <button onClick={onDismiss} className="btn btn-ghost btn-sm"><Icon name="close" size={16} />Dismiss</button>
      </div>
      <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
        {steps.map(s => <div key={s.id} className={`h-1.5 rounded-full ${s.done ? 'bg-forest' : 'bg-subtle'}`} />)}
      </div>
      <div className="grid gap-3 mt-3" style={{ gridTemplateColumns: `repeat(auto-fit, minmax(200px, 1fr))` }}>
        {steps.map(s => (
          <div key={s.id} className={`flex items-center justify-between gap-2 rounded-2xl px-4 py-3 ${s.done ? 'bg-surface-container-low' : 'bg-white ring-1 ring-black/6'}`}>
            <div className="flex items-center gap-2.5 min-w-0">
              <Icon name={s.done ? 'check_circle' : 'radio_button_unchecked'} size={20} className={s.done ? 'text-forest' : 'text-ink-3'} />
              <span className="text-label-md text-ink leading-tight">{s.title}</span>
            </div>
            {s.done || !s.action
              ? <span className="text-label-sm text-ink-2 whitespace-nowrap">{s.status}</span>
              : <div className="flex gap-1.5 shrink-0">
                  {s.alt && <button onClick={() => onAction(s.alt)} className="btn btn-outline btn-sm">{s.altLabel}</button>}
                  <button onClick={() => onAction(s.action)} className="btn btn-primary btn-sm">{s.actionLabel}</button>
                </div>}
          </div>
        ))}
      </div>
    </div>
  )
}
