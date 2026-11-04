// DEV-ONLY preview mode: renders every screen with realistic sample data, no backend or Firebase.
// Turn on in the browser console:  localStorage.setItem('meetingos_mock', 'pm')   // or 'manager' / 'employee'
// Turn off:                         localStorage.removeItem('meetingos_mock')
// Never included in production builds (main.jsx only imports it when import.meta.env.DEV).
import api from '../api'

const role = localStorage.getItem('meetingos_mock')
const NOW = Date.now()
const day = n => new Date(NOW + n * 86400000).toISOString()
const date = n => day(n).slice(0, 10)

const PEOPLE = {
  pm: { uid: 'u-olivia', name: 'Olivia Hart', email: 'olivia@acme.io', role: 'pm' },
  manager: { uid: 'u-alan', name: 'Alan Brooks', email: 'alan@acme.io', role: 'manager' },
  employee: { uid: 'u-anika', name: 'Anika Rao', email: 'anika@acme.io', role: 'employee', managerId: 'u-alan' },
}
const me = { ...(PEOPLE[role] || PEOPLE.pm), companyId: 'co_demo' }
// 'onboarding' previews the sign-up wizard on /login, so there is no signed-in profile
if (role !== 'onboarding') globalThis.__MEETINGOS_MOCK_PROFILE__ = me

const team = [
  { uid: 'u-olivia', name: 'Olivia Hart', email: 'olivia@acme.io', role: 'pm', jobTitle: 'Founder & CEO', createdAt: day(-90) },
  { uid: 'u-alan', name: 'Alan Brooks', email: 'alan@acme.io', role: 'manager', jobTitle: 'Engineering Manager', department: 'Engineering', createdAt: day(-80) },
  { uid: 'u-bea', name: 'Bea Lindqvist', email: 'bea@acme.io', role: 'manager', createdAt: day(-70) },
  { uid: 'u-anika', name: 'Anika Rao', email: 'anika@acme.io', role: 'employee', managerId: 'u-alan', managerName: 'Alan Brooks', createdAt: day(-60) },
  { uid: 'u-rahul', name: 'Rahul Verma', email: 'rahul@acme.io', role: 'employee', managerId: 'u-alan', managerName: 'Alan Brooks', createdAt: day(-58) },
  { uid: 'u-dev', name: 'Dev Patel', email: 'dev@acme.io', role: 'employee', managerId: 'u-bea', managerName: 'Bea Lindqvist', createdAt: day(-40) },
  { uid: 'u-samira', name: 'Samira Khan', email: 'samira@acme.io', role: 'employee', managerId: 'u-bea', managerName: 'Bea Lindqvist', createdAt: day(-20) },
]

const meetings = [
  { id: 'm1', title: 'Q4 Launch Readiness Sync', department: 'Product', date: day(0), status: 'processing', task_count: 0, decision_count: 0, risk_count: 0, flagged_count: 0, source: 'extension' },
  { id: 'm2', title: 'Pricing Page & Billing Review', department: 'Growth', date: day(-1), status: 'completed', task_count: 4, decision_count: 2, risk_count: 1, flagged_count: 2,
    duration_minutes: 48, duration_estimated: false, source: 'extension', participant_names: ['Olivia Hart', 'Anika Rao', 'Rahul Verma', 'Dev Patel'],
    highlight: { quote: 'We hold the pricing page launch until legal signs off on the new copy.', speaker: 'Olivia Hart' } },
  { id: 'm3', title: 'Sprint 42 Planning', department: 'Engineering', date: day(-3), status: 'completed', task_count: 6, decision_count: 1, risk_count: 0, flagged_count: 0,
    duration_minutes: 35, duration_estimated: true, participant_names: ['Alan Brooks', 'Anika Rao', 'Dev Patel'],
    highlight: { quote: 'Redis fallback will trigger read-only replication within 400ms.', speaker: 'Dev Patel' } },
  { id: 'm4', title: 'Customer Advisory Board Debrief', department: 'Sales', date: day(-6), status: 'completed', task_count: 3, decision_count: 1, risk_count: 1, flagged_count: 1,
    highlight: { quote: 'Enterprise customers need audit trails before approving automated tasks.', speaker: 'Samira Khan' } },
  { id: 'm5', title: 'Infra Cost Review', department: 'Engineering', date: day(-9), status: 'failed', task_count: 0, decision_count: 0, risk_count: 0, flagged_count: 0 },
]

