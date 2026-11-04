import { useState } from 'react'
import { Avatar, Chip, EvidenceQuote, Icon, ProgressBar } from './ui'
import { TASK_STATUS, daysUntil, relativeDay, shortDate, titleCase } from '../lib/format'

const ACCEPTANCE = {
  pending:  { label: 'Awaiting acceptance', tone: 'pending', icon: 'hourglass_top' },
  accepted: { label: 'Accepted', tone: 'done', icon: 'how_to_reg' },
  declined: { label: 'Declined', tone: 'overdue', icon: 'do_not_disturb_on' },
}

function confidenceMeta(c) {
  return c >= 80 ? { label: 'High', tone: 'done' } : c >= 50 ? { label: 'Moderate', tone: 'pending' } : { label: 'Low', tone: 'overdue' }
}

// "Oct 14" + "in 3 days" / "overdue by 2 days" / "No deadline set"
function deadlineInfo(task) {
  const raw = task.deadline_date || task.deadline
  const days = daysUntil(raw)
  if (days === null) {
    const said = task.deadline_text && task.deadline_text !== 'not specified' ? task.deadline_text : ''
    return { date: said ? `“${said}”` : 'No deadline set', rel: said ? 'not a date' : '', tone: 'text-ink-3' }
  }
  if (task.status === 'done') return { date: shortDate(raw), rel: 'completed', tone: 'text-done' }
  if (days < 0) return { date: shortDate(raw), rel: `overdue by ${-days} day${days === -1 ? '' : 's'}`, tone: 'text-overdue' }
  return { date: shortDate(raw), rel: days === 0 ? 'due today' : `${relativeDay(raw).toLowerCase()}`, tone: days <= 2 ? 'text-pending' : 'text-ink-2' }
}

function ReassignControl({ task, teamMembers, onReassign }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  if (!open) return <button onClick={() => setOpen(true)} className="btn btn-secondary btn-sm"><Icon name="swap_horiz" size={16} />Reassign</button>
  return (
    <select autoFocus disabled={busy} className="field py-1.5 px-3 text-label-md w-48" defaultValue=""
            onBlur={() => !busy && setOpen(false)}
            onChange={async e => { if (!e.target.value) return; setBusy(true); try { await onReassign(task.id, e.target.value) } finally { setBusy(false); setOpen(false) } }}>
      <option value="" disabled>Reassign to…</option>
      {teamMembers.filter(m => m.uid !== task.owner_uid).map(m => <option key={m.uid} value={m.uid}>{m.name}{m.jobTitle ? ` · ${m.jobTitle}` : ''}</option>)}
    </select>
  )
}

function EditForm({ task, teamMembers, onSave, onCancel }) {
  const [title, setTitle] = useState(task.title || '')
  const [assignee, setAssignee] = useState(task.assigned_to || '')
  const [deadline, setDeadline] = useState(task.deadline_date || '')
  const options = teamMembers.map(m => m.name).filter(Boolean)
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="eyebrow text-coral-deep">Edit task</p>
        <button onClick={onCancel} className="btn btn-ghost btn-sm"><Icon name="close" size={16} /></button>
      </div>
      <label className="flex flex-col gap-1">
        <span className="eyebrow text-ink-2">Title</span>
        <input className="field" value={title} onChange={e => setTitle(e.target.value)} />
      </label>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className="eyebrow text-ink-2">Assigned to</span>
          <select className="field" value={options.find(o => o.toLowerCase() === assignee.toLowerCase()) || assignee} onChange={e => setAssignee(e.target.value)}>
            {!options.some(o => o.toLowerCase() === assignee.toLowerCase()) && <option value={assignee}>{titleCase(assignee) || 'Unassigned'}</option>}
            {options.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="eyebrow text-ink-2">Deadline</span>
          <input className="field" type="date" value={deadline} onChange={e => setDeadline(e.target.value)} />
        </label>
      </div>
      <div className="flex justify-end gap-2 mt-1">
        <button onClick={onCancel} className="btn btn-secondary btn-sm">Cancel</button>
        <button
          onClick={() => onSave({
            edited_title: title !== task.title ? title : undefined,
            edited_assigned_to: assignee !== task.assigned_to ? assignee : undefined,
            edited_deadline: deadline && deadline !== task.deadline_date ? deadline : undefined,
          })}
          className="btn btn-primary btn-sm"
        ><Icon name="check" size={16} />Save & approve</button>
      </div>
    </div>
  )
}

