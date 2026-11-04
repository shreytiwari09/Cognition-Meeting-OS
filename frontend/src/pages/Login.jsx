import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendEmailVerification,
  signInWithPopup,
  GoogleAuthProvider,
  getAdditionalUserInfo,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth'
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore'
import { auth, firestore } from '../firebase'
import { useAuth } from '../contexts/AuthContext'
import { Icon, Logo, Segmented } from '../components/ui'
import { useDocumentTitle } from '../lib/pageMeta'
import Onboarding from '../components/Onboarding'

const ROLE_ROUTES = { pm: '/pm', manager: '/pm', employee: '/employee' }

function friendlyError(code) {
  switch (code) {
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':  return 'Invalid email or password.'
    case 'auth/email-already-in-use': return 'Email already registered. Sign in instead.'
    case 'auth/weak-password':        return 'Password must be at least 6 characters.'
    case 'auth/invalid-email':        return 'Invalid email address.'
    case 'auth/too-many-requests':    return 'Too many attempts. Try again later.'
    default:                          return 'Something went wrong. Try again.'
  }
}

// Two-column auth layout: the form on the left, what MeetingOS does on the right
function AuthLayout({ children }) {
  useDocumentTitle('Sign in')
  return (
    <div className="min-h-screen bg-canvas grid lg:grid-cols-2">
      <div className="flex flex-col px-6 sm:px-12 py-8">
        <a href="/" className="self-start"><Logo /></a>
        <div className="flex-1 flex items-center justify-center py-10">
          <div className="w-full max-w-md">{children}</div>
        </div>
        <p className="text-[12px] text-ink-3">© Cognition MeetingOS</p>
      </div>
      <div className="hidden lg:flex p-4">
        <div className="flex-1 rounded-[36px] bg-panel text-white p-12 flex flex-col justify-between relative overflow-hidden">
          <div className="absolute -top-24 -right-24 w-80 h-80 rounded-full bg-coral/30 blur-3xl" />
          <div className="relative">
            <p className="eyebrow text-coral mb-4">AI meeting intelligence</p>
            <h2 className="text-headline-xl leading-tight">Turn meetings into<br />accountable execution.</h2>
            <p className="text-body-lg text-ink-3 mt-4 max-w-md">Seven AI agents read every meeting and turn what people committed to into tasks, with the exact words they came from.</p>
          </div>
          <div className="relative grid gap-3">
            {[
              ['mic', 'Capture', 'Join a Google Meet with the extension, or paste a transcript.'],
              ['hub', '7 agents review it', 'Tasks, owners, deadlines, decisions and risks, audited for contradictions.'],
              ['insights', 'Track delivery', 'See who is on track and who needs a nudge, meeting after meeting.'],
            ].map(([icon, title, text]) => (
              <div key={title} className="flex gap-4 items-start rounded-card bg-white/6 p-4">
                <div className="w-10 h-10 rounded-full bg-coral flex items-center justify-center shrink-0"><Icon name={icon} size={20} /></div>
                <div><p className="text-label-lg">{title}</p><p className="text-body-sm text-ink-3">{text}</p></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function ErrorBox({ show, children }) {
  if (!show) return null
  return <div className="rounded-2xl bg-overdue-bg text-overdue px-4 py-3 text-body-sm flex gap-2"><Icon name="error" size={18} className="shrink-0" /><div>{children}</div></div>
}

// ─── Verify Email Screen ──────────────────────────────────────────────────────
function VerifyEmailScreen({ email, onBack }) {
  return (
    <AuthLayout>
      <div className="bento p-8 text-center">
        <div className="w-16 h-16 rounded-2xl bg-coral-wash text-coral flex items-center justify-center mx-auto mb-5"><Icon name="mark_email_unread" size={32} /></div>
        <h1 className="text-headline-md text-ink">Verify your email</h1>
        <p className="text-body-md text-ink-2 mt-2">We sent a verification link to</p>
        <p className="text-label-lg text-coral-deep mt-1">{email}</p>
        <p className="text-body-sm text-ink-2 mt-4">Click the link to activate your account, then come back and sign in. Check your spam folder if you don’t see it.</p>
        <button onClick={onBack} className="btn btn-primary w-full mt-6">Back to sign in</button>
      </div>
    </AuthLayout>
  )
}

// ─── Main Login ───────────────────────────────────────────────────────────────
export default function Login() {
  const navigate = useNavigate()
  const { refreshProfile } = useAuth()

  const [mode,        setMode]        = useState('signin')
  const [email,       setEmail]       = useState('')
  const [password,    setPassword]    = useState('')
  const [confirmPass, setConfirmPass] = useState('')
  const [name,        setName]        = useState('')
  const [error,       setError]       = useState('')
  const [info,        setInfo]        = useState('')
  const [loading,     setLoading]     = useState(false)

  const [verifyEmail,     setVerifyEmail]     = useState('')
  // The bare profile of someone who must onboard (dev preview mode can open the wizard directly)
  const [needsCompany,    setNeedsCompany]    = useState(() =>
    import.meta.env.DEV && localStorage.getItem('meetingos_mock') === 'onboarding' ? { name: 'Nina Newton', email: 'nina@globex.io' } : null)

  function redirectOrSetupCompany(profile) {
    if (!profile.companyId || !ROLE_ROUTES[profile.role]) {
      setNeedsCompany(profile)
    } else {
      navigate(ROLE_ROUTES[profile.role], { replace: true })
    }
  }

  // Redirect already-authenticated users
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) return
      const snap = await getDoc(doc(firestore, 'users', u.uid))
      if (snap.exists()) redirectOrSetupCompany(snap.data())
    })
    return () => unsub()
  }, [])

  // ── Email Sign Up ────────────────────────────────────────────────────────────
  async function handleSignUp(e) {
    e.preventDefault()
    setError('')
    if (!name.trim())             return setError('Please enter your full name.')
    if (password !== confirmPass) return setError('Passwords do not match.')
    if (password.length < 6)      return setError('Password must be at least 6 characters.')
    setLoading(true)
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password)
      await sendEmailVerification(cred.user)
      await setDoc(doc(firestore, 'users', cred.user.uid), { name: name.trim(), email, createdAt: serverTimestamp() })
      await signOut(auth)
      setVerifyEmail(email)
    } catch (err) {
      setError(friendlyError(err.code))
    } finally {
      setLoading(false)
    }
  }

  // ── Email Sign In ────────────────────────────────────────────────────────────
  async function handleSignIn(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password)
      if (!cred.user.emailVerified) {
        await signOut(auth)
        setError('Email not verified. Check your inbox and click the verification link.')
        return
      }
      const snap = await getDoc(doc(firestore, 'users', cred.user.uid))
      if (!snap.exists()) {
        await signOut(auth)
        setError('Account not found. Please sign up again.')
        return
      }
      redirectOrSetupCompany(await refreshProfile())
    } catch (err) {
      setError(friendlyError(err.code))
    } finally {
      setLoading(false)
    }
  }

  // ── Google ───────────────────────────────────────────────────────────────────
  // Firebase's Google login always creates an account if there isn't one. On the Sign in tab we undo that
  // (delete the account Firebase just made) and point the person to Sign up instead.
  async function handleGoogle() {
    setError('')
    setInfo('')
    setLoading(true)
    try {
      const cred = await signInWithPopup(auth, new GoogleAuthProvider())
      const isNew = getAdditionalUserInfo(cred)?.isNewUser
      if (isNew && mode === 'signin') {
        const who = cred.user.email
        await cred.user.delete().catch(() => signOut(auth))
        setError(`no-account:${who}`)
        return
      }
      if (!isNew && mode === 'signup') setInfo('You already have an account, so we signed you in.')
      const snap = await getDoc(doc(firestore, 'users', cred.user.uid))
      if (!snap.exists()) {
        // First Google sign-in: create a bare profile; role comes from creating/joining a company
        await setDoc(doc(firestore, 'users', cred.user.uid), {
          name:  cred.user.displayName || cred.user.email.split('@')[0],
          email: cred.user.email,
          createdAt: serverTimestamp(),
        })
      }
      redirectOrSetupCompany(await refreshProfile())
    } catch (err) {
      if (err.code !== 'auth/popup-closed-by-user') setError(friendlyError(err.code))
    } finally {
      setLoading(false)
    }
  }

  async function resendVerification() {
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password)
      await sendEmailVerification(cred.user)
      await signOut(auth)
      setError('')
      setVerifyEmail(email)
    } catch { setError('Could not resend. Check your credentials.') }
  }

  // ── Sub-screens ──────────────────────────────────────────────────────────────
  if (verifyEmail) {
    return (
      <VerifyEmailScreen
        email={verifyEmail}
        onBack={() => { setVerifyEmail(''); setMode('signin'); setPassword(''); setConfirmPass('') }}
      />
    )
  }

  if (needsCompany) {
    return (
      <Onboarding
        defaultName={needsCompany.name || auth.currentUser?.displayName || ''}
        email={needsCompany.email || auth.currentUser?.email || ''}
        onDone={async () => {
          const profile = await refreshProfile()
          navigate(ROLE_ROUTES[profile?.role] || '/login', { replace: true })
        }}
      />
    )
  }

  const signup = mode === 'signup'
  const mismatch = confirmPass && password !== confirmPass

  return (
    <AuthLayout>
      <h1 className="text-headline-lg text-ink">{signup ? 'Create your account' : 'Welcome back'}</h1>
      <p className="text-body-md text-ink-2 mt-2 mb-6">{signup ? 'Then register your company or join one with an invite code.' : 'Sign in to see your meetings and tasks.'}</p>

      <div className="bento p-6 sm:p-8">
        <Segmented value={mode} onChange={m => { setMode(m); setError('') }} className="w-full mb-6 [&>button]:flex-1"
                   options={[{ value: 'signin', label: 'Sign in' }, { value: 'signup', label: 'Sign up' }]} />

        <form onSubmit={signup ? handleSignUp : handleSignIn} className="flex flex-col gap-4">
          {signup && (
            <label className="flex flex-col gap-1.5">
              <span className="eyebrow text-ink-2">Full name</span>
              <input className="field" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Priya Sharma" autoComplete="name" required />
            </label>
          )}
          <label className="flex flex-col gap-1.5">
            <span className="eyebrow text-ink-2">Email</span>
            <input className="field" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" autoComplete="email" required />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="eyebrow text-ink-2">Password</span>
            <input className="field" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 6 characters"
                   autoComplete={signup ? 'new-password' : 'current-password'} required />
          </label>
          {signup && (
            <label className="flex flex-col gap-1.5">
              <span className="eyebrow text-ink-2">Confirm password</span>
              <input className={`field ${mismatch ? 'border-overdue!' : confirmPass ? 'border-forest!' : ''}`} type="password" value={confirmPass}
                     onChange={e => setConfirmPass(e.target.value)} placeholder="Re-enter your password" autoComplete="new-password" required />
              {mismatch && <span className="text-[12px] text-overdue px-2">Passwords do not match</span>}
            </label>
          )}

          {info && <div className="rounded-2xl bg-forest-soft text-forest px-4 py-3 text-body-sm">{info}</div>}
          <ErrorBox show={!!error}>
            {error.startsWith('no-account:') ? (
              <>
                There’s no MeetingOS account for <b>{error.slice(11)}</b> yet.
                <button type="button" onClick={() => { setMode('signup'); setError('') }} className="block mt-1.5 font-semibold underline">Sign up with Google instead</button>
              </>
            ) : error}
            {error.includes('not verified') && (
              <button type="button" onClick={resendVerification} className="block mt-1.5 font-semibold underline">Resend verification email</button>
            )}
          </ErrorBox>

          <button type="submit" disabled={loading} className="btn btn-primary w-full">
            {loading ? 'Please wait…' : signup ? 'Create account' : 'Sign in'}
          </button>
        </form>

        <div className="flex items-center gap-3 my-5">
          <div className="flex-1 h-px bg-surface-container-high" /><span className="text-[12px] text-ink-3">or</span><div className="flex-1 h-px bg-surface-container-high" />
        </div>

        <button onClick={handleGoogle} disabled={loading} className="btn btn-outline w-full">
          <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          {signup ? 'Sign up with Google' : 'Sign in with Google'}
        </button>
      </div>
    </AuthLayout>
  )
}