const tasks = [
  { id: 't1', meeting_id: 'm2', title: 'Ship the pricing page redesign', description: 'Finish the new pricing page and put it live.', assigned_to: 'anika rao', owner_uid: 'u-anika',
    deadline: date(2), deadline_date: date(2), deadline_text: 'by Friday', status: 'pending', confidence: 100, validated: 'pending', needs_review: true,
    review_reason: 'Contradicts the decision to hold the pricing launch until legal approves the copy.', evidence_quote: "I'll have the pricing page live by Friday.", speaker: 'Anika Rao',
    confidence_breakdown: { clarity: 25, owner: 25, deadline: 25, evidence: 25 }, confidence_note: 'Fully specified: a named owner, a clear deadline and a direct quote.', confidence_next_step: '',
    acceptance: 'pending', assignee_title: 'Frontend Developer', createdAt: day(-1) },
  { id: 't2', meeting_id: 'm2', title: 'Finish the Stripe webhook integration', description: 'Handle subscription and invoice webhooks end to end.', assigned_to: 'rahul verma', owner_uid: 'u-rahul',
    deadline: date(2), deadline_date: date(2), deadline_text: 'by Friday', status: 'pending', confidence: 100, validated: 'pending', needs_review: true,
    review_reason: 'Rahul said he is out Thursday and Friday, but was given a Friday deadline.', evidence_quote: 'Yes, I can finish the Stripe webhooks by Friday.', speaker: 'Rahul Verma',
    confidence_breakdown: { clarity: 25, owner: 25, deadline: 25, evidence: 25 }, confidence_note: 'Fully specified, but the audit agent found a scheduling conflict.', confidence_next_step: 'Confirm a new date with Rahul',
    acceptance: 'accepted', progress: 40, progressNote: 'Subscription events done, invoices next', updates: [{ by: 'Rahul Verma', at: day(0), progress: 40, note: 'Subscription events done, invoices next' }],
    assignee_title: 'Backend Engineer', createdAt: day(-1) },
  { id: 't3', meeting_id: 'm2', title: 'Set up the load testing environment', description: 'Provision a staging cluster for load tests.', assigned_to: 'dev patel', owner_uid: 'u-dev',
    deadline: date(6), deadline_date: date(6), deadline_text: 'next week', status: 'done', confidence: 90, validated: 'approved', needs_review: false,
    evidence_quote: "I'll set up the load testing environment next week.", speaker: 'Dev Patel', completedAt: day(-1),
    confidence_breakdown: { clarity: 15, owner: 25, deadline: 25, evidence: 25 }, confidence_note: 'Clear owner and date; the description is brief.', confidence_next_step: 'Add the target load to the description' },
  { id: 't4', meeting_id: 'm2', title: 'Update the onboarding docs', description: '', assigned_to: 'olivia hart', owner_uid: 'u-olivia',
    deadline: 'at some point', deadline_date: null, deadline_text: 'at some point', status: 'pending', confidence: 55, validated: 'pending', needs_review: false,
    evidence_quote: 'And someone should update the onboarding docs at some point.', speaker: 'Olivia Hart',
    confidence_breakdown: { clarity: 15, owner: 15, deadline: 0, evidence: 25 }, confidence_note: 'No deadline was given and the owner was inferred, so it lost 45 points.', confidence_next_step: 'Ask the team for an owner and a date' },
  { id: 't5', meeting_id: 'm3', title: 'Document the Redis failover runbook', description: 'Write the runbook for read-only replication failover.', assigned_to: 'anika rao', owner_uid: 'u-anika',
    deadline_date: date(-2), deadline: date(-2), deadline_text: 'Monday', status: 'overdue', confidence: 85, validated: 'approved', needs_review: false,
    evidence_quote: "I'll write up the failover runbook by Monday.", speaker: 'Anika Rao', acceptance: 'accepted', createdAt: day(-8) },
  { id: 't6', meeting_id: 'm4', title: 'Draft the audit-trail requirements for enterprise', description: 'Summarise what enterprise customers need before approving AI tasks.', assigned_to: 'anika rao', owner_uid: 'u-anika',
    deadline_date: date(9), deadline: date(9), deadline_text: 'in two weeks', status: 'pending', confidence: 80, validated: 'approved', needs_review: false,
    evidence_quote: 'I can pull the audit-trail requirements together in two weeks.', speaker: 'Anika Rao', acceptance: 'accepted', progress: 30,
    progressNote: 'Interviewed 3 customers', createdAt: day(-5) },
  { id: 't7', meeting_id: 'm3', title: 'Fix the flaky checkout test', description: '', assigned_to: 'anika rao', owner_uid: 'u-anika', deadline_date: date(-6), deadline: date(-6),
    status: 'done', confidence: 90, validated: 'approved', acceptance: 'accepted', completedAt: day(-1), createdAt: day(-9), evidence_quote: 'I can fix the flaky checkout test.', speaker: 'Anika Rao' },
]

