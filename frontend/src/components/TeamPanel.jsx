import { useEffect, useState } from 'react'
import {
  getCompanyTeam, getCompanyInfo, getInvites, createInvite, revokeInvite,
  removeTeamMember, updateMemberRole, assignManager,
} from '../api'
import { useToast } from '../contexts/ToastContext'
import { useAuth } from '../contexts/AuthContext'
import { Avatar, Chip, Icon, Loading, Segmented } from './ui'
import { ROLE_LABEL, shortDate } from '../lib/format'

const ROLE_TONE = { pm: 'coral', manager: 'done', employee: 'outline' }

function InvitePanel({ isOwner, managers, userId }) {
  const { toast } = useToast()
  const [invites, setInvites] = useState([])
  const [role, setRole] = useState(isOwner ? 'manager' : 'employee')
  const [managerId, setManagerId] = useState('')
  const [creating, setCreating] = useState(false)
  const [copied, setCopied] = useState('')
  const [fresh, setFresh] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    try { setInvites((await getInvites()).data) } catch { toast('Failed to load invites', 'error') }
  }

  async function handleCreate() {
    setCreating(true)
    try {
      const res = await createInvite(role, role === 'employee' && managerId ? managerId : null)
      setFresh(res.data.code)
      await load()
    } catch (err) {
      toast(err.response?.data?.detail || 'Failed to create invite', 'error')
    } finally {
      setCreating(false)
    }
  }

  async function handleRevoke(code) {
    try {
      await revokeInvite(code)
      setInvites(prev => prev.filter(i => i.code !== code))
      toast('Invite revoked', 'success')
    } catch {
      toast('Failed to revoke invite', 'error')
    }
  }

  function copy(code) {
    navigator.clipboard.writeText(code)
    setCopied(code)
    setTimeout(() => setCopied(''), 1800)
  }

  return (
    <div className="bento p-6 sm:p-8">
      <div className="flex items-start gap-3 mb-5">
        <div className="w-10 h-10 rounded-full bg-coral-soft text-coral-deep flex items-center justify-center shrink-0"><Icon name="person_add" /></div>
        <div>
          <p className="text-headline-sm text-ink">{isOwner ? 'Invite people' : 'Invite your team'}</p>
          <p className="text-body-sm text-ink-2">
            {isOwner ? 'Invite managers first. Each manager then invites their own team. Codes expire after 7 days.'
                     : 'People who join with your code land in your team automatically. Codes expire after 7 days.'}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2.5 mb-6">
        {isOwner && (
          <Segmented value={role} onChange={setRole} options={[{ value: 'manager', label: 'A manager' }, { value: 'employee', label: 'An employee' }]} />
        )}
        {isOwner && role === 'employee' && (
          <select value={managerId} onChange={e => setManagerId(e.target.value)} className="field w-auto">
            <option value="">No team yet</option>
            {managers.map(m => <option key={m.uid} value={m.uid}>Team of {m.name}</option>)}
          </select>
        )}
        <button onClick={handleCreate} disabled={creating} className="btn btn-primary">
          <Icon name="add" size={18} />{creating ? 'Creating…' : isOwner ? 'Create invite code' : 'Create team invite code'}
        </button>
      </div>

      {invites.length === 0 ? (
        <p className="text-body-md text-ink-3">No active invites yet.</p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {invites.map(inv => {
            const team = inv.role === 'employee' && inv.managerId
              ? (inv.managerId === userId ? 'your team' : `team of ${managers.find(m => m.uid === inv.managerId)?.name || 'a manager'}`) : null
            return (
              <div key={inv.code} className={`flex flex-wrap items-center gap-3 rounded-card px-5 py-3.5 ${inv.code === fresh ? 'bg-coral-wash ring-1 ring-coral/30' : 'bg-surface-container-low'}`}>
                <span className="font-mono text-headline-sm tracking-[0.18em] text-coral-deep">{inv.code}</span>
                <Chip tone={ROLE_TONE[inv.role]}>{ROLE_LABEL[inv.role]}</Chip>
                {team && <span className="text-body-sm text-ink-2">→ {team}</span>}
                <span className="text-[12px] text-ink-2 ml-auto">{inv.uses} used · expires {shortDate(inv.expiresAt)}</span>
                <button onClick={() => copy(inv.code)} className="btn btn-outline btn-sm">
                  <Icon name={copied === inv.code ? 'check' : 'content_copy'} size={15} />{copied === inv.code ? 'Copied' : 'Copy'}
                </button>
                <button onClick={() => handleRevoke(inv.code)} className="btn btn-danger btn-sm">Revoke</button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function TeamPanel() {
  const { toast } = useToast()
  const { userProfile } = useAuth()
  const isOwner = userProfile?.role === 'pm'
  const [team, setTeam] = useState([])
  const [info, setInfo] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    try {
      const [teamRes, infoRes] = await Promise.all([getCompanyTeam(), getCompanyInfo()])
      setTeam(teamRes.data)
      setInfo(infoRes.data)
    } catch {
      toast('Failed to load team data', 'error')
    } finally {
      setLoading(false)
    }
  }

  const managers = team.filter(m => m.role === 'manager')

  async function run(action, success) {
    try { await action(); toast(success, 'success'); fetchAll() }
    catch (err) { toast(err.response?.data?.detail || 'That did not work. Try again.', 'error') }
  }

  function canRemove(member) {
    if (member.uid === userProfile.uid || member.role === 'pm') return false
    if (isOwner) return true
    return member.role === 'employee' && member.managerId === userProfile.uid
  }

  if (loading) return <Loading label="Loading team…" />
  const counts = team.reduce((acc, m) => ({ ...acc, [m.role]: (acc[m.role] || 0) + 1 }), {})

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-5">
        {[
          { label: isOwner ? 'Company' : 'Your team', value: info?.name || '—', icon: 'apartment' },
          { label: 'Members', value: team.length, icon: 'group' },
          { label: 'Managers', value: counts.manager || 0, icon: 'supervisor_account' },
          { label: 'Employees', value: counts.employee || 0, icon: 'badge' },
        ].map(s => (
          <div key={s.label} className="bento p-5">
            <div className="flex items-center justify-between"><p className="text-label-md text-ink-2">{s.label}</p><Icon name={s.icon} size={18} className="text-ink-3" /></div>
            <p className="text-headline-md text-ink mt-2 truncate">{s.value}</p>
          </div>
        ))}
      </div>

      <InvitePanel isOwner={isOwner} managers={managers} userId={userProfile.uid} />

      <div className="bento overflow-hidden">
        <div className="px-6 sm:px-8 py-5 border-b border-surface-container flex items-center justify-between">
          <p className="text-headline-sm text-ink">{isOwner ? 'Everyone in the company' : 'You and your team'}</p>
          <span className="text-body-sm text-ink-2">{team.length} people</span>
        </div>
        {team.length === 0 ? (
          <p className="text-center py-12 text-body-md text-ink-3">No team members yet. Create an invite above.</p>
        ) : (
          <div className="divide-y divide-surface-container">
            {team.map(member => {
              const editable = isOwner && member.uid !== userProfile.uid && member.role !== 'pm'
              return (
                <div key={member.uid} className="px-6 sm:px-8 py-4 flex flex-wrap items-center gap-x-6 gap-y-3">
                  <div className="flex items-center gap-3 min-w-0 flex-1 basis-56">
                    <Avatar name={member.name} size={38} />
                    <div className="min-w-0">
                      <p className="text-label-lg text-ink capitalize truncate">{member.name}{member.uid === userProfile.uid && <span className="text-ink-3 font-medium"> (you)</span>}</p>
                      <p className="text-body-sm text-ink-2 truncate">{[member.jobTitle, member.department, member.email].filter(Boolean).join(' · ')}</p>
                    </div>
                  </div>
                  <div className="w-36">
                    {editable ? (
                      <select value={member.role} onChange={e => run(() => updateMemberRole(member.uid, e.target.value), `${member.name} is now ${ROLE_LABEL[e.target.value]}`)}
                              className="field py-1.5 px-3 text-label-md">
                        <option value="manager">Manager</option>
                        <option value="employee">Employee</option>
                      </select>
                    ) : <Chip tone={ROLE_TONE[member.role]}>{ROLE_LABEL[member.role] || member.role}</Chip>}
                  </div>
                  {isOwner && (
                    <div className="w-44">
                      {member.role === 'employee' ? (
                        <select value={member.managerId || ''} onChange={e => run(() => assignManager(member.uid, e.target.value || null), e.target.value ? `${member.name} moved teams` : `${member.name} removed from their team`)}
                                className="field py-1.5 px-3 text-label-md">
                          <option value="">No team</option>
                          {managers.map(m => <option key={m.uid} value={m.uid}>Team of {m.name}</option>)}
                        </select>
                      ) : <span className="text-body-sm text-ink-3">{member.role === 'manager' ? 'Leads a team' : '—'}</span>}
                    </div>
                  )}
                  <span className="text-body-sm text-ink-2 w-24">{member.createdAt ? shortDate(member.createdAt) : '—'}</span>
                  <div className="w-9">
                    {canRemove(member) && (
                      <button title="Remove from company" className="w-9 h-9 rounded-full flex items-center justify-center text-ink-3 hover:text-overdue hover:bg-overdue-bg"
                              onClick={() => confirm(`Remove ${member.name} from the company?`) && run(() => removeTeamMember(member.uid), `${member.name} removed`)}>
                        <Icon name="person_remove" size={19} />
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
