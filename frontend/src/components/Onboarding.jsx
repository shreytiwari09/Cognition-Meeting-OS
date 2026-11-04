import { Fragment, useState } from 'react'
import { createCompany, joinCompany, previewInvite } from '../api'
import { Icon, Logo } from './ui'
import { DEPARTMENTS, ROLE_LABEL } from '../lib/format'
import { useDocumentTitle } from '../lib/pageMeta'

const PATHS = [
  { id: 'owner', icon: 'apartment', title: 'Register a new company', text: 'You’re the owner. Set up your company, then invite your managers.', badge: 'Owner' },
  { id: 'manager', icon: 'supervisor_account', title: 'Join as a manager / PM', text: 'You lead a team. Your owner gave you a manager invite code.', badge: 'Invite code' },
  { id: 'employee', icon: 'badge', title: 'Join as an employee', text: 'You’re part of a team. Your manager gave you a team invite code.', badge: 'Invite code' },
]
const INDUSTRIES = ['Software & IT', 'Finance', 'Healthcare', 'Education', 'E-commerce & Retail', 'Manufacturing', 'Consulting & Agency', 'Media', 'Non-profit', 'Other']
const SIZES = ['1-10', '11-50', '51-200', '201-1000', '1000+']
const COUNTRIES = ['India', 'United States', 'United Kingdom', 'Canada', 'Germany', 'Australia', 'Singapore', 'United Arab Emirates', 'France', 'Netherlands']

function Field({ label, hint, error, optional, children }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="eyebrow text-ink-2">{label}{optional && <span className="normal-case tracking-normal font-medium text-ink-3"> · optional</span>}</span>
      {children}
      {error ? <span className="text-[12px] text-overdue px-2">{error}</span> : hint && <span className="text-[12px] text-ink-3 px-2">{hint}</span>}
    </label>
  )
}

function Stepper({ steps, current }) {
  return (
    <ol className="flex items-center gap-2 mb-8 overflow-x-auto no-scrollbar">
      {steps.map((label, i) => (
        <li key={label} className="flex items-center gap-2 shrink-0">
          <span className={`w-7 h-7 rounded-full flex items-center justify-center text-label-md ${
            i < current ? 'bg-forest text-white' : i === current ? 'bg-coral text-white' : 'bg-surface-container text-ink-3'}`}>
            {i < current ? <Icon name="check" size={15} /> : i + 1}
          </span>
          <span className={`text-label-md ${i === current ? 'text-ink' : 'text-ink-2'}`}>{label}</span>
          {i < steps.length - 1 && <span className="w-6 h-px bg-surface-container-high" />}
        </li>
      ))}
    </ol>
  )
}

function ErrorNote({ children }) {
  if (!children) return null
  return <div className="rounded-2xl bg-overdue-bg text-overdue px-4 py-3 text-body-sm flex gap-2"><Icon name="error" size={18} className="shrink-0" />{children}</div>
}

const apiError = (err, fallback) => {
  const d = err.response?.data?.detail
  if (err.response?.status === 429) return 'Too many attempts. Wait a minute and try again.'
  return typeof d === 'string' ? d : fallback
}