const meetingDetail = {
  ...meetings[1], view: me.role === 'employee' ? 'member' : 'full',
  participants: [{ name: 'Olivia Hart' }, { name: 'Anika Rao' }, { name: 'Rahul Verma' }, { name: 'Dev Patel' }],
  tasks: me.role === 'employee' ? tasks.filter(t => t.meeting_id === 'm2' && t.owner_uid === 'u-anika') : tasks.filter(t => t.meeting_id === 'm2'),
  decisions: [
    { title: 'Hold the pricing page launch', description: 'The launch waits for legal approval of the new copy.', evidence_quote: 'We hold the pricing page launch until legal signs off on the new copy.', speaker: 'Olivia Hart' },
    { title: 'Public beta on October 15', description: 'The beta ships on the 15th regardless of other dates.', evidence_quote: 'We decided to launch the public beta on October 15 regardless.', speaker: 'Olivia Hart' },
  ],
  risks: [{ title: 'Stripe sandbox instability', description: 'Flaky sandbox may delay webhook testing.', evidence_quote: "Stripe's sandbox has been flaky, so testing might slip.", speaker: 'Rahul Verma',
             severity: 'high', mitigation: 'Record webhook payloads once and replay them in tests instead of relying on the sandbox.' }],
  duration_minutes: 48, duration_estimated: false,
  ...(me.role === 'employee' ? { redacted: true } : {}),
  validation_summary: 'Most tasks are clear and grounded. Two need attention: the pricing launch conflicts with the legal hold, and Rahul’s deadline falls on days he is out.',
  audit: { passed: false, completed: true, summary: 'Not safe to hand over yet: one task contradicts a decision and one assignment ignores stated availability.', findings: [
    { severity: 'critical', category: 'conflict', task_title: 'Ship the pricing page redesign', message: 'Contradicts the decision to hold the launch until legal signs off.', source: 'agent' },
    { severity: 'warning', category: 'ownership', task_title: 'Finish the Stripe webhook integration', message: 'Rahul said he is out Thursday and Friday.', source: 'agent' },
    { severity: 'info', category: 'ownership', task_title: 'Update the onboarding docs', message: 'Owner was inferred; nobody volunteered.', source: 'agent' },
  ] },
  transcript: "Olivia Hart: Quick sync on the Q4 launch.\nAnika Rao: The pricing page redesign is almost done. I'll have the pricing page live by Friday.\nOlivia Hart: Wait. We hold the pricing page launch until legal signs off on the new copy.\nRahul Verma: Heads up, I'm out Thursday and Friday.\nOlivia Hart: Rahul, please finish the Stripe webhooks by Friday anyway.\nRahul Verma: Yes, I can finish the Stripe webhooks by Friday. Stripe's sandbox has been flaky, so testing might slip.\nOlivia Hart: We decided to launch the public beta on October 15 regardless.\nDev Patel: I'll set up the load testing environment next week.\nOlivia Hart: And someone should update the onboarding docs at some point.",
  mom: "## Executive Summary\nThe team reviewed Q4 launch readiness. The public beta is confirmed for October 15; the pricing page waits for legal.\n\n## Key Decisions\n* Hold the pricing page launch until legal approves the copy.\n* Launch the public beta on **October 15**.\n\n## Action Items\n* Pricing page redesign: Anika Rao, Friday\n* Stripe webhooks: Rahul Verma, Friday\n* Load testing environment: Dev Patel, next week\n\n## Risks & Concerns\n* Stripe sandbox instability may delay testing.\n\n## Next Steps\n* Confirm a new date with Rahul.\n* Re-review the pricing launch once legal signs off.",
  logs: [
    ['System', "Meeting 'Pricing Page & Billing Review' uploaded. CrewAI processing started."],
    ['Meeting Extraction Specialist', 'Extracted 4 tasks, 2 decisions and 1 risks, each with a transcript quote.'],
    ['Task Assignment Specialist', 'Assigned owners for 4 tasks.'],
    ['Task Validation Specialist', 'Reviewed 7 items against the transcript; flagged 2 for PM review.'],
    ['Follow-up Coordinator', 'Planned follow-ups and escalation paths for 4 tasks.'],
    ['Confidence Analyst', 'Explained the confidence score of 4 tasks.'],
    ['Audit & Compliance Reviewer', 'Audit finished: 3 findings. Not safe to hand over yet.'],
    ['Meeting Summary Specialist', 'Generated the Minutes of Meeting.'],
    ['Olivia Hart (Human)', "Task 'Set up the load testing environment' approved"],
  ].map(([agent, action], i) => ({ agent, action, timestamp: new Date(NOW - 86400000 + i * 40000).toISOString() })),
}

