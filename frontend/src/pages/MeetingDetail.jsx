import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import TaskCard from '../components/TaskCard'
import { addMeetingTask, chatMeeting, getCompanyTeam, getMeeting, reassignTask, regenerateSummary, validateTask } from '../api'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { AvatarStack, Chip, EmptyState, EvidenceQuote, Icon, Loading, Segmented } from '../components/ui'
import { useDocumentTitle, usePageMeta } from '../lib/pageMeta'
import { MEETING_STATUS, SEVERITY, dateTime, duration } from '../lib/format'

// The 7 agents in pipeline order, matched against audit-trail entries
const PIPELINE = [
  { key: 'Meeting Extraction Specialist', label: 'Extract' },
  { key: 'Task Assignment Specialist', label: 'Assign' },
  { key: 'Task Validation Specialist', label: 'Validate' },
  { key: 'Follow-up Coordinator', label: 'Follow-up' },
  { key: 'Confidence Analyst', label: 'Confidence' },
  { key: 'Audit & Compliance Reviewer', label: 'Audit' },
  { key: 'Meeting Summary Specialist', label: 'Summary' },
]
const AGENT_COLORS = {
  'Meeting Extraction Specialist': '#7c3aed', 'Task Assignment Specialist': '#1d4ed8', 'Task Validation Specialist': '#b45309',
  'Follow-up Coordinator': '#c2410c', 'Confidence Analyst': '#15803d', 'Audit & Compliance Reviewer': '#dc2626',
  'Meeting Summary Specialist': '#be185d', System: '#a1a1aa',
}

function parseSections(mom) {
  const sections = []
  let current = null
  for (const line of (mom || '').split('\n')) {
    const h = line.match(/^##\s+(.+)/)
    if (h) { current = { title: h[1].trim(), lines: [] }; sections.push(current) }
    else if (current) current.lines.push(line)
  }
  return sections.length ? sections : [{ title: 'Meeting summary', lines: (mom || '').split('\n') }]
}

function Inline({ text }) {
  // **bold** support for agent-written markdown
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? <strong key={i} className="font-semibold text-ink">{part.slice(2, -2)}</strong> : part)
}

function Markdown({ lines }) {
  return lines.map((raw, i) => {
    const line = raw.trim()
    if (!line) return null
    const bullet = line.match(/^[-*•]\s+(.*)/)
    if (bullet) return <li key={i} className="flex gap-2.5 text-body-md text-ink-2"><span className="w-1.5 h-1.5 rounded-full bg-coral mt-2 shrink-0" /><span><Inline text={bullet[1]} /></span></li>
    return <p key={i} className="text-body-md text-ink-2 leading-relaxed"><Inline text={line} /></p>
  })
}

function exportMarkdown(meeting) {
  const lines = [`# ${meeting.title}`, '', `${dateTime(meeting.date)} · ${meeting.participants.map(p => p.name).join(', ')}`, '']
  if (meeting.mom) lines.push(meeting.mom, '')
  if (meeting.tasks.length) {
    lines.push('## Tasks')
    for (const t of meeting.tasks) lines.push(`- **${t.title}** — ${t.assigned_to || 'unassigned'}${t.deadline ? `, due ${t.deadline}` : ''}${t.evidence_quote ? `\n  > “${t.evidence_quote}” — ${t.speaker || ''}` : ''}`)
    lines.push('')
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/markdown' })
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(blob), download: `${meeting.title.replace(/[^\w]+/g, '-').toLowerCase() || 'meeting'}.md`,
  })
  a.click()
  URL.revokeObjectURL(a.href)
}