// Onboarding after sign-up: register a company (owner) or join one with an invite code (manager / employee).
// The invite code, not the chosen path, decides the role: a mismatch is shown before joining.
export default function Onboarding({ defaultName = '', email = '', onDone }) {
  useDocumentTitle('Set up your account')
  const [path, setPath] = useState(null)
  const [step, setStep] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [errors, setErrors] = useState({})
  const [person, setPerson] = useState({ full_name: defaultName, job_title: '', phone: '', department: '' })
  const [company, setCompany] = useState({ name: '', industry: '', size: '', country: '', website: '' })
  const [code, setCode] = useState('')
  const [preview, setPreview] = useState(null)
  const [result, setResult] = useState(null)

  const isOwner = path === 'owner'
  const steps = isOwner ? ['Your path', 'About you', 'Your company', 'Review'] : ['Your path', 'Invite code', 'About you']
  const setP = key => e => setPerson({ ...person, [key]: e.target.value })
  const setC = key => e => setCompany({ ...company, [key]: e.target.value })

  function back() {
    setError(''); setErrors({})
    if (step <= 1) { setStep(0); setPath(null) } else setStep(step - 1)
  }

  function validatePerson() {
    const e = {}
    if (person.full_name.trim().length < 2) e.full_name = 'Enter your full name.'
    if (person.job_title.trim().length < 2) e.job_title = 'Enter your job title.'
    if (person.phone && !/^[+\d][\d\s()-]{6,}$/.test(person.phone.trim())) e.phone = 'Enter a valid phone number, or leave it empty.'
    setErrors(e)
    return !Object.keys(e).length
  }

  function validateCompany() {
    const e = {}
    if (company.name.trim().length < 2) e.name = 'Enter your company’s name.'
    if (!company.industry) e.industry = 'Pick an industry.'
    if (!company.size) e.size = 'Pick a company size.'
    if (company.country.trim().length < 2) e.country = 'Enter your country.'
    if (company.website && !/^(https?:\/\/)?[\w-]+(\.[\w-]+)+([/?#].*)?$/i.test(company.website.trim())) e.website = 'Enter a valid website, or leave it empty.'
    setErrors(e)
    return !Object.keys(e).length
  }

  async function checkCode(e) {
    e.preventDefault()
    const c = code.trim().toUpperCase()
    if (c.length < 4) return setError('Enter the invite code you received.')
    setBusy(true); setError('')
    try {
      const { data } = await previewInvite(c)
      setPreview({ ...data, code: c })
    } catch (err) {
      setPreview(null)
      setError(apiError(err, 'Could not check that code. Try again.'))
    } finally {
      setBusy(false)
    }
  }

  async function submit() {
    setBusy(true); setError('')
    const personBody = { full_name: person.full_name.trim(), job_title: person.job_title.trim(), phone: person.phone.trim() }
    try {
      if (isOwner) {
        const { data } = await createCompany({ ...personBody, ...company, name: company.name.trim(), country: company.country.trim(), website: company.website.trim() })
        setResult({ role: 'pm', companyName: data.companyName })
      } else {
        const { data } = await joinCompany({ ...personBody, department: person.department.trim(), invite_code: preview.code })
        setResult({ role: data.role, companyName: data.companyName, managerName: preview.managerName })
      }
    } catch (err) {
      setError(apiError(err, isOwner ? 'Could not register the company. Try again.' : 'Could not join. Try again.'))
    } finally {
      setBusy(false)
    }
  }

  const shell = content => (
    <div className="min-h-screen bg-canvas flex flex-col">
      <header className="px-6 sm:px-10 h-20 flex items-center justify-between">
        <Logo />
        {email && <span className="text-body-sm text-ink-2 hidden sm:inline">Signed in as <b className="text-ink">{email}</b></span>}
      </header>
      <main id="main" className="flex-1 flex justify-center px-5 pb-16">
        <div className="w-full max-w-2xl">{content}</div>
      </main>
    </div>
  )

  // ── Done ──────────────────────────────────────────────────────────────────
  if (result) {
    const owner = result.role === 'pm'
    return shell(
      <div className="bento p-8 sm:p-12 text-center mt-6 anim-fade-up">
        <div className="w-16 h-16 rounded-2xl bg-forest-soft text-forest flex items-center justify-center mx-auto mb-5"><Icon name="celebration" size={32} /></div>
        <h1 className="text-headline-lg text-ink">{owner ? `${result.companyName} is ready` : `Welcome to ${result.companyName}`}</h1>
        <p className="text-body-lg text-ink-2 mt-3">
          {owner ? 'You’re the Owner. Here’s how to get your company going:'
                 : `You joined as ${result.role === 'manager' ? 'a manager' : 'an employee'}${result.managerName ? ` in ${result.managerName}’s team` : ''}.`}
        </p>
        {owner ? (
          <ol className="text-left max-w-sm mx-auto mt-6 flex flex-col gap-3">
            {['Invite your managers from the Team page', 'Managers invite their own teams', 'Upload a meeting, or capture one with the Chrome extension'].map((t, i) => (
              <li key={t} className="flex gap-3 items-center text-body-md text-ink"><span className="w-7 h-7 rounded-full bg-coral-wash text-coral-deep text-label-md flex items-center justify-center shrink-0">{i + 1}</span>{t}</li>
            ))}
          </ol>
        ) : (
          <p className="text-body-md text-ink-2 mt-2">{result.role === 'manager' ? 'Next: invite your team and upload your first meeting.' : 'Your tasks from meetings will appear on your dashboard.'}</p>
        )}
        <button onClick={onDone} className="btn btn-primary mt-8">Go to my dashboard<Icon name="arrow_forward" size={18} /></button>
      </div>
    )
  }

  // ── Step 0: choose a path ─────────────────────────────────────────────────
  if (!path) {
    return shell(
      <div className="mt-6 anim-fade-up">
        <h1 className="text-headline-lg text-ink">How are you joining MeetingOS?</h1>
        <p className="text-body-md text-ink-2 mt-2 mb-8">Owners register their company. Managers and employees join with the invite code they were given.</p>
        <div className="flex flex-col gap-4">
          {PATHS.map(p => (
            <button key={p.id} onClick={() => { setPath(p.id); setStep(1); setError('') }}
                    className="bento p-6 text-left flex items-center gap-5 hover:shadow-float hover:-translate-y-0.5 transition-all group">
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 ${p.id === 'owner' ? 'bg-coral text-white' : 'bg-surface-container-low text-ink'}`}>
                <Icon name={p.icon} size={26} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-headline-sm text-ink group-hover:text-coral-deep">{p.title}</p>
                <p className="text-body-md text-ink-2 mt-0.5">{p.text}</p>
              </div>
              <Icon name="arrow_forward" className="text-ink-3 group-hover:text-coral" />
            </button>
          ))}
        </div>
        <p className="text-body-sm text-ink-3 mt-6 text-center">Not sure? If someone sent you a code, you’re joining. Only the person setting up the company registers it.</p>
      </div>
    )
  }

  const title = isOwner
    ? ['', 'Tell us about you', 'Tell us about your company', 'Review and register'][step]
    : ['', 'Enter your invite code', 'Tell us about you'][step]

  return shell(
    <div className="mt-6 anim-fade-up">
      <button onClick={back} className="btn btn-ghost btn-sm -ml-2 mb-4"><Icon name="arrow_back" size={18} />Back</button>
      <Stepper steps={steps} current={step} />
      <h1 className="text-headline-lg text-ink mb-6">{title}</h1>

      <div className="bento p-6 sm:p-8 flex flex-col gap-5">
        {/* Invite code (manager / employee) */}
        {!isOwner && step === 1 && (
          <>
            <form onSubmit={checkCode} className="flex flex-col gap-4">
              <Field label="Invite code" hint={path === 'manager' ? 'Your owner created this on their Team page.' : 'Your manager created this on their Team page.'}>
                <input className="field font-mono text-center text-headline-sm tracking-[0.3em] uppercase" value={code} autoFocus
                       onChange={e => { setCode(e.target.value); setPreview(null); setError('') }} placeholder="A3B9XZ7Q" maxLength={12} />
              </Field>
              {!preview && <button type="submit" disabled={busy} className="btn btn-primary">{busy ? 'Checking…' : 'Check code'}</button>}
            </form>
            <ErrorNote>{error}</ErrorNote>
            {preview && (
              <div className="rounded-card bg-forest-soft p-5 anim-fade-up">
                <p className="eyebrow text-forest mb-1">Code accepted</p>
                <p className="text-headline-sm text-ink">You’re joining <b>{preview.companyName}</b> as {preview.role === 'manager' ? 'a' : 'an'} {ROLE_LABEL[preview.role].toLowerCase()}{preview.managerName ? ` in ${preview.managerName}’s team` : ''}.</p>
                {preview.role !== path && (
                  <p className="text-body-sm text-pending mt-2 flex gap-1.5"><Icon name="info" size={16} className="shrink-0" />
                    You chose “{path === 'manager' ? 'manager' : 'employee'}”, but this code is for {preview.role === 'manager' ? 'a manager' : 'an employee'}. The code decides your role. If that’s wrong, ask for the right code.
                  </p>
                )}
                <button onClick={() => { setStep(2); setError('') }} className="btn btn-primary mt-4">Continue<Icon name="arrow_forward" size={18} /></button>
              </div>
            )}
          </>
        )}

        {/* About you (everyone) */}
        {((isOwner && step === 1) || (!isOwner && step === 2)) && (
          <form className="flex flex-col gap-5" onSubmit={e => {
            e.preventDefault()
            if (!validatePerson()) return
            if (isOwner) { setStep(2); setErrors({}) } else submit()
          }}>
            <Field label="Full name" error={errors.full_name}><input className="field" value={person.full_name} onChange={setP('full_name')} autoComplete="name" autoFocus /></Field>
            <Field label="Job title" error={errors.job_title}>
              <input className="field" value={person.job_title} onChange={setP('job_title')} placeholder={isOwner ? 'e.g. Founder & CEO' : path === 'manager' ? 'e.g. Engineering Manager' : 'e.g. Frontend Developer'} autoComplete="organization-title" />
            </Field>
            {!isOwner && (
              <Field label="Department" optional>
                <select className="field" value={DEPARTMENTS.includes(person.department) || !person.department ? person.department : '__other'}
                        onChange={e => setPerson({ ...person, department: e.target.value === '__other' ? ' ' : e.target.value })}>
                  <option value="">Choose a department…</option>
                  {DEPARTMENTS.map(d => <option key={d}>{d}</option>)}
                  <option value="__other">Other…</option>
                </select>
                {person.department && !DEPARTMENTS.includes(person.department) && (
                  <input className="field mt-2" value={person.department.trimStart()} onChange={setP('department')} placeholder="Type your department" autoFocus />
                )}
              </Field>
            )}
            <Field label="Phone" optional error={errors.phone} hint="Only visible to your company’s owners and managers.">
              <input className="field" type="tel" value={person.phone} onChange={setP('phone')} placeholder="+91 98765 43210" autoComplete="tel" />
            </Field>
            <ErrorNote>{error}</ErrorNote>
            <button type="submit" disabled={busy} className="btn btn-primary">
              {isOwner ? <>Continue<Icon name="arrow_forward" size={18} /></> : busy ? 'Joining…' : `Join ${preview?.companyName || 'company'}`}
            </button>
          </form>
        )}

        {/* Company details (owner) */}
        {isOwner && step === 2 && (
          <form className="flex flex-col gap-5" onSubmit={e => { e.preventDefault(); if (validateCompany()) { setStep(3); setErrors({}) } }}>
            <Field label="Company name" error={errors.name}><input className="field" value={company.name} onChange={setC('name')} placeholder="e.g. Acme Labs" autoComplete="organization" autoFocus /></Field>
            <div className="grid sm:grid-cols-2 gap-5">
              <Field label="Industry" error={errors.industry}>
                <select className="field" value={company.industry} onChange={setC('industry')}>
                  <option value="">Choose…</option>
                  {INDUSTRIES.map(i => <option key={i}>{i}</option>)}
                </select>
              </Field>
              <Field label="Country" error={errors.country}>
                <input className="field" list="onboarding-countries" value={company.country} onChange={setC('country')} placeholder="e.g. India" autoComplete="country-name" />
                <datalist id="onboarding-countries">{COUNTRIES.map(c => <option key={c} value={c} />)}</datalist>
              </Field>
            </div>
            <Field label="Company size" error={errors.size}>
              <div className="flex flex-wrap gap-2">
                {SIZES.map(sz => (
                  <button type="button" key={sz} onClick={() => setCompany({ ...company, size: sz })}
                          className={`btn btn-sm ${company.size === sz ? 'btn-primary' : 'btn-outline'}`}>{sz} people</button>
                ))}
              </div>
            </Field>
            <Field label="Website" optional error={errors.website}><input className="field" value={company.website} onChange={setC('website')} placeholder="acme.io" autoComplete="url" /></Field>
            <button type="submit" className="btn btn-primary">Review<Icon name="arrow_forward" size={18} /></button>
          </form>
        )}

        {/* Review (owner) */}
        {isOwner && step === 3 && (
          <>
            {[
              { title: 'You', edit: 1, rows: [['Name', person.full_name], ['Job title', person.job_title], ['Email', email], ['Phone', person.phone || '—'], ['Role', 'Owner']] },
              { title: 'Company', edit: 2, rows: [['Name', company.name], ['Industry', company.industry], ['Size', `${company.size} people`], ['Country', company.country], ['Website', company.website || '—']] },
            ].map(section => (
              <div key={section.title} className="tile p-5">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-label-lg text-ink">{section.title}</p>
                  <button onClick={() => setStep(section.edit)} className="btn btn-ghost btn-sm"><Icon name="edit" size={15} />Edit</button>
                </div>
                <dl className="grid grid-cols-[110px_1fr] gap-y-2 text-body-md">
                  {section.rows.map(([k, v]) => <Fragment key={k}><dt className="text-ink-2">{k}</dt><dd className="text-ink break-words">{v}</dd></Fragment>)}
                </dl>
              </div>
            ))}
            <ErrorNote>{error}</ErrorNote>
            <button onClick={submit} disabled={busy} className="btn btn-primary">{busy ? 'Registering…' : <>Register {company.name}<Icon name="check" size={18} /></>}</button>
          </>
        )}
      </div>
    </div>
  )
}