if (me.role === 'employee') Object.assign(meetingDetail, { transcript: null, validation_summary: '', audit: null, logs: [] })

const member = (uid, name, status, done, assigned, overdue, dots, alerts, extra = {}) => ({
  uid, name, role: 'employee', managerName: 'Alan Brooks', status, dots, alerts, trend: extra.trend ?? null, jobTitle: extra.jobTitle || '', oldestOverdue: extra.oldest || null,
  window: { assigned, done, open: assigned - done, overdue, escalated: 0, stale: 0, rate: assigned ? done / assigned : null, onTimeRate: 0.8 },
  allTime: { assigned: assigned + 4, done: done + 3, open: assigned - done + 1, overdue, escalated: 0, stale: 0, rate: 0.7, onTimeRate: extra.onTime ?? 0.8 },
  openTasks: extra.openTasks || [],
})
const analytics = {
  window: 10, meetingsInWindow: 10,
  summary: { assigned: 50, done: 39, open: 11, overdue: 4, escalated: 2, completionRate: 0.78, onTimeRate: 0.86, members: 4, atRisk: 1, needAttention: 1, pendingApproval: 3, processing: 1, failed: 1 },
  alerts: [
    { severity: 'critical', kind: 'behind', uid: 'u-rahul', name: 'Rahul Verma', message: 'Rahul completed 4 of 10 tasks from the last 10 meetings (40%): 6 not done, 3 of them overdue.' },
    { severity: 'warning', kind: 'behind', uid: 'u-anika', name: 'Anika Rao', message: 'Anika completed 6 of 10 tasks from the last 10 meetings (60%): 4 not done.' },
    { severity: 'warning', kind: 'declining', uid: 'u-dev', name: 'Dev Patel', message: "Dev's completion dropped from 90% to 70% compared with the previous 10 meetings." },
  ],
  members: [
    member('u-rahul', 'Rahul Verma', 'at_risk', 4, 10, 3, ['done', 'done', 'open', 'done', 'overdue', 'open', 'done', 'overdue', 'overdue', 'open'],
      [{ severity: 'critical', kind: 'behind', message: 'Rahul completed 4 of 10 tasks from the last 10 meetings (40%): 6 not done, 3 of them overdue.' },
       { severity: 'warning', kind: 'overdue', message: 'Rahul has 3 overdue tasks (oldest was due Sep 20).' }],
      { trend: -0.3, onTime: 0.62, jobTitle: 'Backend Engineer', oldest: { title: 'Migrate auth tokens', daysLate: 6, meetingId: 'm3' }, openTasks: [{ id: 't2', title: 'Finish the Stripe webhook integration', meetingId: 'm2', deadline: date(2), overdue: false }] }),
    member('u-anika', 'Anika Rao', 'attention', 6, 10, 1, ['done', 'done', 'done', 'open', 'done', 'done', 'open', 'done', 'open', 'overdue'],
      [{ severity: 'warning', kind: 'behind', message: 'Anika completed 6 of 10 tasks from the last 10 meetings (60%): 4 not done.' }],
      { trend: -0.1, jobTitle: 'Frontend Developer', oldest: { title: 'Document the Redis failover runbook', daysLate: 2, meetingId: 'm3' }, openTasks: [{ id: 't5', title: 'Document the Redis failover runbook', meetingId: 'm3', deadline: date(-2), overdue: true }] }),
    member('u-dev', 'Dev Patel', 'on_track', 9, 10, 0, ['done', 'done', 'done', 'done', 'done', 'done', 'done', 'done', 'done', 'open'], [], { trend: 0.12, onTime: 0.95 }),
    member('u-samira', 'Samira Khan', 'on_track', 8, 10, 0, ['done', 'done', 'done', 'done', 'done', 'open', 'done', 'done', 'done', 'open'], [], { trend: 0.02, onTime: 0.91 }),
  ],
  meetings: [
    { id: 'm2', title: 'Pricing Page & Billing Review', date: day(-1), tasks: 4, done: 1, flagged: 2, auditFindings: 2 },
    { id: 'm3', title: 'Sprint 42 Planning', date: day(-3), tasks: 6, done: 5, flagged: 0, auditFindings: 0 },
    { id: 'm4', title: 'Customer Advisory Board Debrief', date: day(-6), tasks: 3, done: 2, flagged: 1, auditFindings: 1 },
    { id: 'm6', title: 'Weekly All-Hands', date: day(-8), tasks: 8, done: 8, flagged: 0, auditFindings: 0 },
    { id: 'm7', title: 'Design Review', date: day(-10), tasks: 5, done: 3, flagged: 0, auditFindings: 0 },
  ],
  weekly: [0, 1, 2, 3, 4, 5].map(i => ({ week: date(-7 * (5 - i) - ((new Date().getDay() + 6) % 7)), created: [7, 9, 6, 11, 8, 5][i], completed: [5, 8, 7, 7, 9, 4][i] })),
  upcoming: [
    { id: 't1', title: 'Ship the pricing page redesign', owner: 'anika rao', deadline: date(2), meetingId: 'm2' },
    { id: 't2', title: 'Finish the Stripe webhook integration', owner: 'rahul verma', deadline: date(2), meetingId: 'm2' },
    { id: 't3', title: 'Set up the load testing environment', owner: 'dev patel', deadline: date(6), meetingId: 'm2' },
  ],
  risks: [{ meetingId: 'm2', meetingTitle: 'Pricing Page & Billing Review', title: 'Stripe sandbox instability', description: 'Flaky sandbox may delay webhook testing.' }],
  pendingApproval: [
    { id: 't1', title: 'Ship the pricing page redesign', owner: 'anika rao', reason: 'Contradicts the legal hold on the pricing launch.', meetingId: 'm2', confidence: 100, quote: "I'll have the pricing page live by Friday.", deadline: date(2) },
    { id: 't2', title: 'Finish the Stripe webhook integration', owner: 'rahul verma', reason: 'Rahul is out Thursday and Friday.', meetingId: 'm2', confidence: 100, quote: 'Yes, I can finish the Stripe webhooks by Friday.', deadline: date(2) },
  ],
}