function EfficiencyCard({ tasks }) {
  const score = tasks.length ? Math.round(tasks.reduce((s, t) => s + (t.confidence || 0), 0) / tasks.length) : 0
  const actionable = tasks.filter(t => t.owner_uid && t.deadline_date).length
  const flagged = tasks.filter(t => t.needs_review && t.validated === 'pending').length
  const color = score >= 75 ? '#15803d' : score >= 50 ? '#f59e0b' : '#dc2626'
  const label = score >= 75 ? 'Clear, owned commitments' : score >= 50 ? 'Some tasks need detail' : 'Many vague commitments'
  return (
    <div className="bento p-6">
      <p className="eyebrow text-ink-2">Meeting efficiency</p>
      <div className="flex items-center gap-5 mt-4">
        <div className="relative w-20 h-20 shrink-0">
          <svg viewBox="0 0 80 80" className="w-20 h-20 -rotate-90">
            <circle cx="40" cy="40" r="34" fill="none" stroke="#ebe9e1" strokeWidth="8" />
            <circle cx="40" cy="40" r="34" fill="none" stroke={color} strokeWidth="8" strokeLinecap="round" strokeDasharray={`${score * 2.136} 213.6`} />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-headline-md text-ink">{tasks.length ? score : '—'}</span>
        </div>
        <div>
          <p className="text-label-lg text-ink">{tasks.length ? label : 'No tasks yet'}</p>
          <p className="text-body-sm text-ink-2 mt-0.5">Average confidence across clarity, owner, deadline and evidence.</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 mt-5 pt-4 border-t border-surface-container">
        <div><p className="eyebrow text-ink-3">Actionable</p><p className="text-label-lg text-ink mt-0.5">{actionable} of {tasks.length} <span className="text-ink-2 font-medium">owner + date</span></p></div>
        <div><p className="eyebrow text-ink-3">To review</p><p className={`text-label-lg mt-0.5 ${flagged ? 'text-coral-deep' : 'text-ink'}`}>{flagged} flagged</p></div>
      </div>
    </div>
  )
}

