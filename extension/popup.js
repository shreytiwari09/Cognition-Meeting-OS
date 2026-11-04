// Where the web app lives before the extension is connected (afterwards the connection remembers it)
const DEFAULT_APP_URL = 'http://localhost:5174'
const DEFAULT_SETTINGS = { autoRecord: true, autoCaptions: true, autoSend: true }
const { meetingTitle, parsePastedTranscript } = globalThis.MeetingOSCaptions

const el = id => document.getElementById(id)
const show = (id, on = true) => el(id).classList.toggle('hidden', !on)

let connection = null
let meetTab = null

async function sendToTab(message) {
  if (!meetTab) return null
  try { return await chrome.tabs.sendMessage(meetTab.id, message) } catch { return null }
}

async function render() {
  const data = await chrome.storage.local.get(null)
  connection = data.connection || null
  const connected = !!connection?.token && !connection.needsReconnect

  el('who').textContent = connected ? `${connection.name}${connection.companyName ? ' · ' + connection.companyName : ''}` : 'Not connected'
  show('btnDisconnect', connected)
  show('connectView', !connected)
  show('mainView', connected)
  el('connectTitle').textContent = connection?.needsReconnect ? 'Please reconnect your account' : 'Connect your account'
  if (!connected) return

  const settings = { ...DEFAULT_SETTINGS, ...data.settings }
  for (const key of Object.keys(DEFAULT_SETTINGS)) el(key).checked = settings[key]

  await renderMeet()
  renderRecent(data)
}

async function renderMeet() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  meetTab = tab?.url?.startsWith('https://meet.google.com/') ? tab : null
  const st = meetTab ? await sendToTab({ type: 'GET_STATE' }) : null

  for (const id of ['btnStart', 'btnStop', 'btnSend', 'btnOpen', 'captureDetails', 'captionsWarn', 'errorText', 'audioBox']) show(id, false)
  const dot = el('dot')
  dot.className = 'dot'

  if (!meetTab) {
    el('statusText').textContent = 'Not in a Google Meet tab'
    el('statusHint').textContent = 'Join a Google Meet call and recording starts automatically. You can keep this popup closed.'
    return
  }
  if (!st) {
    dot.classList.add('warn')
    el('statusText').textContent = 'Reload this Meet tab'
    el('statusHint').textContent = 'The extension was installed or updated after this tab opened.'
    return
  }

  const c = st.capture
  if (st.recording) {
    dot.classList.add('rec')
    el('statusText').textContent = `Recording · ${c?.lines || 0} lines`
    el('statusHint').textContent = 'Leave the call when you’re done. It will be sent automatically if that setting is on.'
    show('captionsWarn', !st.captionsOn)
    show('btnStop')
  } else if (c?.status === 'sent') {
    dot.classList.add('ok')
    el('statusText').textContent = 'Sent: agents are processing it'
    el('statusHint').textContent = 'Tasks, decisions and minutes will appear in MeetingOS in a couple of minutes.'
    show('btnOpen', !!c.meetingUrl)
  } else if (c?.lines) {
    dot.classList.add('purple')
    el('statusText').textContent = c.status === 'sending' ? 'Sending…' : `Captured ${c.lines} lines`
    el('statusHint').textContent = st.inCall ? 'Recording is paused.' : 'Review the title, then send it.'
    show('btnSend', c.status !== 'sending')
    show('btnStart', st.inCall)
  } else {
    el('statusText').textContent = st.inCall ? 'In a call, not recording' : 'Waiting for you to join the call'
    el('statusHint').textContent = st.inCall ? 'Press Start to capture this meeting.' : 'Recording starts as soon as you join.'
    show('btnStart', st.inCall)
  }

  await renderAudio(st, c)

  if (c?.error) { el('errorText').textContent = c.error; show('errorText') }
  if (c) {
    show('captureDetails')
    if (document.activeElement !== el('title')) el('title').value = c.title
    el('speakers').innerHTML = ''
    for (const name of c.speakers) {
      const chip = document.createElement('span'); chip.className = 'chip'; chip.textContent = name; el('speakers').appendChild(chip)
    }
    el('preview').textContent = c.preview.map(l => `${l.speaker}: ${l.text}`).join('\n')
    show('preview', c.preview.length > 0)
  }
}

// Call audio: Chrome only lets an extension record a tab after you click the extension, hence the button here
async function renderAudio(st, c) {
  show('audioBox', st.inCall || st.recording)
  if (!(st.inCall || st.recording)) return
  const id = c ? `audio:${c.key}` : null
  const { [id]: audio } = id ? await chrome.storage.local.get(id) : {}
  const active = !!audio?.active && st.recording
  const minutes = Math.round((audio?.chunks || []).filter(x => x.ok).reduce((sum, x) => sum + (x.end - x.start), 0) / 60000)
  el('audioOn').textContent = `● Audio transcription on${minutes ? ` · ${minutes} min transcribed` : ''}`
  show('audioOn', active)
  show('btnAudio', !active)
  show('audioHint', !active)
  if (audio?.error) { el('audioError').textContent = `${audio.error} Captions are used for that part.`; show('audioError') }
  else if (el('audioError').dataset.local !== '1') show('audioError', false)
}

