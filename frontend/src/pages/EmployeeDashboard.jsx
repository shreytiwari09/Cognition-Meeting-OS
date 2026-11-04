import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { checkOverdueTasks, decideTask, getMeetings, getMyTasks, updateTaskProgress, updateTaskStatus } from '../api'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { Avatar, AvatarStack, Chip, EmptyState, EvidenceQuote, Icon, Loading, ProgressBar, Segmented } from '../components/ui'
import { ROLE_LABEL, daysUntil, duration, greeting, shortDate, relativeDay } from '../lib/format'

function isOverdue(t) {
  if (t.status === 'done') return false
  if (t.status === 'overdue' || t.status === 'escalated') return true
  const d = daysUntil(t.deadline_date || t.deadline)
  return d !== null && d < 0
}

function DueChip({ task }) {
  if (task.status === 'done') return <Chip tone="done" dot>Done</Chip>
  if (task.status === 'escalated') return <Chip tone="escalated" dot>Escalated</Chip>
  const d = daysUntil(task.deadline_date || task.deadline)
  if (d === null) return <Chip tone="info">No deadline</Chip>
  if (d < 0) return <Chip tone="overdue" dot>Overdue · {-d} day{d === -1 ? '' : 's'} late</Chip>
  if (d === 0) return <Chip tone="coral" dot>Due today</Chip>
  return <Chip tone={d <= 3 ? 'pending' : 'outline'} dot>Due in {d} day{d === 1 ? '' : 's'}</Chip>
}

function ProgressRing({ value }) {
  const pctValue = Math.round(value * 100)
  return (
    <div className="relative w-20 h-20 shrink-0">
      <svg viewBox="0 0 80 80" className="w-20 h-20 -rotate-90">
        <circle cx="40" cy="40" r="32" fill="none" stroke="#ebe9e1" strokeWidth="8" />
        <circle cx="40" cy="40" r="32" fill="none" stroke="#ff5722" strokeWidth="8" strokeLinecap="round" strokeDasharray={`${value * 201} 201`} />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-label-lg text-ink">{pctValue}%</span>
    </div>
  )
}

// How much of the time between getting a task and its deadline has passed (0-1), or null without dates
function timeUsed(task) {
  const created = task.createdAt ? new Date(task.createdAt) : null
  const due = task.deadline_date ? new Date(`${task.deadline_date}T23:59:59`) : null
  if (!created || !due || Number.isNaN(created) || Number.isNaN(due) || due <= created) return null
  return Math.min(1, Math.max(0, (Date.now() - created) / (due - created)))
}

function AcceptBanner({ onDecide, busy }) {
  const [declining, setDeclining] = useState(false)
  const [reason, setReason] = useState('')
  return (
    <div className="rounded-card bg-coral-wash p-4 mb-4">
      <p className="text-label-lg text-ink flex items-center gap-2"><Icon name="assignment_ind" size={18} className="text-coral" />New task for you</p>
      <p className="text-body-sm text-ink-2 mt-0.5">Accept it to confirm you’ll do it by the deadline, or decline and tell your manager why.</p>
      {declining ? (
        <form className="mt-3 flex flex-col gap-2" onSubmit={e => { e.preventDefault(); onDecide(false, reason) }}>
          <input autoFocus className="field bg-white" value={reason} onChange={e => setReason(e.target.value)} placeholder="Why can’t you take it? e.g. I’m on leave next week" />
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setDeclining(false)} className="btn btn-ghost btn-sm">Back</button>
            <button disabled={busy || reason.trim().length < 3} className="btn btn-danger btn-sm">Decline task</button>
          </div>
        </form>
      ) : (
        <div className="flex gap-2 mt-3">
          <button disabled={busy} onClick={() => onDecide(true)} className="btn btn-primary btn-sm"><Icon name="check" size={16} />Accept</button>
          <button disabled={busy} onClick={() => setDeclining(true)} className="btn btn-outline btn-sm">Decline</button>
        </div>
      )}
    </div>
  )
}

