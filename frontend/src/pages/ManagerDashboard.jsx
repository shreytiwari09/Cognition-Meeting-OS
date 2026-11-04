import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import TeamPanel from '../components/TeamPanel'
import { exportAuditLog, getTeamPerformance, validateTask } from '../api'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { Avatar, Chip, EmptyState, Icon, Loading, ProgressBar, SectionHeader, Segmented, StatCard } from '../components/ui'
import { PERSON_STATUS, SEVERITY, pct, rateTone, shortDate, titleCase } from '../lib/format'

const WINDOWS = [5, 10, 20]
const ALERT_ICON = { behind: 'trending_down', overdue: 'schedule', declining: 'south_east', stale: 'hourglass_empty', overloaded: 'stacks', escalated: 'priority_high' }
const RATE_TEXT = { done: 'text-done', pending: 'text-pending', overdue: 'text-overdue', info: 'text-ink-3' }

function TaskSquares({ dots }) {
  return (
    <div className="flex flex-wrap gap-1.5" title="One square per task from these meetings, oldest first">
      {dots.map((d, i) => (
        <span key={i} className={`w-7 h-7 rounded-lg flex items-center justify-center ${
          d === 'done' ? 'bg-forest-soft text-forest' : d === 'overdue' ? 'bg-coral text-white' : 'bg-surface-container text-ink-3'}`}>
          <Icon name={d === 'done' ? 'check' : d === 'overdue' ? 'priority_high' : 'more_horiz'} size={15} />
        </span>
      ))}
    </div>
  )
}