async function startAudio() {
  const button = el('btnAudio')
  button.disabled = true
  el('audioError').dataset.local = ''
  try {
    let st = await sendToTab({ type: 'GET_STATE' })
    if (!st?.recording) { await sendToTab({ type: 'START' }); st = await sendToTab({ type: 'GET_STATE' }) }
    if (!st?.capture?.key) throw new Error('Could not start recording in this tab. Reload it and try again.')
    const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: meetTab.id })
    const res = await chrome.runtime.sendMessage({ type: 'AUDIO_START', key: st.capture.key, streamId, title: st.capture.title })
    if (!res?.ok) throw new Error(res?.error || 'Could not record the call audio')
  } catch (e) {
    el('audioError').textContent = e.message
    el('audioError').dataset.local = '1'
    show('audioError')
  }
  button.disabled = false
  renderMeet()
}

function renderRecent(data) {
  const captures = Object.entries(data).filter(([k]) => k.startsWith('capture:')).map(([, v]) => v)
    .filter(c => c.lines?.length).sort((a, b) => b.startedAt - a.startedAt).slice(0, 5)
  show('recentWrap', captures.length > 0)
  const list = el('recent')
  list.innerHTML = ''
  for (const c of captures) {
    const row = document.createElement('div'); row.className = 'capture'
    const title = document.createElement('span'); title.className = 't'
    title.textContent = `${c.title} · ${c.lines.length} lines`
    const action = document.createElement('button')
    if (c.status === 'sent') { action.textContent = 'Open'; action.onclick = () => chrome.tabs.create({ url: c.meetingUrl }) }
    else if (c.status === 'recording') { action.textContent = 'Live'; action.disabled = true }
    else { action.textContent = 'Send'; action.onclick = () => sendStored(c.key, action) }
    row.append(title, action)
    list.appendChild(row)
  }
}

// Send a capture straight from storage (e.g. the Meet tab was closed before it was sent)
async function sendStored(key, button) {
  button.disabled = true; button.textContent = '…'
  const res = await chrome.runtime.sendMessage({ type: 'UPLOAD', key })
  const { [key]: capture } = await chrome.storage.local.get(key)
  if (capture) {
    Object.assign(capture, res.ok ? { status: 'sent', meetingId: res.meetingId, meetingUrl: res.url, error: null } : { status: 'ready', error: res.error })
    await chrome.storage.local.set({ [key]: capture })
  }
  render()
}

// ── Actions ─────────────────────────────────────────────────────────────────

el('btnConnect').onclick = () => chrome.tabs.create({ url: `${connection?.appUrl || DEFAULT_APP_URL}/connect-extension` })
el('btnDisconnect').onclick = async () => {
  if (!confirm('Disconnect this extension from your account?')) return
  fetch(`${connection.apiUrl}/extension/me`, { method: 'DELETE', headers: { Authorization: `Bearer ${connection.token}` } }).catch(() => {})
  await chrome.storage.local.remove('connection')
  render()
}
el('btnStart').onclick = async () => { await sendToTab({ type: 'START' }); renderMeet() }
el('btnStop').onclick = async () => { await sendToTab({ type: 'STOP' }); renderMeet() }
el('btnAudio').onclick = startAudio
el('btnSend').onclick = async () => {
  el('btnSend').disabled = true
  await sendToTab({ type: 'SET_TITLE', title: el('title').value.trim() || 'Google Meet' })
  await sendToTab({ type: 'SEND' })
  el('btnSend').disabled = false
  render()
}
el('btnOpen').onclick = async () => {
  const st = await sendToTab({ type: 'GET_STATE' })
  if (st?.capture?.meetingUrl) chrome.tabs.create({ url: st.capture.meetingUrl })
}
el('title').onchange = () => sendToTab({ type: 'SET_TITLE', title: el('title').value.trim() || 'Google Meet' })

for (const key of Object.keys(DEFAULT_SETTINGS)) {
  el(key).onchange = async () => {
    const { settings } = await chrome.storage.local.get('settings')
    await chrome.storage.local.set({ settings: { ...DEFAULT_SETTINGS, ...settings, [key]: el(key).checked } })
  }
}

el('btnPaste').onclick = async () => {
  const lines = parsePastedTranscript(el('pasteText').value).map(l => ({ ...l, at: Date.now() }))
  if (!lines.length) return
  const startedAt = Date.now()
  const key = `capture:pasted:${startedAt}`
  await chrome.storage.local.set({ [key]: {
    key, code: 'pasted', startedAt, status: 'ready', lines,
    title: el('pasteTitle').value.trim() || meetingTitle('', 'pasted'),
    speakers: [...new Set(lines.map(l => l.speaker))].filter(s => s !== 'Participant'),
  } })
  el('pasteText').value = ''; el('pasteTitle').value = ''
  await sendStored(key, el('btnPaste'))
  el('btnPaste').disabled = false; el('btnPaste').textContent = 'Send pasted transcript'
}

chrome.storage.onChanged.addListener(() => render())
render()
setInterval(renderMeet, 2000)