// A task extracted from a meeting. `canReview` shows approve / edit / reject for owners and the team's manager.
export default function TaskCard({ task, index, canReview = false, onValidate, onReassign, teamMembers = [] }) {
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const status = TASK_STATUS[task.status] || { label: task.status, tone: 'info' }
  const approved = task.validated === 'approved'
  const rejected = task.validated === 'rejected'
  const flagged = task.needs_review && task.validated === 'pending'
  const hasConfidence = task.confidence !== null && task.confidence !== undefined
  const conf = Math.round(task.confidence || 0)
  const cm = confidenceMeta(conf)
  const deadline = deadlineInfo(task)
  const acceptance = ACCEPTANCE[task.acceptance]

  async function decide(decision, edits = {}) {
    setBusy(true)
    try { await onValidate(task.id, decision, edits); setEditing(false) } finally { setBusy(false) }
  }

  return (
    <div className={`bento p-6 anim-fade-up transition-opacity ${rejected ? 'opacity-60' : ''} ${flagged ? 'ring-1 ring-coral/25' : ''}`}>
      {editing ? (
        <EditForm task={task} teamMembers={teamMembers} onCancel={() => setEditing(false)} onSave={edits => decide('approved', edits)} />
      ) : (
        <>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-1.5">
                <Chip tone={status.tone} dot>{status.label}</Chip>
                {approved && <Chip tone="done"><Icon name="verified" size={12} />Approved</Chip>}
                {rejected && <Chip tone="overdue"><Icon name="block" size={12} />Rejected</Chip>}
                {flagged && <Chip tone="coral"><Icon name="flag" size={12} />Needs review</Chip>}
                {acceptance && <Chip tone={acceptance.tone}><Icon name={acceptance.icon} size={12} />{acceptance.label}</Chip>}
                {task.source === 'manual' && <Chip tone="outline"><Icon name="edit_note" size={12} />Added by {task.createdBy || 'a reviewer'}</Chip>}
              </div>
              <p className={`text-headline-sm text-ink ${task.status === 'done' ? 'line-through decoration-ink-3' : ''}`}>
                {index !== undefined && <span className="text-ink-3 mr-1.5">{index + 1}.</span>}{task.title}
              </p>
            </div>
          </div>

          {task.description && <p className="text-body-md text-ink-2 mt-2">{task.description}</p>}

          {task.evidence_quote && (
            <div className="mt-4"><EvidenceQuote quote={task.evidence_quote} speaker={task.speaker} /></div>
          )}

          {flagged && task.review_reason && (
            <div className="mt-3 rounded-tile bg-coral-wash px-4 py-3 flex gap-2.5">
              <Icon name="warning" size={18} className="text-coral shrink-0 mt-px" />
              <div>
                <p className="eyebrow text-coral-deep mb-0.5">{task.acceptance === 'declined' ? 'Declined by the assignee' : 'Flagged by the agents'}</p>
                <p className="text-body-sm text-ink">{task.review_reason}</p>
              </div>
            </div>
          )}

          <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[1.1fr_0.9fr_1.4fr] gap-4 lg:gap-6 items-center">
            <div className="flex items-center gap-2.5 min-w-0">
              <Avatar name={titleCase(task.assigned_to) || '?'} size={36} />
              <div className="min-w-0">
                <p className="eyebrow text-ink-3">Assignee</p>
                <p className="text-label-lg text-ink capitalize truncate">{task.assigned_to || 'Unassigned'}</p>
                {task.assignee_title && <p className="text-[12px] text-ink-2 truncate">{task.assignee_title}</p>}
              </div>
            </div>
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-full bg-surface-container-low flex items-center justify-center shrink-0"><Icon name="event" size={18} className={deadline.tone} /></div>
              <div className="min-w-0">
                <p className="eyebrow text-ink-3">Deadline</p>
                <p className="text-label-lg text-ink truncate">{deadline.date}</p>
                {deadline.rel && <p className={`text-[12px] ${deadline.tone}`}>{deadline.rel}</p>}
              </div>
            </div>
            <div className="min-w-0 sm:col-span-2 lg:col-span-1">
              {hasConfidence ? <>
              <div className="flex items-center justify-between mb-1.5">
                <span className="eyebrow text-ink-3">AI confidence</span>
                <span className={`text-label-md ${cm.tone === 'done' ? 'text-done' : cm.tone === 'pending' ? 'text-pending' : 'text-overdue'}`}>{conf}% · {cm.label}</span>
              </div>
              <ProgressBar value={conf / 100} tone={cm.tone === 'done' ? 'done' : cm.tone === 'pending' ? 'pending' : 'overdue'} height={5} />
              {task.confidence_note && (
                <p className="text-[12px] text-ink-2 mt-1.5 leading-snug">
                  {task.confidence_note}{task.confidence_next_step && <span className="text-coral-deep font-semibold"> → {task.confidence_next_step}</span>}
                </p>
              )}
              </> : (
                <p className="text-body-sm text-ink-2 flex items-center gap-1.5"><Icon name="person_check" size={16} className="text-forest" />Added and approved by a person{task.validatedBy ? ` (${task.validatedBy})` : ''}.</p>
              )}
            </div>
          </div>

          {(task.progress > 0 || task.progressNote) && (
            <div className="mt-4 tile px-4 py-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="eyebrow text-ink-3">Progress</span>
                <span className="text-label-md text-ink">{task.progress || 0}%</span>
              </div>
              <ProgressBar value={(task.progress || 0) / 100} tone="coral" height={5} />
              {task.progressNote && <p className="text-[12px] text-ink-2 mt-1.5">“{task.progressNote}”{task.updates?.length ? ` · ${task.updates[task.updates.length - 1].by}` : ''}</p>}
            </div>
          )}

          {canReview && (
            <div className="mt-5 pt-4 border-t border-surface-container flex flex-wrap justify-end gap-2">
              {onReassign && !rejected && <ReassignControl task={task} teamMembers={teamMembers} onReassign={onReassign} />}
              {approved ? (
                <button onClick={() => setEditing(true)} className="btn btn-secondary btn-sm"><Icon name="edit" size={16} />Edit</button>
              ) : rejected ? (
                <button disabled={busy} onClick={() => decide('approved')} className="btn btn-secondary btn-sm"><Icon name="undo" size={16} />Approve instead</button>
              ) : (
                <>
                  <button disabled={busy} onClick={() => setEditing(true)} className="btn btn-secondary btn-sm"><Icon name="edit" size={16} />Edit task</button>
                  <button disabled={busy} onClick={() => decide('rejected')} className="btn btn-danger btn-sm">Reject</button>
                  <button disabled={busy} onClick={() => decide('approved')} className="btn btn-primary btn-sm"><Icon name="check" size={16} />Approve</button>
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