const ROUTES = [
  ['get', /^\/meetings\/?$/, () => (me.role === 'employee' ? meetings.filter(m => ['m2', 'm3', 'm4'].includes(m.id)) : meetings)],
  ['get', /^\/meetings\/[^/]+$/, () => meetingDetail],
  ['get', /^\/tasks\/mine$/, () => tasks.filter(t => t.owner_uid === me.uid)],
  ['get', /^\/tasks\/?$/, () => tasks],
  ['get', /^\/analytics\/team$/, () => analytics],
  ['get', /^\/companies\/team$/, () => (me.role === 'manager' ? team.filter(m => m.uid === 'u-alan' || m.managerId === 'u-alan') : team)],
  ['get', /^\/companies\/info$/, () => ({ companyId: 'co_demo', name: 'Acme Labs', memberCount: team.length })],
  ['get', /^\/companies\/invites$/, () => [{ code: 'K7Q2M9XA', role: 'manager', managerId: null, expiresAt: day(6), uses: 1 }, { code: 'P4T8W2NB', role: 'employee', managerId: 'u-alan', expiresAt: day(5), uses: 3 }]],
  ['get', /^\/notifications$/, () => ({ items: me.role === 'employee' ? [
      { id: 'accept:t1', kind: 'accept', severity: 'info', at: day(0), link: '/employee', title: 'New task for you', body: '“Ship the pricing page redesign” is waiting for you to accept it.' },
      { id: 'overdue:t5', kind: 'overdue', severity: 'critical', at: day(-2), link: '/employee', title: 'Overdue task', body: '“Document the Redis failover runbook” was due earlier.' },
    ] : [
      { id: 'declined:t9', kind: 'declined', severity: 'critical', at: day(0), link: '/meeting/m2', title: 'Task declined', body: 'Declined by Dev Patel: I am on leave next week.' },
      { id: 'review:t1', kind: 'review', severity: 'warning', at: day(-1), link: '/meeting/m2', title: 'Needs your approval', body: '“Ship the pricing page redesign”: contradicts the legal hold.' },
      { id: 'meeting:m2', kind: 'meeting', severity: 'info', at: day(-1), link: '/meeting/m2', title: 'Meeting processed', body: '“Pricing Page & Billing Review” is ready: 2 task(s) to review.' },
      { id: 'failed:m5', kind: 'failed', severity: 'critical', at: day(-9), link: '/meeting/m5', title: 'Processing failed', body: '“Infra Cost Review” could not be processed. Open it to see why.' },
    ], total: 4 })],
  ['get', /^\/extension\/status$/, () => ({ connected: true, connectedAt: day(-2), lastUsedAt: day(0) })],
  ['get', /^\/companies\/invite-preview$/, config => {
    const code = (config.params?.code || '').toUpperCase()
    if (code === 'K7Q2M9XA') return { companyName: 'Acme Labs', role: 'manager', managerName: null }
    if (code === 'P4T8W2NB') return { companyName: 'Acme Labs', role: 'employee', managerName: 'Alan Brooks' }
    throw Object.assign(new Error('bad code'), { response: { status: 404, data: { detail: "That invite code doesn't exist. Check it and try again." } } })
  }],
  ['post', /^\/companies$/, config => ({ companyId: 'co_new', companyName: JSON.parse(config.data).name, role: 'pm' })],
  ['post', /^\/companies\/join$/, () => ({ companyId: 'co_demo', companyName: 'Acme Labs', role: 'employee' })],
  ['post', /^\/meetings\/[^/]+\/chat$/, () => ({ response: 'Rahul committed to the Stripe webhooks by Friday, but earlier said he is out Thursday and Friday.' })],
  ['post', /./, () => ({ ok: true })],
  ['patch', /./, () => ({ ok: true })],
  ['delete', /./, () => ({ ok: true })],
]

api.defaults.adapter = async config => {
  const path = (config.url || '').replace(/^https?:\/\/[^/]+/, '').split('?')[0]
  const route = ROUTES.find(([method, re]) => method === config.method && re.test(path))
  await new Promise(r => setTimeout(r, 120))
  if (!route) return Promise.reject(Object.assign(new Error(`mock: no route for ${config.method} ${path}`), { response: { status: 404, data: { detail: 'Not mocked' } } }))
  try {
    return { data: route[2](config), status: 200, statusText: 'OK', headers: {}, config }
  } catch (err) {
    return Promise.reject(err)
  }
}
console.info(`[MeetingOS] preview mode as ${me.role} (${me.name}). localStorage.removeItem('meetingos_mock') to exit.`)