function PipelineCard({ meeting }) {
  const ran = new Set(meeting.logs.map(l => l.agent))
  const findings = (meeting.audit?.findings || []).filter(f => f.severity !== 'info').length
  const metrics = [
    { label: 'Tasks', value: meeting.tasks.length, sub: `${meeting.tasks.filter(t => t.validated === 'approved').length} approved` },
    { label: 'Decisions', value: meeting.decisions.length, sub: 'with quotes' },
    { label: 'Risks', value: meeting.risks.length, sub: 'raised' },
    { label: 'Audit', value: findings, sub: findings ? 'findings' : 'all clear', tone: findings ? 'text-coral-deep' : 'text-done' },
  ]
  return (
    <div className="bento p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-coral-wash text-coral flex items-center justify-center"><Icon name="hub" /></div>
          <div>
            <p className="text-headline-sm text-ink">Agent pipeline</p>
            <p className="text-body-sm text-ink-2">7 AI agents in two crews processed this transcript.</p>
          </div>
        </div>
        {meeting.audit && (
          <Chip tone={meeting.audit.passed ? 'done' : 'pending'} dot>{meeting.audit.passed ? 'Audit passed' : 'Audit flagged items'}</Chip>
        )}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
        {metrics.map(m => (
          <div key={m.label} className="tile px-4 py-3">
            <p className="eyebrow text-ink-3">{m.label}</p>
            <p className={`text-headline-md mt-1 ${m.tone || 'text-ink'}`}>{m.value}</p>
            <p className="text-[12px] text-ink-2">{m.sub}</p>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1.5 mt-4">
        <span className="text-label-md text-ink-2 mr-1">Pipeline:</span>
        {PIPELINE.map((p, i) => {
          const done = ran.has(p.key)
          const running = !done && meeting.status === 'processing' && (i === 0 || ran.has(PIPELINE[i - 1].key))
          return (
            <span key={p.key} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
              done ? 'bg-forest-soft text-forest' : running ? 'bg-coral-soft text-coral-deep' : 'bg-surface-container text-ink-3'}`}>
              {done ? <Icon name="check" size={12} /> : running ? <Icon name="progress_activity" size={12} className="anim-spin" /> : null}
              {i + 1}. {p.label}
            </span>
          )
        })}
      </div>
    </div>
  )
}

const RISK_SEVERITY = { high: { label: 'High', tone: 'overdue' }, medium: { label: 'Medium', tone: 'pending' }, low: { label: 'Low', tone: 'info' } }

function InsightList({ title, icon, items, tone, empty }) {
  const color = tone === 'risk' ? 'bg-overdue-bg text-overdue' : 'bg-forest-soft text-forest'
  return (
    <div className="bento p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className={`w-9 h-9 rounded-full flex items-center justify-center ${color}`}><Icon name={icon} size={18} /></div>
          <p className="text-headline-sm text-ink">{title}</p>
        </div>
        <Chip tone={tone === 'risk' ? 'overdue' : 'done'}>{items.length}</Chip>
      </div>
      {items.length === 0 ? <p className="text-body-md text-ink-3">{empty}</p> : (
        <div className="flex flex-col gap-3">
          {items.map((d, i) => (
            <div key={i} className="tile p-4">
              <div className="flex items-start justify-between gap-2">
                <p className="text-label-lg text-ink">{i + 1}. {d.title}</p>
                {tone === 'risk' && d.severity && <Chip tone={RISK_SEVERITY[d.severity]?.tone} className="uppercase shrink-0">{RISK_SEVERITY[d.severity]?.label} severity</Chip>}
              </div>
              {d.description && <p className="text-body-sm text-ink-2 mt-1">{d.description}</p>}
              {tone === 'risk' && d.mitigation && (
                <p className="text-body-sm text-ink mt-2 flex gap-1.5 bg-white rounded-xl px-3 py-2"><Icon name="shield" size={16} className="text-forest shrink-0 mt-px" /><span><b className="font-semibold">Mitigation:</b> {d.mitigation}</span></p>
              )}
              {d.evidence_quote && <div className="mt-2.5"><EvidenceQuote compact quote={d.evidence_quote} speaker={d.speaker} tone={tone === 'risk' ? 'overdue' : 'done'} /></div>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function AuditCard({ audit }) {
  if (!audit) return null
  const findings = audit.findings || []
  return (
    <div className="bento p-6">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5">
          <Icon name={audit.passed ? 'verified' : 'gpp_maybe'} className={audit.passed ? 'text-forest' : 'text-coral'} fill />
          <p className="text-headline-sm text-ink">Audit & compliance verdict</p>
        </div>
        <Chip tone={audit.passed ? 'done' : 'pending'}>{audit.passed ? 'Passed' : `${findings.filter(f => f.severity !== 'info').length} to resolve`}</Chip>
      </div>
      {audit.summary && <p className="text-body-md text-ink-2">{audit.summary}</p>}
      {findings.length > 0 && (
        <div className="flex flex-col gap-2 mt-4">
          {findings.map((f, i) => {
            const sev = SEVERITY[f.severity] || SEVERITY.info
            return (
              <div key={i} className="flex gap-3 items-start tile px-4 py-3">
                <Chip tone={sev.tone} className="mt-0.5 uppercase">{sev.label}</Chip>
                <div className="min-w-0">
                  {f.task_title && <p className="text-label-md text-ink">{f.task_title}</p>}
                  <p className="text-body-sm text-ink-2">{f.message}{f.source === 'automated' && <span className="text-ink-3"> · automated check</span>}</p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function AddTaskForm({ meetingId, teamMembers, onAdded, onCancel }) {
  const { toast } = useToast()
  const [form, setForm] = useState({ title: '', description: '', assignee: '', deadline: '', evidence_quote: '' })
  const [busy, setBusy] = useState(false)
  const set = key => e => setForm({ ...form, [key]: e.target.value })
  async function submit(e) {
    e.preventDefault()
    if (form.title.trim().length < 3) return toast('Give the task a short title.', 'warning')
    if (!form.assignee) return toast('Choose who should do it.', 'warning')
    setBusy(true)
    try {
      await addMeetingTask(meetingId, form)
      toast('Task added. The assignee will be asked to accept it.', 'success')
      onAdded()
    } catch (err) {
      toast(err.response?.data?.detail?.toString() || 'Could not add the task', 'error')
    } finally {
      setBusy(false)
    }
  }
  return (
    <form onSubmit={submit} className="bento p-6 ring-2 ring-coral/25 anim-fade-up">
      <div className="flex items-center justify-between mb-4">
        <p className="text-headline-sm text-ink flex items-center gap-2"><Icon name="add_task" className="text-coral" />Add a task</p>
        <button type="button" onClick={onCancel} className="btn btn-ghost btn-sm" aria-label="Cancel"><Icon name="close" size={18} /></button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <label className="flex flex-col gap-1.5 md:col-span-2">
          <span className="eyebrow text-ink-2">Task</span>
          <input autoFocus className="field" value={form.title} onChange={set('title')} placeholder="e.g. Send the revised pricing to legal" />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="eyebrow text-ink-2">Assignee</span>
          <select className="field" value={form.assignee} onChange={set('assignee')}>
            <option value="">Choose a person…</option>
            {teamMembers.map(m => <option key={m.uid} value={m.uid}>{m.name}{m.jobTitle ? ` · ${m.jobTitle}` : ''}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="eyebrow text-ink-2">Deadline <span className="normal-case tracking-normal font-medium text-ink-3">· optional</span></span>
          <input className="field" type="date" value={form.deadline} onChange={set('deadline')} min={new Date().toISOString().slice(0, 10)} />
        </label>
        <label className="flex flex-col gap-1.5 md:col-span-2">
          <span className="eyebrow text-ink-2">Details <span className="normal-case tracking-normal font-medium text-ink-3">· optional</span></span>
          <textarea className="field min-h-[80px]" value={form.description} onChange={set('description')} placeholder="What needs to happen, and what “done” looks like" />
        </label>
        <label className="flex flex-col gap-1.5 md:col-span-2">
          <span className="eyebrow text-ink-2">Quote from the meeting <span className="normal-case tracking-normal font-medium text-ink-3">· optional</span></span>
          <input className="field" value={form.evidence_quote} onChange={set('evidence_quote')} placeholder="Paste what was said, if you want it shown as evidence" />
        </label>
      </div>
      <div className="flex justify-end gap-2 mt-5">
        <button type="button" onClick={onCancel} className="btn btn-secondary">Cancel</button>
        <button disabled={busy} className="btn btn-primary"><Icon name="add" size={18} />{busy ? 'Adding…' : 'Add task'}</button>
      </div>
    </form>
  )
}

function SummaryTab({ meeting, canReview, onRegenerate, regenerating }) {
  const { toast } = useToast()
  const structured = meeting.mom && meeting.mom.includes('## ')
  if (!structured) {
    return (
      <EmptyState icon="description" title={meeting.mom ? 'This summary needs an upgrade' : 'No minutes yet'}
        text={canReview ? 'The Summary agent can write structured Minutes of Meeting from the transcript in about 30 seconds.' : 'Minutes will appear here once a reviewer generates them.'}
        action={canReview && (
          <button disabled={regenerating} onClick={onRegenerate} className="btn btn-primary">
            <Icon name={regenerating ? 'progress_activity' : 'auto_awesome'} size={18} className={regenerating ? 'anim-spin' : ''} />
            {regenerating ? 'Writing minutes…' : 'Generate Minutes of Meeting'}
          </button>
        )} />
    )
  }
  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end gap-2">
        <button className="btn btn-secondary btn-sm" onClick={() => { navigator.clipboard.writeText(meeting.mom); toast('Minutes copied', 'success') }}><Icon name="content_copy" size={16} />Copy</button>
        <button className="btn btn-secondary btn-sm" onClick={() => exportMarkdown(meeting)}><Icon name="download" size={16} />Export .md</button>
        {canReview && <button disabled={regenerating} className="btn btn-secondary btn-sm" onClick={onRegenerate}><Icon name="refresh" size={16} />{regenerating ? 'Rewriting…' : 'Regenerate'}</button>}
      </div>
      {parseSections(meeting.mom).map(s => (
        <div key={s.title} className="bento p-6">
          <p className="eyebrow text-coral-deep mb-3">{s.title}</p>
          <ul className="flex flex-col gap-2"><Markdown lines={s.lines} /></ul>
        </div>
      ))}
    </div>
  )
}

function ChatPanel({ meetingId, onClose, autoFocus }) {
  // onClose closes the panel (desktop column or mobile drawer)
  const [messages, setMessages] = useState([{ role: 'ai', content: 'Ask me anything about this meeting. I only answer from the transcript.' }])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const endRef = useRef(null)
  const SUGGESTIONS = ['What did everyone commit to?', 'Were there any objections?', 'Which deadlines were mentioned?']

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }) }, [messages])

  async function send(text) {
    const q = (text ?? input).trim()
    if (!q || loading) return
    setMessages(prev => [...prev, { role: 'user', content: q }])
    setInput('')
    setLoading(true)
    try {
      const res = await chatMeeting(meetingId, { message: q })
      setMessages(prev => [...prev, { role: 'ai', content: res.data.response }])
    } catch {
      setMessages(prev => [...prev, { role: 'ai', content: 'Sorry, I could not answer that. Please try again.' }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bento p-5 flex flex-col max-h-160">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-full bg-coral text-white flex items-center justify-center"><Icon name="auto_awesome" size={18} /></div>
          <div>
            <p className="text-label-lg text-ink">Ask your meeting</p>
            <p className="text-[11px] text-ink-2">Grounded in the transcript</p>
          </div>
        </div>
        {onClose && <button onClick={onClose} className="btn btn-ghost btn-sm" aria-label="Close"><Icon name="close" size={18} /></button>}
      </div>
      <div className="flex-1 overflow-y-auto no-scrollbar flex flex-col gap-3 py-2 min-h-40">
        {messages.map((m, i) => (
          <div key={i} className={`max-w-[88%] px-4 py-2.5 text-body-sm leading-relaxed ${
            m.role === 'user' ? 'self-end bg-coral text-white rounded-2xl rounded-br-md' : 'self-start bg-surface-container-low text-ink rounded-2xl rounded-bl-md'}`}>
            {m.content}
          </div>
        ))}
        {loading && <div className="self-start bg-surface-container-low rounded-2xl px-4 py-3 flex gap-1">{[0, 1, 2].map(i => <span key={i} className="w-1.5 h-1.5 rounded-full bg-ink-3 anim-pulse" style={{ animationDelay: `${i * 0.2}s` }} />)}</div>}
        <div ref={endRef} />
      </div>
      {messages.length === 1 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {SUGGESTIONS.map(s => <button key={s} onClick={() => send(s)} className="rounded-full bg-surface-container-low hover:bg-surface-container px-3 py-1.5 text-[12px] text-ink-2">{s}</button>)}
        </div>
      )}
      <form onSubmit={e => { e.preventDefault(); send() }} className="relative">
        <input autoFocus={autoFocus} className="field pr-12" value={input} onChange={e => setInput(e.target.value)} placeholder="Ask anything about this meeting…" />
        <button type="submit" disabled={!input.trim() || loading} className="absolute right-1.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-coral text-white flex items-center justify-center disabled:opacity-40">
          <Icon name="arrow_upward" size={18} />
        </button>
      </form>
    </div>
  )
}

function SynopsisCard({ meeting, onSummary, reviewer }) {
  const text = meeting.validation_summary || meeting.audit?.summary
  if (!text && !meeting.mom) return null
  return (
    <div className="rounded-bento bg-panel text-white p-6">
      <div className="flex items-center justify-between mb-2">
        <p className="eyebrow text-mint">{reviewer ? 'Reviewer synopsis' : 'Meeting synopsis'}</p>
        <Icon name="summarize" size={18} className="text-ink-3" />
      </div>
      <p className="text-body-md text-[#e4e1e6] leading-relaxed">{text || 'The Minutes of Meeting are ready to read.'}</p>
      {meeting.mom && (
        <div className="flex gap-2 mt-4">
          <button onClick={onSummary} className="btn btn-sm bg-white/15 text-white hover:bg-white/25">Read minutes</button>
          <button onClick={() => exportMarkdown(meeting)} className="btn btn-sm bg-white/15 text-white hover:bg-white/25"><Icon name="download" size={14} />Export</button>
        </div>
      )}
    </div>
  )
}

export default function MeetingDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { toast } = useToast()
  const { userProfile } = useAuth()
  const isStaff = userProfile?.role !== 'employee'
  const [meeting, setMeeting] = useState(null)
  const [teamMembers, setTeamMembers] = useState([])
  const [tab, setTab] = useState('tasks')
  const [taskFilter, setTaskFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [chatDrawer, setChatDrawer] = useState(false)
  const [chatOpen, setChatOpen] = useState(true)
  const [adding, setAdding] = useState(false)
  const { setCrumb } = usePageMeta()
  useDocumentTitle(meeting?.title)
  useEffect(() => { setCrumb(meeting?.title || null); return () => setCrumb(null) }, [meeting?.title, setCrumb])
  useEffect(() => {
    if (!chatDrawer) return
    const onKey = e => { if (e.key === 'Escape') setChatDrawer(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [chatDrawer])

  // Back returns to wherever you came from inside the app, or your dashboard on a direct visit
  const goBack = () => (window.history.state?.idx > 0 ? navigate(-1) : navigate(isStaff ? '/pm' : '/employee'))

  useEffect(() => {
    fetchMeeting()
    if (isStaff) getCompanyTeam().then(res => setTeamMembers(res.data)).catch(() => {})
  }, [id, isStaff])

  useEffect(() => {
    if (meeting?.status !== 'processing') return
    const t = setInterval(fetchMeeting, 6000)
    return () => clearInterval(t)
  }, [meeting?.status])

  async function fetchMeeting() {
    try {
      const res = await getMeeting(id)
      setMeeting(res.data)
    } catch {
      setMeeting(null)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  async function handleValidate(taskId, decision, edits = {}) {
    try {
      await validateTask(taskId, { validated: decision, ...edits })
      toast(edits.edited_assigned_to ? `Task reassigned to ${edits.edited_assigned_to}` : `Task ${decision}`, decision === 'approved' ? 'success' : 'warning')
      fetchMeeting()
    } catch (err) {
      toast(err.response?.data?.detail || 'Could not update the task', 'error')
    }
  }

  async function handleReassign(taskId, uid) {
    try {
      await reassignTask(taskId, uid)
      const who = teamMembers.find(m => m.uid === uid)?.name || 'them'
      toast(`Reassigned to ${who}. They'll be asked to accept it.`, 'success')
      fetchMeeting()
    } catch (err) {
      toast(err.response?.data?.detail || 'Could not reassign the task', 'error')
    }
  }

  async function handleRegenerate() {
    setRegenerating(true)
    toast('The Summary agent is writing the minutes…', 'info', 6000)
    try {
      await regenerateSummary(id)
      const started = Date.now()
      const poll = setInterval(async () => {
        try {
          const res = await getMeeting(id)
          if ((res.data.mom || '').includes('## ') && res.data.mom !== meeting?.mom) {
            clearInterval(poll); setMeeting(res.data); setRegenerating(false); toast('Minutes of Meeting ready', 'success')
          } else if (Date.now() - started > 120000) {
            clearInterval(poll); setRegenerating(false); fetchMeeting()
          }
        } catch { /* keep polling */ }
      }, 5000)
    } catch {
      setRegenerating(false)
      toast('Could not start the Summary agent', 'error')
    }
  }

  const tasks = useMemo(() => {
    const all = meeting?.tasks || []
    if (taskFilter === 'review') return all.filter(t => t.needs_review && t.validated === 'pending')
    if (taskFilter === 'open') return all.filter(t => t.status !== 'done')
    if (taskFilter === 'done') return all.filter(t => t.status === 'done')
    return all
  }, [meeting, taskFilter])

  if (loading) return <Loading label="Loading meeting…" />
  if (!meeting) {
    return <EmptyState icon="search_off" title="Meeting not found" text="It may have been removed, or you may not have access to it."
                       action={<button className="btn btn-primary" onClick={goBack}>Go back</button>} />
  }

  const canReview = isStaff && meeting.view === 'full'
  const st = MEETING_STATUS[meeting.status] || { label: meeting.status, tone: 'info' }
  const reviewCount = meeting.tasks.filter(t => t.needs_review && t.validated === 'pending').length
  const tabs = [
    { value: 'tasks', label: 'Tasks', count: meeting.tasks.length },
    { value: 'summary', label: 'Summary' },
    ...(canReview ? [{ value: 'transcript', label: 'Transcript' }, { value: 'logs', label: 'Agent logs', count: meeting.logs.length }] : []),
  ]

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-5 mb-8">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <button onClick={goBack} className="btn btn-outline btn-sm"><Icon name="arrow_back" size={16} />Back</button>
            {meeting.department && <Chip tone="outline">{meeting.department}</Chip>}
            <Chip tone={st.tone} dot pulse={st.pulse}>{st.label}</Chip>
            <span className="text-body-sm text-ink-2 flex items-center gap-1"><Icon name="schedule" size={15} />{dateTime(meeting.date)}{meeting.duration_minutes ? ` · ${duration(meeting.duration_minutes, meeting.duration_estimated)}` : ''}</span>
            {!canReview && <Chip tone="info"><Icon name="visibility" size={12} />Participant view</Chip>}
          </div>
          <h1 className="text-headline-lg text-ink">{meeting.title}</h1>
          {meeting.participants.length > 0 && (
            <div className="flex items-center gap-3 mt-3">
              <AvatarStack names={meeting.participants.map(p => p.name)} max={5} />
              <span className="text-body-sm text-ink-2 truncate">{meeting.participants.map(p => p.name).join(', ')}</span>
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button onClick={() => { setRefreshing(true); fetchMeeting() }} className="btn btn-secondary"><Icon name="refresh" size={18} className={refreshing ? 'anim-spin' : ''} />Refresh</button>
          {meeting.mom && <button onClick={() => exportMarkdown(meeting)} className="btn btn-outline"><Icon name="download" size={18} />Export minutes</button>}
          {canReview && <button onClick={() => setChatDrawer(true)} className="btn btn-primary xl:hidden"><Icon name="auto_awesome" size={18} />Ask your meeting</button>}
          {canReview && !chatOpen && <button onClick={() => setChatOpen(true)} className="btn btn-primary hidden xl:inline-flex"><Icon name="auto_awesome" size={18} />Ask your meeting</button>}
        </div>
      </div>

      {meeting.status === 'processing' && (
        <div className="rounded-bento bg-coral-wash p-5 mb-6 flex items-center gap-4">
          <Icon name="progress_activity" className="text-coral anim-spin" size={26} />
          <div>
            <p className="text-label-lg text-ink">The agents are working on this meeting</p>
            <p className="text-body-sm text-ink-2">Tasks, decisions and minutes appear here automatically in a couple of minutes.</p>
          </div>
        </div>
      )}
      {meeting.status === 'failed' && (
        <div className="rounded-bento bg-overdue-bg p-5 mb-6 flex items-center gap-4">
          <Icon name="error" className="text-overdue" size={26} />
          <div>
            <p className="text-label-lg text-ink">Processing failed</p>
            <p className="text-body-sm text-ink-2">{canReview ? 'The Agent logs tab has the reason. Upload the transcript again to retry.' : 'A reviewer has been notified in the audit trail.'}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <div className="xl:col-span-8 flex flex-col gap-6 min-w-0">
          {canReview && meeting.status !== 'processing' && (
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
              <div className="lg:col-span-2"><EfficiencyCard tasks={meeting.tasks} /></div>
              <div className="lg:col-span-3"><PipelineCard meeting={meeting} /></div>
            </div>
          )}

          {meeting.mom?.includes('## ') && tab !== 'summary' && (
            <div className="bento px-5 py-4 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-forest-soft text-forest flex items-center justify-center"><Icon name="check_circle" size={20} /></div>
                <div>
                  <p className="text-label-lg text-ink">Minutes of Meeting generated</p>
                  <p className="text-body-sm text-ink-2">Owners, deadlines, decisions and risks, written by the Summary agent.</p>
                </div>
              </div>
              <button onClick={() => setTab('summary')} className="btn btn-secondary btn-sm">View summary</button>
            </div>
          )}

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <Segmented value={tab} onChange={setTab} options={tabs} className="overflow-x-auto no-scrollbar" />
            {tab === 'tasks' && (meeting.tasks.length > 0 || canReview) && (
              <div className="flex items-center gap-2 flex-wrap">
              {meeting.tasks.length > 0 && <Segmented value={taskFilter} onChange={setTaskFilter} options={[
                { value: 'all', label: 'All' },
                ...(canReview ? [{ value: 'review', label: 'To review', count: reviewCount }] : []),
                { value: 'open', label: 'Open' }, { value: 'done', label: 'Done' },
              ]} />}
              {canReview && meeting.status !== 'processing' && !adding && (
                <button onClick={() => setAdding(true)} className="btn btn-primary btn-sm"><Icon name="add" size={16} />Add task</button>
              )}
              </div>
            )}
          </div>

          {tab === 'tasks' && (
            <>
              {adding && <AddTaskForm meetingId={id} teamMembers={teamMembers} onCancel={() => setAdding(false)} onAdded={() => { setAdding(false); fetchMeeting() }} />}
              {meeting.tasks.length === 0 ? (
                meeting.status !== 'processing' && <EmptyState icon="checklist" title={canReview ? 'No tasks were extracted' : 'You have no tasks from this meeting'}
                                                       text={canReview ? 'Nobody committed to anything specific, or the transcript was too short.' : undefined} />
              ) : tasks.length === 0 ? (
                <EmptyState icon="filter_alt_off" title="No tasks in this view" action={<button className="btn btn-secondary" onClick={() => setTaskFilter('all')}>Show all</button>} />
              ) : (
                <div className="flex flex-col gap-4">
                  {tasks.map(t => (
                    <TaskCard key={t.id} task={t} index={meeting.tasks.indexOf(t)} canReview={canReview} onValidate={handleValidate}
                              onReassign={canReview ? handleReassign : undefined} teamMembers={teamMembers} />
                  ))}
                </div>
              )}
              {canReview && meeting.validation_summary && (
                <div className="rounded-bento bg-pending-bg/60 p-5 flex gap-3">
                  <Icon name="fact_check" className="text-pending shrink-0" />
                  <div><p className="eyebrow text-pending mb-1">Validation agent</p><p className="text-body-md text-ink">{meeting.validation_summary}</p></div>
                </div>
              )}
              {(meeting.decisions.length > 0 || meeting.risks.length > 0) && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <InsightList title="Key decisions" icon="gavel" items={meeting.decisions} empty="No decisions were recorded." />
                  <InsightList title="Risks raised" icon="report" items={meeting.risks} tone="risk" empty="No risks were raised." />
                </div>
              )}
              {canReview && <AuditCard audit={meeting.audit} />}
            </>
          )}

          {tab === 'summary' && <SummaryTab meeting={meeting} canReview={canReview} onRegenerate={handleRegenerate} regenerating={regenerating} />}

          {tab === 'transcript' && canReview && (
            <div className="bento p-6">
              <p className="eyebrow text-ink-2 mb-4">Original transcript</p>
              <div className="flex flex-col gap-2.5 max-h-[70vh] overflow-y-auto">
                {(meeting.transcript || '').split('\n').filter(Boolean).map((line, i) => {
                  const m = line.match(/^([^:]{1,40}):\s*(.*)$/)
                  return (
                    <p key={i} className="text-body-md text-ink-2 leading-relaxed">
                      {m ? <><span className="font-semibold text-ink">{m[1]}</span>: {m[2]}</> : line}
                    </p>
                  )
                })}
              </div>
            </div>
          )}

          {tab === 'logs' && canReview && (
            <div className="bento p-6">
              <p className="eyebrow text-ink-2 mb-5">Agent audit trail · {meeting.logs.length} events</p>
              {meeting.logs.length === 0 ? <p className="text-body-md text-ink-3">No events yet.</p> : (
                <ol className="flex flex-col">
                  {meeting.logs.map((log, i) => {
                    const color = AGENT_COLORS[log.agent] || (log.agent?.endsWith('(Human)') ? '#15803d' : '#a1a1aa')
                    return (
                      <li key={i} className="flex gap-4">
                        <div className="flex flex-col items-center">
                          <span className="w-3 h-3 rounded-full mt-1 shrink-0 ring-4 ring-white" style={{ background: color }} />
                          {i < meeting.logs.length - 1 && <span className="w-px flex-1 bg-surface-container-high my-1" />}
                        </div>
                        <div className="pb-5 min-w-0">
                          <p className="text-label-md" style={{ color }}>{log.agent} <span className="text-ink-3 font-medium ml-1">{dateTime(log.timestamp)}</span></p>
                          <p className="text-body-md text-ink-2 mt-0.5">{log.action}</p>
                        </div>
                      </li>
                    )
                  })}
                </ol>
              )}
            </div>
          )}
        </div>

        <div className="xl:col-span-4 flex flex-col gap-6">
          {/* Hidden rather than unmounted when closed, so the conversation survives */}
          {canReview && <div className={chatOpen ? 'hidden xl:block xl:sticky xl:top-24' : 'hidden'}><ChatPanel meetingId={id} onClose={() => setChatOpen(false)} /></div>}
          <SynopsisCard meeting={meeting} onSummary={() => setTab('summary')} reviewer={canReview} />
        </div>
      </div>

      {chatDrawer && (
        <div className="xl:hidden fixed inset-0 z-60 bg-black/30 flex justify-end" onClick={() => setChatDrawer(false)}>
          <div className="w-full max-w-md h-full p-4" onClick={e => e.stopPropagation()}>
            <ChatPanel meetingId={id} onClose={() => setChatDrawer(false)} autoFocus />
          </div>
        </div>
      )}
    </div>
  )
}