function MemberCard({ member, windowSize, expanded, onToggle, onOpenMeeting }) {
  const s = PERSON_STATUS[member.status]
  const w = member.window
  const tone = rateTone(w.rate)
  return (
    <div id={`member-${member.uid}`} className={`bento p-6 transition-shadow ${expanded ? 'ring-2 ring-coral/30' : ''}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <Avatar name={member.name} size={46} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-headline-sm text-ink capitalize">{member.name}</p>
              <Chip tone={s.tone} dot>{s.label}</Chip>
            </div>
            <p className="text-body-sm text-ink-2">{[member.jobTitle, member.role === 'manager' ? 'Manager' : member.managerName ? `Team of ${member.managerName}` : 'Employee'].filter(Boolean).join(' · ')}</p>
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className={`text-headline-md ${RATE_TEXT[tone]}`}>{w.assigned ? `${w.done}/${w.assigned}` : '—'}<span className="text-body-sm text-ink-2 font-medium ml-1">{w.assigned ? `done (${pct(w.rate)})` : ''}</span></p>
          {member.trend !== null && member.trend !== 0 && (
            <p className={`text-label-md ${member.trend > 0 ? 'text-done' : 'text-overdue'}`}>{member.trend > 0 ? '▲' : '▼'} {Math.abs(Math.round(member.trend * 100))} pts trend</p>
          )}
        </div>
      </div>

      {member.dots.length > 0 && (
        <div className="mt-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-label-md text-ink-2">Commitments from the last {windowSize} meetings</span>
            <span className="text-label-md text-ink-2">{w.overdue} overdue · {w.open} open</span>
          </div>
          <TaskSquares dots={member.dots} />
        </div>
      )}

      {member.oldestOverdue && (
        <p className="mt-4 text-body-sm text-overdue flex items-center gap-1.5">
          <Icon name="schedule" size={16} className="shrink-0" />
          <span>Oldest overdue: <button onClick={() => onOpenMeeting(member.oldestOverdue.meetingId)} className="font-semibold hover:underline">{member.oldestOverdue.title}</button>, {member.oldestOverdue.daysLate} day{member.oldestOverdue.daysLate === 1 ? '' : 's'} late</span>
        </p>
      )}

      <div className="tile mt-5 px-4 py-3 grid grid-cols-3 gap-2">
        <div><p className={`text-label-lg ${member.allTime.overdue ? 'text-overdue' : 'text-ink'}`}>{member.allTime.overdue}</p><p className="text-[12px] text-ink-2">Overdue</p></div>
        <div><p className="text-label-lg text-ink">{member.allTime.open}</p><p className="text-[12px] text-ink-2">Open</p></div>
        <div><p className="text-label-lg text-ink">{pct(member.allTime.onTimeRate)}</p><p className="text-[12px] text-ink-2">On time · all time</p></div>
      </div>

      {(member.alerts.length > 0 || member.openTasks.length > 0) && (
        <button onClick={onToggle} className="mt-4 text-label-md text-coral-deep hover:text-coral flex items-center gap-1">
          {expanded ? 'Hide details' : `Details${member.alerts.length ? ` · ${member.alerts.length} alert${member.alerts.length > 1 ? 's' : ''}` : ''}`}
          <Icon name={expanded ? 'expand_less' : 'expand_more'} size={18} />
        </button>
      )}

      {expanded && (
        <div className="mt-3 flex flex-col gap-3 anim-fade-up">
          {member.alerts.map((a, i) => (
            <div key={i} className="flex gap-2.5 items-start">
              <Chip tone={SEVERITY[a.severity].tone} className="uppercase mt-0.5">{SEVERITY[a.severity].label}</Chip>
              <p className="text-body-sm text-ink">{a.message}</p>
            </div>
          ))}
          {member.openTasks.length > 0 && (
            <div className="tile p-3">
              <p className="eyebrow text-ink-3 mb-2 px-1">Open tasks</p>
              {member.openTasks.map(t => (
                <button key={t.id} onClick={() => onOpenMeeting(t.meetingId)} className="w-full flex justify-between gap-3 px-1 py-1.5 rounded-lg hover:bg-white text-left">
                  <span className="text-body-sm text-ink">{t.title}</span>
                  <span className={`text-label-md whitespace-nowrap ${t.overdue ? 'text-overdue' : 'text-ink-2'}`}>{t.overdue ? 'Overdue · ' : ''}{t.deadline ? shortDate(t.deadline) : 'no date'}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function SideCard({ title, icon, badge, children }) {
  return (
    <div className="bento p-6">
      <div className="flex items-center justify-between gap-3 mb-4">
        <p className="text-headline-sm text-ink flex items-center gap-2">{icon && <Icon name={icon} size={20} className="text-coral" />}{title}</p>
        {badge}
      </div>
      {children}
    </div>
  )
}

function VelocityChart({ weeks }) {
  if (!weeks?.length) return null
  const max = Math.max(1, ...weeks.flatMap(w => [w.created, w.completed]))
  const label = iso => new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const last = weeks[weeks.length - 1], prev = weeks[weeks.length - 2]
  // This week isn't over, so compare "so far" rather than showing a misleading drop
  return (
    <SideCard title="Weekly velocity" icon="speed"
              badge={prev && <Chip tone="outline">{last.completed} done so far · {prev.completed} last week</Chip>}>
      <div className="flex items-end justify-between gap-2 h-36">
        {weeks.map((w, i) => (
          <div key={w.week} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end" title={`Week of ${label(w.week)}: ${w.created} created, ${w.completed} completed`}>
            <div className="flex items-end gap-1 flex-1 w-full justify-center">
              <div className="w-3 rounded-full bg-subtle" style={{ height: `${Math.max(4, (w.created / max) * 100)}%` }} />
              <div className={`w-3 rounded-full ${i === weeks.length - 1 ? 'bg-coral' : 'bg-forest'}`} style={{ height: `${Math.max(4, (w.completed / max) * 100)}%` }} />
            </div>
            <span className={`text-[10px] font-semibold ${i === weeks.length - 1 ? 'text-coral-deep' : 'text-ink-3'}`}>{i === weeks.length - 1 ? 'This wk' : label(w.week)}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3 mt-3 text-[12px] text-ink-2">
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-subtle ring-1 ring-black/10" />Created</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-forest" />Completed</span>
      </div>
    </SideCard>
  )
}

function CompletionChart({ meetings }) {
  const rows = [...meetings].reverse().slice(-8)
  if (!rows.length) return null
  return (
    <SideCard title="Delivered per meeting" icon="bar_chart">
      <div className="flex items-end justify-between gap-2 h-36">
        {rows.map(m => {
          const rate = m.tasks ? m.done / m.tasks : 0
          return (
            <div key={m.id} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end" title={`${m.title}: ${m.done}/${m.tasks} done`}>
              <div className="w-full max-w-9 rounded-full bg-subtle flex-1 flex items-end overflow-hidden">
                <div className={`w-full rounded-full ${rate >= 0.8 ? 'bg-forest' : rate >= 0.5 ? 'bg-coral' : 'bg-coral/50'}`} style={{ height: `${Math.max(rate * 100, 6)}%` }} />
              </div>
              <span className="text-[10px] text-ink-3 font-semibold">{shortDate(m.date)}</span>
            </div>
          )
        })}
      </div>
      <p className="text-[12px] text-ink-2 mt-3">Share of each meeting’s tasks that are done, oldest to newest.</p>
    </SideCard>
  )
}

export default function ManagerDashboard() {
  const { user, userProfile } = useAuth()
  const { toast } = useToast()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const activeTab = params.get('tab') === 'members' ? 'members' : 'performance'
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [windowSize, setWindowSize] = useState(10)
  const [expanded, setExpanded] = useState(null)
  const [filter, setFilter] = useState('all')
  const [deciding, setDeciding] = useState(null)
  const isOwner = userProfile?.role === 'pm'
  const [exporting, setExporting] = useState(false)

  async function downloadAuditLog() {
    setExporting(true)
    try {
      const res = await exportAuditLog()
      const url = URL.createObjectURL(res.data)
      const a = Object.assign(document.createElement('a'), { href: url, download: `meetingos-audit-log-${new Date().toISOString().slice(0, 10)}.csv` })
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast('Could not export the audit log', 'error')
    } finally {
      setExporting(false)
    }
  }

  function load(win = windowSize) {
    return getTeamPerformance(win)
      .then(res => setData(res.data))
      .catch(err => toast(err.response?.data?.detail || 'Failed to load team performance', 'error'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { if (user) load(windowSize) }, [user, windowSize])

  function focusMember(uid) {
    setFilter('all')
    setExpanded(uid)
    setTimeout(() => document.getElementById(`member-${uid}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60)
  }

  async function decide(task, decision) {
    setDeciding(task.id)
    try {
      await validateTask(task.id, { validated: decision })
      toast(`“${task.title}” ${decision}`, decision === 'approved' ? 'success' : 'warning')
      await load()
    } catch (err) {
      toast(err.response?.data?.detail || 'Only the team’s manager or the owner can do that', 'error')
    } finally {
      setDeciding(null)
    }
  }

  const sm = data?.summary
  const members = (data?.members || []).filter(m =>
    filter === 'all' || (filter === 'flagged' ? ['at_risk', 'attention'].includes(m.status) : m.status === filter))
  const serious = (data?.alerts || []).filter(a => a.severity !== 'info')
  const count = s => (data?.members || []).filter(m => (s === 'flagged' ? ['at_risk', 'attention'].includes(m.status) : m.status === s)).length

  return (
    <div>
      <SectionHeader
        eyebrow={<><span className="w-1.5 h-1.5 rounded-full bg-forest anim-pulse" />{isOwner ? 'Whole company' : 'Your team'} · live from meeting transcripts</>}
        title="Team Performance & Execution"
        subtitle="How much of the work agreed in meetings is actually getting done, and who needs a nudge."
        actions={<>
          <Segmented value={activeTab} onChange={v => setParams(v === 'members' ? { tab: 'members' } : {}, { replace: true })}
                     options={[{ value: 'performance', label: 'Performance' }, { value: 'members', label: 'Members & invites' }]} />
          {activeTab === 'performance' && (
            <button onClick={downloadAuditLog} disabled={exporting} className="btn btn-outline">
              <Icon name={exporting ? 'progress_activity' : 'download'} size={18} className={exporting ? 'anim-spin' : ''} />Export audit log
            </button>
          )}
          {activeTab === 'performance' && (
            <div className="segmented items-center">
              <span className="text-label-md text-ink-2 px-2">Last</span>
              {WINDOWS.map(n => (
                <button key={n} data-active={windowSize === n} onClick={() => { setLoading(true); setWindowSize(n) }}>{n === 10 ? '10 meetings' : n}</button>
              ))}
            </div>
          )}
        </>}
      />

      {activeTab === 'members' ? <TeamPanel /> : loading || !data ? <Loading label="Crunching team performance…" /> : (
        <>
          {data.meetingsInWindow > 0 && data.meetingsInWindow < windowSize && (
            <p className="text-body-sm text-ink-2 -mt-4 mb-6">Only {data.meetingsInWindow} completed meeting{data.meetingsInWindow > 1 ? 's' : ''} so far, so the numbers cover all of them.</p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-5 mb-8">
            <StatCard title="Completion rate" icon="task_alt" value={pct(sm.completionRate)} tone={rateTone(sm.completionRate)} sub={`${sm.done} of ${sm.assigned} tasks done`}>
              <div className="mt-3"><ProgressBar value={sm.completionRate || 0} tone="done" /></div>
            </StatCard>
            <StatCard hero title="Overdue impact" icon="warning" value={sm.overdue} unit="overdue" sub={`${sm.escalated} escalated · requires follow-up`} />
            <StatCard title="On-time delivery" icon="timer" value={pct(sm.onTimeRate)} sub="of finished tasks with a deadline" />
            <StatCard title="People at risk" icon="person_alert" value={sm.atRisk} tone={sm.atRisk ? 'overdue' : undefined} sub={`${sm.needAttention} more need attention`} />
            <StatCard title="Awaiting sign-off" icon="approval" value={sm.pendingApproval} tone={sm.pendingApproval ? 'coral' : undefined} sub="AI tasks flagged for review" />
          </div>

          {serious.length > 0 ? (
            <div className="rounded-bento bg-surface-container p-5 sm:p-6 mb-8">
              <div className="flex items-center justify-between mb-4">
                <p className="text-headline-sm text-ink flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-coral" />Needs your attention
                  <Chip tone="coral" className="ml-1">{serious.length} exception{serious.length > 1 ? 's' : ''}</Chip></p>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                {serious.slice(0, 6).map((a, i) => (
                  <button key={i} onClick={() => focusMember(a.uid)} className="bg-white rounded-card p-4 text-left flex gap-3 hover:shadow-float transition-shadow">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${a.severity === 'critical' ? 'bg-overdue-bg text-overdue' : 'bg-pending-bg text-pending'}`}>
                      <Icon name={ALERT_ICON[a.kind] || 'error'} size={18} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-label-lg text-ink capitalize">{a.name}</span>
                        <Chip tone={SEVERITY[a.severity].tone} className="uppercase">{SEVERITY[a.severity].label}</Chip>
                      </div>
                      <p className="text-body-sm text-ink-2">{a.message}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : data.members.length > 0 && (
            <div className="rounded-bento bg-forest-soft text-forest p-5 mb-8 flex items-center gap-3">
              <Icon name="verified" fill /><p className="text-label-lg">Nobody is falling behind right now.</p>
            </div>
          )}

          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
            <div className="xl:col-span-8 min-w-0">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                <Segmented value={filter} onChange={setFilter} className="overflow-x-auto no-scrollbar" options={[
                  { value: 'all', label: 'Everyone', count: data.members.length },
                  { value: 'flagged', label: 'Flagged', count: count('flagged') },
                  { value: 'on_track', label: 'On track', count: count('on_track') },
                  { value: 'no_tasks', label: 'No tasks', count: count('no_tasks') },
                ]} />
                <div className="flex items-center gap-3 text-label-md text-ink-2">
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-forest-soft ring-1 ring-forest/30" />Done</span>
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-surface-container" />Open</span>
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-coral" />Overdue</span>
                </div>
              </div>
              {data.members.length === 0 ? (
                <EmptyState icon="group_add" title={isOwner ? 'Nobody has joined yet' : 'Your team is empty'}
                            text="Invite people from the Members & invites tab."
                            action={<button className="btn btn-primary" onClick={() => setParams({ tab: 'members' })}><Icon name="person_add" size={18} />Invite people</button>} />
              ) : (
                <div className="flex flex-col gap-4">
                  {members.map(m => (
                    <MemberCard key={m.uid} member={m} windowSize={Math.min(windowSize, data.meetingsInWindow) || windowSize}
                                expanded={expanded === m.uid} onToggle={() => setExpanded(expanded === m.uid ? null : m.uid)}
                                onOpenMeeting={id => navigate(`/meeting/${id}`)} />
                  ))}
                </div>
              )}
            </div>

            <div className="xl:col-span-4 flex flex-col gap-6">
              <SideCard title="Awaiting sign-off" icon="approval" badge={<Chip tone="coral">{data.pendingApproval.length} pending</Chip>}>
                {data.pendingApproval.length === 0 ? <p className="text-body-md text-ink-3">Nothing waiting for you.</p> : (
                  <div className="flex flex-col gap-3">
                    {data.pendingApproval.map(t => (
                      <div key={t.id} className="tile p-4">
                        <div className="flex items-start justify-between gap-2">
                          <button onClick={() => navigate(`/meeting/${t.meetingId}`)} className="text-label-lg text-ink text-left hover:text-coral-deep">{t.title}</button>
                          {t.confidence !== null && t.confidence !== undefined && <Chip tone={t.confidence >= 80 ? 'done' : t.confidence >= 50 ? 'pending' : 'overdue'}>{Math.round(t.confidence)}%</Chip>}
                        </div>
                        <p className="text-[12px] text-ink-2 mt-0.5 capitalize">{titleCase(t.owner) || 'Unassigned'}{t.deadline ? ` · due ${shortDate(t.deadline)}` : ''}</p>
                        {t.quote && <p className="text-body-sm italic text-ink-2 mt-2 bg-white rounded-xl px-3 py-2">“{t.quote}”</p>}
                        {t.reason && <p className="text-[12px] text-coral-deep mt-2 flex gap-1"><Icon name="flag" size={14} />{t.reason}</p>}
                        <div className="flex justify-end gap-2 mt-3">
                          <button disabled={deciding === t.id} onClick={() => decide(t, 'rejected')} className="btn btn-ghost btn-sm">Reject</button>
                          <button disabled={deciding === t.id} onClick={() => decide(t, 'approved')} className="btn btn-primary btn-sm">Approve task</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </SideCard>

              <SideCard title="Due in the next 7 days" icon="event_upcoming">
                {data.upcoming.length === 0 ? <p className="text-body-md text-ink-3">No upcoming deadlines.</p> : (
                  <div className="flex flex-col gap-3">
                    {data.upcoming.map(t => (
                      <button key={t.id} onClick={() => navigate(`/meeting/${t.meetingId}`)} className="flex items-start justify-between gap-3 text-left group">
                        <div className="flex gap-2.5 min-w-0">
                          <span className="w-2 h-2 rounded-full bg-coral mt-1.5 shrink-0" />
                          <div className="min-w-0">
                            <p className="text-label-lg text-ink group-hover:text-coral-deep truncate">{t.title}</p>
                            <p className="text-[12px] text-ink-2 capitalize">{t.owner}</p>
                          </div>
                        </div>
                        <span className="text-label-md text-ink whitespace-nowrap">{shortDate(t.deadline)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </SideCard>

              <SideCard title="Risks raised" icon="shield" badge={data.risks.length > 0 && <Chip tone="overdue">{data.risks.length} active</Chip>}>
                {data.risks.length === 0 ? <p className="text-body-md text-ink-3">No risks raised recently.</p> : (
                  <div className="flex flex-col gap-3">
                    {data.risks.map((r, i) => (
                      <button key={i} onClick={() => navigate(`/meeting/${r.meetingId}`)} className="tile p-4 text-left hover:bg-surface-container">
                        <div className="flex justify-between gap-2"><p className="text-label-md text-coral-deep">{r.title}</p><span className="text-[11px] text-ink-3 shrink-0">{r.meetingTitle}</span></div>
                        {r.description && <p className="text-body-sm text-ink-2 mt-1">{r.description}</p>}
                      </button>
                    ))}
                  </div>
                )}
              </SideCard>

              <VelocityChart weeks={data.weekly} />
              <CompletionChart meetings={data.meetings} />

              <SideCard title="Recent meetings" icon="history">
                {data.meetings.length === 0 ? <p className="text-body-md text-ink-3">No completed meetings yet.</p> : (
                  <div className="flex flex-col gap-2">
                    {data.meetings.map(m => (
                      <button key={m.id} onClick={() => navigate(`/meeting/${m.id}`)} className="flex items-center justify-between gap-3 rounded-xl px-2 py-2 -mx-2 hover:bg-surface-container-low text-left">
                        <div className="min-w-0">
                          <p className="text-label-lg text-ink truncate">{m.title}</p>
                          <p className="text-[12px] text-ink-2">{shortDate(m.date)}{m.auditFindings ? ` · ${m.auditFindings} audit finding${m.auditFindings > 1 ? 's' : ''}` : ''}</p>
                        </div>
                        <span className={`text-label-md whitespace-nowrap ${m.flagged ? 'text-coral-deep' : 'text-done'}`}>{m.done}/{m.tasks} done{m.flagged ? ` · ${m.flagged} flagged` : ''}</span>
                      </button>
                    ))}
                  </div>
                )}
              </SideCard>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
