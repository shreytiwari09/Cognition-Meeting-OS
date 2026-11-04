import { useNavigate } from 'react-router-dom'
import ChromeExtensionsLink from '../components/ChromeExtensionsLink'
import { Avatar, Chip, Icon, Logo, ProgressBar } from '../components/ui'
import { useDocumentTitle } from '../lib/pageMeta'

const EXTENSION_DOWNLOAD_URL = import.meta.env.VITE_EXTENSION_ZIP_URL || '/meetingos-extension.zip'

const STEPS = [
  { icon: 'mic', title: 'Capture the meeting', text: 'Join a Google Meet with the Chrome extension, or paste any transcript. Speaker names come along.' },
  { icon: 'hub', title: '7 AI agents review it', text: 'Tasks, owners, deadlines, decisions and risks, each backed by a quote, then audited for contradictions.' },
  { icon: 'insights', title: 'Track what gets done', text: 'Managers approve the AI’s tasks and see who is on track, meeting after meeting.' },
]

const FEATURES = [
  { icon: 'format_quote', title: 'Evidence on every task', text: 'Each task shows the exact words that created it, so nothing is invented and nobody can say “I never agreed to that”.' },
  { icon: 'gpp_maybe', title: 'An AI auditor', text: 'Flags a task that contradicts a decision, duplicates, missing follow-ups, and people given work they said they couldn’t do.' },
  { icon: 'notifications_active', title: 'Early warnings', text: '“Anika completed 6 of 10 tasks from the last 10 meetings.” See who needs a nudge before deadlines slip.' },
  { icon: 'account_tree', title: 'Built for teams', text: 'Owners, managers and their teams. Everyone sees exactly what they should: no more, no less.' },
]

const ROLES = [
  { role: 'Owner', icon: 'apartment', tone: 'coral', steps: ['Register your company.', 'Invite your managers with an invite code.', 'Upload meetings or capture them with the extension.', 'Approve AI tasks and watch delivery across teams.'] },
  { role: 'Manager', icon: 'supervisor_account', tone: 'done', steps: ['Join with the manager code from your owner.', 'Invite your team with your own team code.', 'Approve the AI’s tasks for your team.', 'Spot who is falling behind on the Team page.'] },
  { role: 'Employee', icon: 'badge', tone: 'outline', steps: ['Join with your manager’s invite code.', 'See your tasks, each with the words that created it.', 'Mark tasks done as you go.', 'Escalate to your manager if you’re blocked.'] },
]

const INSTALL = [
  <>Download the extension and unzip it.</>,
  <>Open <ChromeExtensionsLink /> in a new tab.</>,
  <>Turn on <b>Developer mode</b> (top right).</>,
  <>Click <b>Load unpacked</b> and pick the unzipped folder.</>,
  <>Pin it, click it and press <b>Connect account</b>.</>,
]

function HeroPreview() {
  return (
    <div className="relative">
      <div className="absolute -inset-6 bg-coral/20 blur-3xl rounded-full" />
      <div className="relative bento p-6 rotate-1">
        <div className="flex items-center justify-between mb-3">
          <Chip tone="pending" dot>Due Friday</Chip>
          <span className="text-label-md text-done flex items-center gap-1">94% confidence<Icon name="verified" size={15} /></span>
        </div>
        <p className="text-headline-sm text-ink">Ship the pricing page redesign</p>
        <div className="mt-4 rounded-tile bg-surface-container-low border-l-[3px] border-coral px-4 py-3">
          <p className="eyebrow text-coral-deep mb-1">Verbatim evidence</p>
          <p className="text-body-sm italic text-ink">“I’ll have the pricing page live by Friday.”</p>
          <p className="text-[12px] text-ink-2 mt-1">— Anika Rao, 00:12:41</p>
        </div>
        <div className="flex items-center gap-2.5 mt-4">
          <Avatar name="Anika Rao" size={30} /><span className="text-label-lg text-ink">Anika Rao</span>
          <button className="btn btn-primary btn-sm ml-auto pointer-events-none"><Icon name="check" size={15} />Approve</button>
        </div>
      </div>
      <div className="relative bento p-5 -mt-4 ml-10 -rotate-2 max-w-xs">
        <div className="flex items-center gap-2 mb-2"><Icon name="gpp_maybe" size={18} className="text-coral" /><p className="text-label-lg text-ink">Audit agent</p><Chip tone="overdue" className="ml-auto">Critical</Chip></div>
        <p className="text-body-sm text-ink-2">Rahul said he is out Thursday and Friday, but was given a Friday deadline.</p>
      </div>
      <div className="relative rounded-bento bg-panel text-white p-5 -mt-3 mr-6 ml-auto rotate-1 max-w-65">
        <p className="eyebrow text-mint">Team · last 10 meetings</p>
        <p className="text-headline-md mt-1">6/10 done</p>
        <div className="mt-2"><ProgressBar value={0.6} tone="coral" track="bg-white/15" /></div>
      </div>
    </div>
  )
}

