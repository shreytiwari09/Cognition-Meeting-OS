import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon, SectionHeader } from '../components/ui'
import { API_URL, connectExtension, disconnectExtension, getExtensionStatus } from '../api'
import { useAuth } from '../contexts/AuthContext'
import ChromeExtensionsLink from '../components/ChromeExtensionsLink'

const EXTENSION_ZIP_URL = import.meta.env.VITE_EXTENSION_ZIP_URL || '/meetingos-extension.zip'

// Talks to the extension's bridge script through window.postMessage (same origin only)
function post(type, extra = {}) {
  window.postMessage({ type, ...extra }, window.location.origin)
}

function waitFor(type, ms) {
  return new Promise(resolve => {
    const onMessage = e => {
      if (e.source === window && e.origin === window.location.origin && e.data?.type === type) {
        window.removeEventListener('message', onMessage); clearTimeout(timer); resolve(e.data)
      }
    }
    const timer = setTimeout(() => { window.removeEventListener('message', onMessage); resolve(null) }, ms)
    window.addEventListener('message', onMessage)
  })
}

export default function ConnectExtension() {
  const { userProfile } = useAuth()
  const navigate = useNavigate()
  const [installed, setInstalled] = useState(null)        // null = checking
  const [extensionConnected, setExtensionConnected] = useState(false)
  const [serverStatus, setServerStatus] = useState(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  async function check() {
    const ping = waitFor('MEETINGOS_EXTENSION_PRESENT', 1500)
    post('MEETINGOS_PING')
    const res = await ping
    setInstalled(!!res)
    setExtensionConnected(!!res?.connected)
    getExtensionStatus().then(r => setServerStatus(r.data)).catch(() => {})
  }

  useEffect(() => { check() }, [])

  async function handleConnect() {
    setBusy(true); setMessage('')
    try {
      const { data } = await connectExtension()
      const ack = waitFor('MEETINGOS_CONNECTED', 3000)
      post('MEETINGOS_CONNECT', { ...data, apiUrl: API_URL })
      if (await ack) setMessage('connected')
      else setMessage('The extension did not respond. Reload this page and try again.')
      await check()
    } catch (err) {
      setMessage(err.response?.data?.detail || 'Could not connect. Try again.')
    } finally {
      setBusy(false)
    }
  }

  async function handleDisconnect() {
    setBusy(true)
    await disconnectExtension().catch(() => {})
    post('MEETINGOS_DISCONNECT')
    await waitFor('MEETINGOS_DISCONNECTED', 1500)
    setMessage('')
    await check()
    setBusy(false)
  }

  const isStaff = userProfile?.role === 'pm' || userProfile?.role === 'manager'
  const step = !installed ? 1 : extensionConnected ? 3 : 2

  return (
    <div>
      <SectionHeader
        eyebrow={<><Icon name="extension" size={15} />Chrome extension</>}
        title="Capture Google Meet automatically"
        subtitle="Once connected, the extension turns captions on when you join a Google Meet, captures who said what, and sends the meeting to your AI agents when you leave. No buttons to press."
      />

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <div className="xl:col-span-8 flex flex-col gap-6">
          {isStaff && installed !== null && (
            <div className="bento p-5 flex items-center gap-2 overflow-x-auto no-scrollbar">
              {['Install', 'Connect', 'Ready'].map((label, i) => (
                <div key={label} className="flex items-center gap-2 shrink-0">
                  <span className={`w-8 h-8 rounded-full flex items-center justify-center text-label-md ${
                    step > i + 1 ? 'bg-forest text-white' : step === i + 1 ? 'bg-coral text-white' : 'bg-surface-container text-ink-3'}`}>
                    {step > i + 1 ? <Icon name="check" size={16} /> : i + 1}
                  </span>
                  <span className={`text-label-lg ${step === i + 1 ? 'text-ink' : 'text-ink-2'}`}>{label}</span>
                  {i < 2 && <span className="w-10 h-px bg-surface-container-high mx-1" />}
                </div>
              ))}
            </div>
          )}

          {!isStaff ? (
            <div className="bento p-8"><p className="text-body-md text-ink-2">Only owners and managers send meetings to MeetingOS. Your tasks appear on your dashboard automatically.</p></div>
          ) : installed === null ? (
            <div className="bento p-8 flex items-center gap-3 text-body-md text-ink-2"><Icon name="progress_activity" className="anim-spin text-coral" />Looking for the extension…</div>
          ) : !installed ? (
            <div className="bento p-6 sm:p-8">
              <p className="text-headline-sm text-ink mb-1">Install the extension</p>
              <p className="text-body-sm text-ink-2 mb-5">Works in Chrome and Chromium browsers (Edge, Brave, Arc).</p>
              <ol className="flex flex-col gap-3 mb-6">
                {[
                  <>Download and unzip the extension.</>,
                  <>Open <ChromeExtensionsLink /> in a new tab and turn on <b>Developer mode</b> (top right).</>,
                  <>Click <b>Load unpacked</b>, pick the unzipped folder, then pin it from the puzzle icon.</>,
                  <>Come back here and reload this page.</>,
                ].map((text, i) => (
                  <li key={i} className="flex gap-3 items-start">
                    <span className="w-7 h-7 rounded-full bg-coral-wash text-coral-deep text-label-md flex items-center justify-center shrink-0">{i + 1}</span>
                    <span className="text-body-md text-ink pt-0.5">{text}</span>
                  </li>
                ))}
              </ol>
              <div className="flex flex-wrap gap-2.5">
                <a href={EXTENSION_ZIP_URL} download className="btn btn-primary"><Icon name="download" size={18} />Download extension</a>
                <button onClick={() => window.location.reload()} className="btn btn-secondary"><Icon name="refresh" size={18} />I installed it, reload</button>
              </div>
            </div>
          ) : extensionConnected ? (
            <div className="bento p-6 sm:p-8">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-2xl bg-forest-soft text-forest flex items-center justify-center shrink-0"><Icon name="verified" fill /></div>
                <div>
                  <p className="text-headline-sm text-ink">Connected as {userProfile?.name}</p>
                  <p className="text-body-md text-ink-2 mt-1">Join any Google Meet to try it: a small “MeetingOS · Recording” pill appears in the corner of the call.</p>
                  {serverStatus?.lastUsedAt && <p className="text-body-sm text-ink-3 mt-1">Last used {new Date(serverStatus.lastUsedAt).toLocaleString()}</p>}
                </div>
              </div>
              <div className="flex flex-wrap gap-2.5 mt-6">
                <button onClick={() => navigate('/pm')} className="btn btn-primary">Go to meetings</button>
                <button onClick={handleDisconnect} disabled={busy} className="btn btn-secondary">Disconnect</button>
              </div>
            </div>
          ) : (
            <div className="bento p-6 sm:p-8">
              <p className="text-headline-sm text-ink mb-1">Connect it to your account</p>
              <p className="text-body-md text-ink-2 mb-6">This gives the extension its own key that can only upload meetings for you. You can disconnect it any time.</p>
              <button onClick={handleConnect} disabled={busy} className="btn btn-primary">
                <Icon name={busy ? 'progress_activity' : 'link'} size={18} className={busy ? 'anim-spin' : ''} />{busy ? 'Connecting…' : 'Connect extension'}
              </button>
              {message && message !== 'connected' && <p className="text-body-sm text-overdue mt-3">{message}</p>}
            </div>
          )}
        </div>

        <div className="xl:col-span-4 flex flex-col gap-6">
          <div className="rounded-bento bg-panel text-white p-6">
            <p className="eyebrow text-coral mb-3">During a meeting</p>
            <div className="flex flex-col gap-3">
              {[
                ['login', 'Join a Google Meet as usual.'],
                ['closed_caption', 'Captions turn on and capture starts, with speaker names.'],
                ['logout', 'Leave the call: it’s sent to the AI agents and you get a notification.'],
              ].map(([icon, text]) => (
                <div key={icon} className="flex gap-3 items-start">
                  <span className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center shrink-0"><Icon name={icon} size={17} /></span>
                  <span className="text-body-sm text-[#e4e1e6] pt-1.5">{text}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="bento p-6">
            <p className="text-headline-sm text-ink mb-3">Good to know</p>
            <ul className="flex flex-col gap-2.5">
              {[
                'It reads Meet’s captions, so captions must be allowed in the meeting.',
                'Everyone in the call can see captions are on. Let participants know the meeting is transcribed.',
                'Works best with Meet in English. Auto-record and auto-send can be changed in the popup.',
                'Closed the tab before it sent? Recent captures can be sent from the extension popup.',
              ].map(t => <li key={t} className="flex gap-2.5 text-body-sm text-ink-2"><span className="w-1.5 h-1.5 rounded-full bg-coral mt-1.5 shrink-0" />{t}</li>)}
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