function ProgressEditor({ task, onSave, busy, onCancel }) {
  const [value, setValue] = useState(task.progress || 0)
  const [note, setNote] = useState('')
  return (
    <form className="mt-4 tile p-4 flex flex-col gap-3" onSubmit={e => { e.preventDefault(); onSave(value, note) }}>
      <div className="flex items-center justify-between">
        <span className="eyebrow text-ink-2">Progress</span>
        <span className="text-label-lg text-ink">{value}%</span>
      </div>
      <input type="range" min="0" max="100" step="10" value={value} onChange={e => setValue(Number(e.target.value))} className="w-full accent-[#ff5722]" />
      <input className="field bg-white" value={note} onChange={e => setNote(e.target.value)} placeholder="Short update, e.g. Designs done, building now" maxLength={500} />
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="btn btn-ghost btn-sm">Cancel</button>
        <button disabled={busy} className="btn btn-primary btn-sm">Save update</button>
      </div>
    </form>
  )
}

function WorkCard({ task, meetingTitle, onStatus, onDecide, onProgress, busy, onOpenMeeting }) {
  const [editingProgress, setEditingProgress] = useState(false)
  const overdue = isOverdue(task)
  const done = task.status === 'done'
  const raw = task.deadline_date || task.deadline
  const used = done ? null : timeUsed(task)
  const awaitingAcceptance = task.acceptance === 'pending' && !done
  return (
    <div className={`bento p-6 flex flex-col anim-fade-up ${overdue ? 'ring-2 ring-coral/30' : awaitingAcceptance ? 'ring-2 ring-coral/20' : ''}`}>
      {awaitingAcceptance && <AcceptBanner busy={busy} onDecide={onDecide} />}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <DueChip task={task} />
        {daysUntil(raw) !== null && <span className="text-body-sm text-ink-2">{relativeDay(raw) === shortDate(raw) ? shortDate(raw) : `${relativeDay(raw)} · ${shortDate(raw)}`}</span>}
        {task.acceptance === 'declined' && <Chip tone="overdue">Declined, waiting for your manager</Chip>}
        {task.confidence !== undefined && task.confidence !== null && <span className="ml-auto text-label-md text-done flex items-center gap-1">{Math.round(task.confidence)}% confidence<Icon name="verified" size={15} /></span>}
      </div>
      <p className={`text-headline-sm text-ink ${done ? 'line-through decoration-ink-3' : ''}`}>{task.title}</p>
      {task.description && <p className="text-body-sm text-ink-2 mt-1">{task.description}</p>}

      {used !== null && (
        <div className="mt-3">
          <div className="flex justify-between text-[11px] text-ink-3 mb-1"><span>Time used</span><span>{Math.round(used * 100)}% of the time to the deadline</span></div>
          <ProgressBar value={used} tone={used >= 1 ? 'overdue' : used > 0.75 ? 'pending' : 'dark'} height={4} />
        </div>
      )}

      {task.evidence_quote && (
        <div className="mt-4">
          <EvidenceQuote quote={task.evidence_quote} speaker={task.speaker} tone={done ? 'done' : overdue ? 'overdue' : 'coral'}
                         label={done ? 'Resolved evidence' : overdue ? 'Commitment logged' : 'Verified meeting evidence'} />
        </div>
      )}
      {meetingTitle && (
        <button onClick={onOpenMeeting} className="mt-3 text-[12px] text-ink-2 hover:text-coral-deep flex items-center gap-1 self-start">
          <Icon name="forum" size={14} />From “{meetingTitle}”
        </button>
      )}

      {!done && task.progress > 0 && !editingProgress && (
        <div className="mt-4">
          <div className="flex justify-between text-[12px] mb-1"><span className="text-ink-2">Your progress{task.progressNote ? `: “${task.progressNote}”` : ''}</span><span className="text-ink font-semibold">{task.progress}%</span></div>
          <ProgressBar value={task.progress / 100} tone="coral" height={5} />
        </div>
      )}
      {editingProgress && <ProgressEditor task={task} busy={busy} onCancel={() => setEditingProgress(false)}
                                          onSave={async (v, n) => { await onProgress(v, n); setEditingProgress(false) }} />}

      <div className="flex-1" />
      <div className="mt-5 pt-4 border-t border-surface-container flex flex-wrap items-center gap-2">
        {done ? (
          <>
            <span className="text-label-md text-done flex items-center gap-1"><Icon name="check_circle" size={16} />Completed</span>
            <button disabled={busy} onClick={() => onStatus('pending')} className="btn btn-secondary btn-sm ml-auto">Reopen</button>
          </>
        ) : (
          <>
            <button disabled={busy} onClick={() => onStatus('done')} className="btn btn-primary btn-sm"><Icon name="check" size={16} />Mark done</button>
            {!editingProgress && <button disabled={busy} onClick={() => setEditingProgress(true)} className="btn btn-secondary btn-sm"><Icon name="trending_up" size={16} />Update progress</button>}
            {task.status !== 'escalated'
              ? <button disabled={busy} onClick={() => onStatus('escalated')} className={`btn btn-sm ml-auto ${overdue ? 'btn-danger' : 'btn-ghost'}`}><Icon name="flag" size={16} />Escalate</button>
              : <span className="ml-auto text-label-md text-escalated flex items-center gap-1"><Icon name="flag" size={16} />Escalated to your manager</span>}
          </>
        )}
      </div>
    </div>
  )
}