export default function LandingPage() {
  const navigate = useNavigate()
  useDocumentTitle('Turn meetings into accountable execution')
  const scrollTo = id => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })

  return (
    <div className="min-h-screen bg-canvas">
      <header className="sticky top-0 z-40 bg-canvas/85 backdrop-blur-xl border-b border-black/4">
        <div className="max-w-6xl mx-auto px-5 h-16 flex items-center justify-between gap-4">
          <Logo />
          <nav className="hidden md:flex items-center gap-1">
            {[['how', 'How it works'], ['features', 'Features'], ['roles', 'For teams'], ['extension', 'Extension']].map(([id, label]) => (
              <button key={id} onClick={() => scrollTo(id)} className="btn btn-ghost btn-sm">{label}</button>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <button onClick={() => navigate('/login')} className="btn btn-ghost btn-sm">Sign in</button>
            <button onClick={() => navigate('/login')} className="btn btn-primary btn-sm">Get started</button>
          </div>
        </div>
      </header>

      <section className="max-w-6xl mx-auto px-5 pt-16 pb-20 grid lg:grid-cols-2 gap-14 items-center">
        <div>
          <Chip tone="coral" dot className="mb-5">7 AI agents · evidence-backed tasks</Chip>
          <h1 className="text-[40px] sm:text-headline-xl leading-[1.08] font-bold tracking-tight text-ink">
            Turn meetings into <span className="text-coral">accountable execution</span>.
          </h1>
          <p className="text-body-lg text-ink-2 mt-5 max-w-lg">
            MeetingOS listens to your Google Meet calls, turns what people committed to into tasks with owners and deadlines,
            and shows managers who is delivering. Every task comes with the exact words it came from.
          </p>
          <div className="flex flex-wrap gap-3 mt-8">
            <button onClick={() => navigate('/login')} className="btn btn-primary">Register your company<Icon name="arrow_forward" size={18} /></button>
            <button onClick={() => scrollTo('how')} className="btn btn-outline">See how it works</button>
          </div>
          <p className="text-body-sm text-ink-3 mt-4">Have an invite code? <button onClick={() => navigate('/login')} className="text-coral-deep font-semibold hover:underline">Join your team</button></p>
        </div>
        <HeroPreview />
      </section>

      <section id="how" className="max-w-6xl mx-auto px-5 py-16 scroll-mt-20">
        <p className="eyebrow text-coral-deep">How it works</p>
        <h2 className="text-headline-lg text-ink mt-2 mb-8">From conversation to commitments in three steps</h2>
        <div className="grid md:grid-cols-3 gap-5">
          {STEPS.map((s, i) => (
            <div key={s.title} className={i === 1 ? 'rounded-bento bg-coral text-white p-7 shadow-coral' : 'bento p-7'}>
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-5 ${i === 1 ? 'bg-white/20' : 'bg-coral-wash text-coral'}`}><Icon name={s.icon} /></div>
              <p className={`text-label-md mb-1 ${i === 1 ? 'text-white/80' : 'text-ink-3'}`}>Step {i + 1}</p>
              <p className={`text-headline-sm ${i === 1 ? 'text-white' : 'text-ink'}`}>{s.title}</p>
              <p className={`text-body-md mt-2 ${i === 1 ? 'text-white/90' : 'text-ink-2'}`}>{s.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="features" className="max-w-6xl mx-auto px-5 py-16 scroll-mt-20">
        <p className="eyebrow text-coral-deep">Why it works</p>
        <h2 className="text-headline-lg text-ink mt-2 mb-8">AI you can actually trust with your team’s work</h2>
        <div className="grid sm:grid-cols-2 gap-5">
          {FEATURES.map(f => (
            <div key={f.title} className="bento p-7 flex gap-5">
              <div className="w-12 h-12 rounded-2xl bg-surface-container-low text-coral flex items-center justify-center shrink-0"><Icon name={f.icon} /></div>
              <div><p className="text-headline-sm text-ink">{f.title}</p><p className="text-body-md text-ink-2 mt-1.5">{f.text}</p></div>
            </div>
          ))}
        </div>
      </section>

      <section id="roles" className="max-w-6xl mx-auto px-5 py-16 scroll-mt-20">
        <p className="eyebrow text-coral-deep">For the whole team</p>
        <h2 className="text-headline-lg text-ink mt-2 mb-8">Owner → managers → their teams</h2>
        <div className="grid md:grid-cols-3 gap-5">
          {ROLES.map(r => (
            <div key={r.role} className="bento p-7">
              <div className="flex items-center justify-between mb-5">
                <div className="w-11 h-11 rounded-2xl bg-surface-container-low text-ink flex items-center justify-center"><Icon name={r.icon} /></div>
                <Chip tone={r.tone}>{r.role}</Chip>
              </div>
              <ol className="flex flex-col gap-3">
                {r.steps.map((s, i) => (
                  <li key={s} className="flex gap-3 text-body-md text-ink-2">
                    <span className="w-6 h-6 rounded-full bg-surface-container text-ink text-label-sm flex items-center justify-center shrink-0">{i + 1}</span>{s}
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      </section>

      <section id="extension" className="max-w-6xl mx-auto px-5 py-16 scroll-mt-20">
        <div className="rounded-[36px] bg-panel text-white p-8 sm:p-12 grid lg:grid-cols-2 gap-10">
          <div>
            <p className="eyebrow text-coral">Chrome extension</p>
            <h2 className="text-headline-lg mt-2">Hands-free Google Meet capture</h2>
            <p className="text-body-lg text-ink-3 mt-3">Join a call and it turns captions on, captures who said what, and sends the meeting to your AI agents when you leave. A small badge in the call shows it’s recording.</p>
            <a href={EXTENSION_DOWNLOAD_URL} download className="btn btn-primary mt-7"><Icon name="download" size={18} />Download extension</a>
            <p className="text-body-sm text-ink-3 mt-3">Chrome, Edge, Brave and Arc. Owners and managers connect it from their account.</p>
          </div>
          <ol className="flex flex-col gap-3">
            {INSTALL.map((s, i) => (
              <li key={i} className="flex gap-4 items-center rounded-card bg-white/6 px-5 py-4">
                <span className="w-8 h-8 rounded-full bg-coral text-white text-label-md flex items-center justify-center shrink-0">{i + 1}</span>
                <span className="text-body-md text-[#e4e1e6] [&_b]:text-white">{s}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-5 pt-8 pb-20">
        <div className="bento p-10 sm:p-14 text-center">
          <h2 className="text-headline-lg text-ink">Make your next meeting count</h2>
          <p className="text-body-lg text-ink-2 mt-3 max-w-xl mx-auto">Register your company in under a minute, invite your managers, and let the agents take the notes.</p>
          <div className="flex flex-wrap justify-center gap-3 mt-7">
            <button onClick={() => navigate('/login')} className="btn btn-primary">Get started free<Icon name="arrow_forward" size={18} /></button>
            <button onClick={() => navigate('/login')} className="btn btn-outline">I have an invite code</button>
          </div>
        </div>
      </section>

      <footer className="border-t border-black/5">
        <div className="max-w-6xl mx-auto px-5 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <Logo />
          <p className="text-body-sm text-ink-3">Turn meetings into accountable execution.</p>
        </div>
      </footer>
    </div>
  )
}
