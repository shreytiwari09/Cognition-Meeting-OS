import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { getMeetings, uploadTranscript, checkOverdueTasks, getCompanyTeam } from '../api'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import OnboardingChecklist from '../components/OnboardingChecklist'
import { AvatarStack, Chip, EmptyState, Icon, Loading, ProgressBar, SectionHeader, Segmented, StatCard } from '../components/ui'
import { DEPARTMENTS, MEETING_STATUS, dateTime, duration } from '../lib/format'

const EMPTY_FORM = { title: '', department: '', participants: '', transcript: '', team_manager_id: '', duration: '' }
const STATUS_ICON = { processing: 'sync', completed: 'task_alt', failed: 'error' }

function MeetingCard({ meeting, onOpen }) {
  const st = MEETING_STATUS[meeting.status] || { label: meeting.status, tone: 'info' }
  const processing = meeting.status === 'processing'
  return (
    <button onClick={onOpen} className="bento w-full text-left p-6 hover:shadow-float hover:-translate-y-0.5 transition-all anim-fade-up group">
      <div className="flex items-start gap-4">
        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${
          processing ? 'bg-coral-wash text-coral' : meeting.status === 'failed' ? 'bg-overdue-bg text-overdue' : 'bg-forest-soft text-forest'}`}>
          <Icon name={STATUS_ICON[meeting.status] || 'description'} className={processing ? 'anim-spin' : ''} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1.5">
            {meeting.department && <Chip tone="outline">{meeting.department}</Chip>}
            <Chip tone={st.tone} dot pulse={st.pulse}>{processing ? 'Processing pipeline' : st.label}</Chip>
            {meeting.source === 'extension' && <Chip tone="info"><Icon name="extension" size={12} />Captured live</Chip>}
            <span className="text-body-sm text-ink-2">{dateTime(meeting.date)}{meeting.duration_minutes ? ` · ${duration(meeting.duration_minutes, meeting.duration_estimated)}` : ''}</span>
          </div>
          <p className="text-headline-sm text-ink group-hover:text-coral-deep transition-colors">{meeting.title}</p>
        </div>
        {meeting.participant_names?.length > 0 && (
          <div className="hidden md:flex items-center gap-2 shrink-0" title={meeting.participant_names.join(', ')}>
            <AvatarStack names={meeting.participant_names} max={4} size={30} />
            <span className="text-[12px] text-ink-2">{meeting.participant_names.length} people</span>
          </div>
        )}
        <div className="hidden sm:flex flex-col items-end gap-1 shrink-0 text-right">
          <p className="text-label-lg text-ink">{meeting.task_count} task{meeting.task_count === 1 ? '' : 's'}</p>
          <p className="text-body-sm text-ink-2">
            {meeting.decision_count ? `${meeting.decision_count} decision${meeting.decision_count === 1 ? '' : 's'}` : ''}
            {meeting.decision_count && meeting.risk_count ? ' · ' : ''}
            {meeting.risk_count ? `${meeting.risk_count} risk${meeting.risk_count === 1 ? '' : 's'}` : ''}
          </p>
        </div>
        <Icon name="chevron_right" className="text-ink-3 self-center hidden sm:block" />
      </div>

      {processing && (
        <div className="mt-5 pt-4 border-t border-surface-container">
          <div className="flex items-center justify-between mb-2">
            <span className="text-label-md text-ink flex items-center gap-1.5"><Icon name="smart_toy" size={16} className="text-coral" />7 AI agents are reading the transcript</span>
            <span className="text-label-md text-coral">usually 2–3 min</span>
          </div>
          <div className="h-1.5 rounded-full bg-subtle overflow-hidden"><div className="h-full w-2/5 rounded-full bg-coral anim-indeterminate" /></div>
        </div>
      )}
      {!processing && (meeting.highlight || meeting.flagged_count > 0) && (
        <div className="mt-5 pt-4 border-t border-surface-container flex items-center justify-between gap-4">
          {meeting.highlight
            ? <p className="text-body-sm italic text-ink-2 truncate"><span className="text-coral font-bold not-italic mr-1.5">“</span>{meeting.highlight.quote}{meeting.highlight.speaker && <span className="not-italic"> — {meeting.highlight.speaker}</span>}</p>
            : <span />}
          {meeting.flagged_count > 0
            ? <Chip tone="pending" className="shrink-0"><Icon name="flag" size={12} />{meeting.flagged_count} to review</Chip>
            : meeting.status === 'completed' && <Chip tone="done" className="shrink-0"><Icon name="verified" size={12} />Reviewed</Chip>}
        </div>
      )}
    </button>
  )
}

function UploadPanel({ isOwner, managers, onClose, onUploaded }) {
  const { toast } = useToast()
  const [form, setForm] = useState(EMPTY_FORM)
  const [submitting, setSubmitting] = useState(false)
  const set = key => e => setForm({ ...form, [key]: e.target.value })
  const dirty = form.transcript.trim().length > 0
  const panelRef = useRef(null)

  // The form opens at the top of the page: bring it into view and put the cursor in it
  useEffect(() => {
    panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    panelRef.current?.querySelector('input')?.focus({ preventScroll: true })
  }, [])

  useEffect(() => {
    if (!dirty) return
    const warn = e => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  function close() {
    if (!dirty || confirm('Discard the transcript you were writing?')) onClose()
  }

  async function submit(e) {
    e.preventDefault()
    if (form.transcript.trim().length < 20) return toast('Paste a transcript of at least a few lines.', 'warning')
    setSubmitting(true)
    try {
      const participants = form.participants.split(',').map(p => p.trim()).filter(Boolean).map(name => ({ name }))
      await uploadTranscript({
        title: form.title.trim() || 'Untitled Meeting', department: form.department.trim() || 'General',
        transcript: form.transcript, participants, team_manager_id: form.team_manager_id || null,
        duration_minutes: Number(form.duration) > 0 ? Math.round(Number(form.duration)) : null,
      })
      toast('Meeting uploaded. The AI agents are processing it now.', 'success')
      setForm(EMPTY_FORM)
      onUploaded()
    } catch (err) {
      toast(err.response?.data?.detail?.toString() || 'Upload failed. Check your connection.', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form ref={panelRef} onSubmit={submit} className="bento p-6 sm:p-8 mb-8 anim-fade-up scroll-mt-24">
      <div className="flex items-start justify-between gap-4 pb-5 mb-6 border-b border-surface-container">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-coral-soft text-coral-deep flex items-center justify-center"><Icon name="upload_file" /></div>
          <div>
            <p className="text-headline-sm text-ink">Upload a transcript</p>
            <p className="text-body-sm text-ink-2">The 7-agent pipeline extracts tasks, decisions and risks, each backed by a quote.</p>
          </div>
        </div>
        <button type="button" onClick={close} className="btn btn-ghost btn-sm" aria-label="Close"><Icon name="close" size={18} /></button>
      </div>
      <div className={`grid grid-cols-1 gap-4 ${isOwner ? 'md:grid-cols-3' : 'md:grid-cols-2'}`}>
        <label className="flex flex-col gap-1.5">
          <span className="eyebrow text-ink-2">Meeting title</span>
          <input className="field" value={form.title} onChange={set('title')} placeholder="e.g. Sprint 42 planning" />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="eyebrow text-ink-2">Department</span>
          <input className="field" list="upload-departments" value={form.department} onChange={set('department')} placeholder="e.g. Engineering" />
          <datalist id="upload-departments">{DEPARTMENTS.map(d => <option key={d} value={d} />)}</datalist>
        </label>
        {isOwner && (
          <label className="flex flex-col gap-1.5">
            <span className="eyebrow text-ink-2">Team</span>
            <select className="field" value={form.team_manager_id} onChange={set('team_manager_id')}>
              <option value="">Company-wide (owners and attendees)</option>
              {managers.map(m => <option key={m.uid} value={m.uid}>Team of {m.name}</option>)}
            </select>
          </label>
        )}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-[1fr_180px] gap-4 mt-4">
      <label className="flex flex-col gap-1.5">
        <span className="eyebrow text-ink-2">Participants <span className="normal-case tracking-normal font-medium text-ink-3">· full names as in your team, comma-separated</span></span>
        <input className="field" value={form.participants} onChange={set('participants')} placeholder="Rahul Verma, Priya Sharma, Anika Rao" />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="eyebrow text-ink-2">Length <span className="normal-case tracking-normal font-medium text-ink-3">· minutes</span></span>
        <input className="field" type="number" min="1" max="600" value={form.duration} onChange={set('duration')} placeholder="Auto" />
      </label>
      </div>
      <label className="flex flex-col gap-1.5 mt-4">
        <span className="eyebrow text-ink-2">Transcript</span>
        <textarea className="field min-h-[180px] resize-y leading-relaxed" value={form.transcript} onChange={set('transcript')}
                  placeholder={'Priya: Rahul, can you finish the Stripe webhooks by Friday?\nRahul: Yes, I will have it done by Friday.'} />
      </label>
      <div className="flex justify-end gap-2.5 mt-6">
        <button type="button" onClick={close} className="btn btn-secondary">Cancel</button>
        <button type="submit" disabled={submitting} className="btn btn-primary">
          <Icon name={submitting ? 'progress_activity' : 'auto_awesome'} size={18} className={submitting ? 'anim-spin' : ''} />
          {submitting ? 'Uploading…' : 'Send to AI agents'}
        </button>
      </div>
    </form>
  )
}

export default function PMDashboard() {
  const [meetings, setMeetings] = useState([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [team, setTeam] = useState([])
  const [dismissed, setDismissed] = useState(true)
  const [params, setParams] = useSearchParams()
  const showUpload = params.get('upload') === '1'
  const navigate = useNavigate()
  const { user, userProfile } = useAuth()
  const isOwner = userProfile?.role === 'pm'

  useEffect(() => {
    if (!user) return
    checkOverdueTasks().catch(() => {}).finally(fetchMeetings)
    getCompanyTeam().then(res => setTeam(res.data)).catch(() => {})
    try { setDismissed(localStorage.getItem(`onboarding_dismissed_${user.uid}`) === '1') } catch { setDismissed(false) }
  }, [user])

  useEffect(() => {
    if (!user) return
    const hasProcessing = meetings.some(m => m.status === 'processing')
    const interval = setInterval(fetchMeetings, hasProcessing ? 5000 : 20000)
    return () => clearInterval(interval)
  }, [meetings, user])

  async function fetchMeetings() {
    try {
      const res = await getMeetings()
      setMeetings(res.data)
      setFetchError('')
    } catch (err) {
      setFetchError(err?.response?.data?.detail || 'Failed to load meetings.')
    } finally {
      setLoading(false)
    }
  }

  const setUpload = open => setParams(open ? { upload: '1' } : {}, { replace: true })
  const counts = useMemo(() => ({
    processing: meetings.filter(m => m.status === 'processing').length,
    completed: meetings.filter(m => m.status === 'completed').length,
    failed: meetings.filter(m => m.status === 'failed').length,
  }), [meetings])
  const totalTasks = meetings.reduce((s, m) => s + (m.task_count || 0), 0)
  const flagged = meetings.reduce((s, m) => s + (m.flagged_count || 0), 0)
  const managers = team.filter(m => m.role === 'manager')

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return meetings.filter(m =>
      (statusFilter === 'all' || m.status === statusFilter) &&
      (!q || m.title.toLowerCase().includes(q) || (m.department || '').toLowerCase().includes(q)))
  }, [meetings, search, statusFilter])

  return (
    <div>
      <SectionHeader
        eyebrow={<><Icon name="verified_user" size={15} />AI meeting intelligence</>}
        title="Meetings & Transcripts"
        subtitle="Every meeting is read by 7 AI agents, cross-checked for contradictions, and turned into tasks with the exact words they came from."
        actions={<>
          <button onClick={() => { setLoading(true); fetchMeetings() }} className="btn btn-secondary"><Icon name="refresh" size={18} />Refresh</button>
          <button onClick={() => setUpload(!showUpload)} className="btn btn-primary"><Icon name="cloud_upload" size={18} />Upload transcript</button>
        </>}
      />

      {showUpload && <UploadPanel isOwner={isOwner} managers={managers} onClose={() => setUpload(false)}
                                  onUploaded={() => { setUpload(false); setTimeout(fetchMeetings, 1500) }} />}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5 mb-8">
        <StatCard title="Total meetings" icon="forum" value={meetings.length} sub={isOwner ? 'across the company' : 'for your team'} />
        <StatCard hero title="AI processing" icon="smart_toy" value={counts.processing} unit="active"
                  sub={counts.processing ? '7 agents are evaluating commitments and contradictions.' : 'Nothing in the queue right now.'} />
        <StatCard title="Completed & audited" icon="verified" value={counts.completed} tone="done"
                  sub={counts.failed ? `${counts.failed} failed. Open it to see why.` : 'every one passed through the audit agent'}>
          <div className="mt-3"><ProgressBar value={meetings.length ? counts.completed / meetings.length : 0} tone="done" /></div>
        </StatCard>
        <StatCard title="Tasks extracted" icon="checklist" value={totalTasks}
                  sub={flagged ? `${flagged} flagged for your review` : 'each one backed by a transcript quote'} />
      </div>

      <OnboardingChecklist
        role={userProfile?.role} team={team} meetingCount={meetings.length} dismissed={dismissed}
        onAction={action => action === 'upload' ? setUpload(true) : navigate(action === 'extension' ? '/connect-extension' : '/manager?tab=members')}
        onDismiss={() => { setDismissed(true); try { localStorage.setItem(`onboarding_dismissed_${user.uid}`, '1') } catch { /* private mode */ } }}
      />

      <div className="bento p-2 mb-6 flex flex-col md:flex-row md:items-center justify-between gap-2">
        <Segmented
          value={statusFilter} onChange={setStatusFilter} className="overflow-x-auto no-scrollbar"
          options={[
            { value: 'all', label: 'All', count: meetings.length },
            { value: 'processing', label: 'Processing', count: counts.processing },
            { value: 'completed', label: 'Completed', count: counts.completed },
            { value: 'failed', label: 'Failed', count: counts.failed },
          ]}
        />
        <div className="relative md:w-80">
          <Icon name="search" size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-3" />
          <input className="field pl-11" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by title or department…" />
        </div>
      </div>

      {fetchError && (
        <div className="rounded-2xl bg-overdue-bg text-overdue px-5 py-3 mb-6 text-body-md flex items-center gap-2"><Icon name="error" size={18} />{fetchError}</div>
      )}

      {loading ? <Loading label="Loading meetings…" /> : meetings.length === 0 ? (
        <EmptyState icon="mic" title="No meetings yet"
                    text="Upload a transcript, or connect the Chrome extension to capture Google Meet automatically."
                    action={<div className="flex gap-2.5 justify-center">
                      <button className="btn btn-primary" onClick={() => setUpload(true)}><Icon name="cloud_upload" size={18} />Upload transcript</button>
                      <button className="btn btn-secondary" onClick={() => navigate('/connect-extension')}><Icon name="extension" size={18} />Connect extension</button>
                    </div>} />
      ) : filtered.length === 0 ? (
        <EmptyState icon="search_off" title="No meetings match your search"
                    action={<button className="btn btn-secondary" onClick={() => { setSearch(''); setStatusFilter('all') }}>Clear filters</button>} />
      ) : (
        <div className="flex flex-col gap-4">
          {filtered.map(m => <MeetingCard key={m.id} meeting={m} onOpen={() => navigate(`/meeting/${m.id}`)} />)}
        </div>
      )}
    </div>
  )
}