export default function EmployeeDashboard() {
  const { userProfile, user } = useAuth()
  const { toast } = useToast()
  const navigate = useNavigate()
  const [tasks, setTasks] = useState([])
  const [meetings, setMeetings] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState(null)
  const [welcomeDismissed, setWelcomeDismissed] = useState(true)
  const isStaff = userProfile?.role === 'pm' || userProfile?.role === 'manager'

  useEffect(() => {
    if (!user) return
    checkOverdueTasks().catch(() => {}).finally(fetchTasks)
    getMeetings().then(res => setMeetings(res.data)).catch(() => {})
    try { setWelcomeDismissed(localStorage.getItem(`welcome_dismissed_${user.uid}`) === '1') } catch { setWelcomeDismissed(false) }
  }, [user])

  async function fetchTasks() {
    try {
      const res = await getMyTasks()
      setTasks(res.data)
    } finally {
      setLoading(false)
    }
  }

  async function run(task, action, success, tone = 'success') {
    setBusy(task.id)
    try {
      await action()
      toast(success, tone)
      await fetchTasks()
    } catch (err) {
      toast(err.response?.data?.detail || 'Could not update the task', 'error')
    } finally {
      setBusy(null)
    }
  }

  async function handleStatus(task, status) {
    setBusy(task.id)
    try {
      await updateTaskStatus(task.id, { status })
      const labels = { done: 'marked as done', escalated: 'escalated to your manager', pending: 'reopened' }
      toast(`“${task.title}” ${labels[status] || status}`, status === 'done' ? 'success' : 'info')
      await fetchTasks()
    } catch (err) {
      toast(err.response?.data?.detail || 'Could not update the task', 'error')
    } finally {
      setBusy(null)
    }
  }

  const meetingTitles = useMemo(() => Object.fromEntries(meetings.map(m => [m.id, m.title])), [meetings])
  const groups = useMemo(() => ({
    pending: tasks.filter(t => t.status !== 'done' && !isOverdue(t)),
    done: tasks.filter(t => t.status === 'done'),
    overdue: tasks.filter(isOverdue),
  }), [tasks])
  const dueThisWeek = groups.pending.filter(t => { const d = daysUntil(t.deadline_date || t.deadline); return d !== null && d <= 7 }).length
  const rate = tasks.length ? groups.done.length / tasks.length : 0
  const weekStart = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d })()
  const lastWeekStart = new Date(weekStart.getTime() - 7 * 86400000)
  const doneIn = (from, to) => groups.done.filter(t => t.completedAt && new Date(t.completedAt) >= from && new Date(t.completedAt) < to).length
  const doneThisWeek = doneIn(weekStart, new Date(8.64e15))
  const doneLastWeek = doneIn(lastWeekStart, weekStart)
  const weekDelta = doneThisWeek - doneLastWeek
  const awaiting = tasks.filter(t => t.acceptance === 'pending' && t.status !== 'done')
  const myByMeeting = tasks.reduce((acc, t) => {
    const m = acc[t.meeting_id] || (acc[t.meeting_id] = { total: 0, overdue: 0, done: 0 })
    m.total++; if (isOverdue(t)) m.overdue++; if (t.status === 'done') m.done++
    return acc
  }, {})

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    const base = filter === 'all' ? tasks : filter === 'accept' ? tasks.filter(t => t.acceptance === 'pending' && t.status !== 'done') : groups[filter]
    const rank = t => (t.status === 'done' ? 1e6 : t.acceptance === 'pending' ? -1e6 : isOverdue(t) ? -1e5 : daysUntil(t.deadline_date || t.deadline) ?? 1e5)
    return base
      .filter(t => !q || t.title.toLowerCase().includes(q) || (t.evidence_quote || '').toLowerCase().includes(q))
      .sort((a, b) => rank(a) - rank(b))
  }, [tasks, groups, filter, search])

  if (loading) return <Loading label="Loading your work…" />

  const firstName = (userProfile?.name || '').split(' ')[0]

  return (
    <div>
      {!welcomeDismissed && (
        <div className="bento p-5 mb-6 flex items-start gap-4">
          <div className="w-11 h-11 rounded-full bg-coral text-white flex items-center justify-center shrink-0"><Icon name="auto_awesome" /></div>
          <div className="flex-1">
            <p className="text-label-lg text-ink">Your tasks come from what was said in meetings</p>
            <p className="text-body-sm text-ink-2 mt-0.5">After each meeting, AI agents turn spoken commitments into tasks, with the exact words they came from. Mark them done as you finish, or escalate if you’re blocked.</p>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => { setWelcomeDismissed(true); try { localStorage.setItem(`welcome_dismissed_${user.uid}`, '1') } catch { /* private mode */ } }}>
            Got it <Icon name="close" size={16} />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-8">
        <div className="bento p-6 sm:p-8 lg:col-span-2 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div className="flex items-center gap-4 min-w-0">
            <div className="relative shrink-0">
              <Avatar name={userProfile?.name || '?'} size={64} />
              <span className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-forest ring-2 ring-white flex items-center justify-center"><Icon name="check" size={13} className="text-white" /></span>
            </div>
            <div className="min-w-0">
              <p className="eyebrow text-coral-deep">Personal execution console</p>
              <h1 className="text-headline-lg text-ink">{greeting()}, <span className="capitalize">{firstName}</span></h1>
              <p className="text-body-sm text-ink-2">{ROLE_LABEL[userProfile?.role]} · {tasks.length} commitment{tasks.length === 1 ? '' : 's'} from meetings</p>
            </div>
          </div>
          <div className="tile flex items-center gap-4 px-5 py-4 shrink-0">
            <ProgressRing value={rate} />
            <div>
              <p className="eyebrow text-ink-3">Completion</p>
              <p className="text-headline-md text-ink">{groups.done.length} of {tasks.length}</p>
              <p className="text-body-sm text-ink-2">done · {doneThisWeek} this week</p>
              {(doneThisWeek > 0 || doneLastWeek > 0) && (
                <p className={`text-[12px] font-semibold ${weekDelta >= 0 ? 'text-done' : 'text-overdue'}`}>{weekDelta >= 0 ? '▲' : '▼'} {Math.abs(weekDelta)} vs last week</p>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-1 gap-5">
          {groups.overdue.length > 0 ? (
            <div className="rounded-bento bg-coral text-white p-6 shadow-coral col-span-2 lg:col-span-1">
              <div className="flex items-start justify-between"><p className="eyebrow text-white/85">Attention</p><Icon name="warning" /></div>
              <p className="text-headline-lg mt-2">{groups.overdue.length} overdue</p>
              <button onClick={() => setFilter('overdue')} className="btn btn-sm bg-white text-coral-deep hover:bg-coral-wash mt-3">Review overdue</button>
            </div>
          ) : (
            <div className="rounded-bento bg-forest text-white p-6 col-span-2 lg:col-span-1">
              <div className="flex items-start justify-between"><p className="eyebrow text-white/85">All clear</p><Icon name="verified" fill /></div>
              <p className="text-headline-md mt-2">Nothing overdue</p>
              <p className="text-body-sm text-white/85 mt-1">Keep it up.</p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-5 col-span-2 lg:col-span-1">
            <div className="bento p-5">
              <p className="eyebrow text-ink-3">Pending</p>
              <p className="text-headline-lg text-ink mt-1">{groups.pending.length}</p>
              <p className="text-[12px] text-pending flex items-center gap-1"><Icon name="schedule" size={14} />{dueThisWeek} due this week</p>
            </div>
            <div className="bento p-5">
              <p className="eyebrow text-ink-3">Completed</p>
              <p className="text-headline-lg text-ink mt-1">{groups.done.length}</p>
              <div className="mt-1.5"><ProgressBar value={rate} tone="done" height={4} /></div>
            </div>
          </div>
        </div>
      </div>

      {awaiting.length > 0 && (
        <div className="rounded-bento bg-coral-wash px-5 py-4 mb-6 flex items-center justify-between gap-3">
          <p className="text-label-lg text-ink flex items-center gap-2"><Icon name="assignment_ind" className="text-coral" />
            {awaiting.length} new task{awaiting.length > 1 ? 's' : ''} waiting for you to accept</p>
          <button onClick={() => setFilter('accept')} className="btn btn-primary btn-sm">Review</button>
        </div>
      )}

      <div className="bento p-2 mb-6 flex flex-col md:flex-row md:items-center justify-between gap-2">
        <Segmented value={filter} onChange={setFilter} className="overflow-x-auto no-scrollbar" options={[
          { value: 'all', label: 'All commitments', count: tasks.length },
          ...(awaiting.length ? [{ value: 'accept', label: 'To accept', count: awaiting.length }] : []),
          { value: 'pending', label: 'Pending', count: groups.pending.length },
          { value: 'done', label: 'Completed', count: groups.done.length },
          { value: 'overdue', label: 'Overdue', count: groups.overdue.length },
        ]} />
        <div className="relative md:w-72">
          <Icon name="search" size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-3" />
          <input className="field pl-11" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tasks or quotes…" />
        </div>
      </div>

      {tasks.length === 0 ? (
        <EmptyState icon="task_alt" title="No tasks yet" text="Tasks appear here once a meeting you were part of has been processed." />
      ) : visible.length === 0 ? (
        <EmptyState icon="filter_alt_off" title="Nothing here" action={<button className="btn btn-secondary" onClick={() => { setFilter('all'); setSearch('') }}>Show everything</button>} />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {visible.map(t => (
            <WorkCard key={t.id} task={t} meetingTitle={meetingTitles[t.meeting_id]} busy={busy === t.id}
                      onStatus={status => handleStatus(t, status)} onOpenMeeting={() => navigate(`/meeting/${t.meeting_id}`)}
                      onDecide={(accept, reason) => run(t, () => decideTask(t.id, accept, reason),
                                                         accept ? `Accepted “${t.title}”` : 'Declined. Your manager has been told why.', accept ? 'success' : 'info')}
                      onProgress={(progress, note) => run(t, () => updateTaskProgress(t.id, { progress, note }), progress === 100 ? `“${t.title}” completed` : `Progress saved: ${progress}%`)} />
          ))}
        </div>
      )}

      {meetings.length > 0 && (
        <div className="bento p-6 sm:p-8 mt-8">
          <div className="flex items-end justify-between gap-4 mb-5">
            <div>
              <p className="text-headline-md text-ink">{isStaff ? 'Recent meetings' : 'Meetings you were part of'}</p>
              <p className="text-body-sm text-ink-2">Open one to read the minutes, decisions and risks.</p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {meetings.slice(0, 8).map(m => (
              <button key={m.id} onClick={() => navigate(`/meeting/${m.id}`)} className="tile p-5 text-left hover:bg-surface-container transition-colors flex flex-col">
                <div className="flex items-center justify-between gap-2 mb-3">
                  {m.department ? <Chip tone="coral">{m.department}</Chip> : <span />}
                  <span className="text-[12px] text-ink-2">{relativeDay(m.date)}</span>
                </div>
                <p className="text-label-lg text-ink leading-snug">{m.title}</p>
                {m.duration_minutes ? <p className="text-[12px] text-ink-2 mt-1">{duration(m.duration_minutes, m.duration_estimated)}{m.source === 'extension' ? ' · Google Meet' : ''}</p> : null}
                <div className="flex-1" />
                {m.participant_names?.length > 0 && <div className="mt-3"><AvatarStack names={m.participant_names} max={4} size={26} /></div>}
                <div className="flex items-center justify-between mt-3">
                  {(() => {
                    const mine = myByMeeting[m.id]
                    if (!mine) return <span className="text-[12px] text-ink-3">No tasks for you</span>
                    if (mine.overdue) return <Chip tone="overdue">{mine.total} task{mine.total > 1 ? 's' : ''} · {mine.overdue} overdue</Chip>
                    if (mine.done === mine.total) return <Chip tone="done">All {mine.total} done</Chip>
                    return <Chip tone="outline">{mine.total} task{mine.total > 1 ? 's' : ''} · {mine.done} done</Chip>
                  })()}
                  <Icon name="arrow_forward" size={18} className="text-ink-3" />
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {isStaff && (
        <div className="rounded-bento bg-panel text-white p-6 mt-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 rounded-full bg-white/10 flex items-center justify-center"><Icon name="extension" /></div>
            <div>
              <p className="text-label-lg">Chrome extension: hands-free meeting capture</p>
              <p className="text-body-sm text-ink-3">Join a Google Meet and commitments are logged automatically, with speaker names.</p>
            </div>
          </div>
          <button onClick={() => navigate('/connect-extension')} className="btn bg-white text-ink hover:bg-surface-container">Check extension status</button>
        </div>
      )}
    </div>
  )
}
