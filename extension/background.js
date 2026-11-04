// Background service worker: uploads captures, runs call-audio recording (through the offscreen page),
// keeps the toolbar badge in sync, shows notifications.
importScripts('captions.js')
const { toTranscript, mergeAudioWithCaptions } = globalThis.MeetingOSCaptions

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg.type === 'STATE' && sender.tab) {
    const tabId = sender.tab.id
    chrome.action.setBadgeText({ tabId, text: msg.recording ? 'REC' : '' })
    chrome.action.setBadgeBackgroundColor({ tabId, color: '#dc2626' })
  } else if (msg.type === 'UPLOAD') {
    upload(msg.key).then(reply)
    return true
  } else if (msg.type === 'AUDIO_START') {
    startAudio(msg).then(reply)
    return true
  } else if (msg.type === 'AUDIO_STOP') {
    stopAudio(msg.key).then(() => reply({ ok: true }))
    return true
  } else if (msg.type === 'AUDIO_CHUNK') {
    saveAudio(msg.key, a => {
      a.chunks.push(msg.chunk)
      a.error = msg.error || (msg.chunk.ok ? null : a.error)
    })
  } else if (msg.type === 'AUDIO_STOPPED') {
    saveAudio(msg.key, a => { a.active = false })
  }
})

// ── Call audio ──────────────────────────────────────────────────────────────
// Stored as `audio:<capture key>` = { active, startedAt, chunks: [{ start, end, ok, segments }], error }

let writes = Promise.resolve()
function saveAudio(key, change) {
  writes = writes.then(async () => {
    const id = `audio:${key}`
    const { [id]: audio } = await chrome.storage.local.get(id)
    const next = audio || { active: false, chunks: [], error: null }
    change(next)
    await chrome.storage.local.set({ [id]: next })
  })
  return writes
}

async function startAudio({ key, streamId, title }) {
  const { connection } = await chrome.storage.local.get('connection')
  if (!connection?.token) return { ok: false, error: 'Connect the extension to your account first' }
  if (!(await chrome.offscreen.hasDocument())) {
    await chrome.offscreen.createDocument({
      url: 'offscreen.html', reasons: ['USER_MEDIA'],
      justification: 'Record the Google Meet call audio for an accurate transcript',
    })
  }
  const res = await chrome.runtime.sendMessage({
    target: 'offscreen', type: 'START', streamId, key, title, apiUrl: connection.apiUrl, token: connection.token,
  }).catch(e => ({ ok: false, error: e.message }))
  await saveAudio(key, a => Object.assign(a, res?.ok ? { active: true, startedAt: Date.now(), error: null } : { error: res?.error || 'Could not record audio' }))
  return res || { ok: false, error: 'Could not record audio' }
}

// Stops recording and waits until the last chunks are transcribed. The call ending and the upload both ask
// for this, so they share one stop instead of the second returning before the last chunk is in.
const stopping = new Map()
function stopAudio(key) {
  if (!stopping.has(key)) {
    stopping.set(key, (async () => {
      const id = `audio:${key}`
      const { [id]: audio } = await chrome.storage.local.get(id)
      if (!audio?.active) return
      if (await chrome.offscreen.hasDocument()) {
        await chrome.runtime.sendMessage({ target: 'offscreen', type: 'STOP' }).catch(() => {})
      }
      await saveAudio(key, a => { a.active = false })
    })().finally(() => stopping.delete(key)))
  }
  return stopping.get(key)
}

async function upload(key) {
  await stopAudio(key)
  const audioKey = `audio:${key}`
  const { connection, [key]: capture, [audioKey]: audio } = await chrome.storage.local.get(['connection', key, audioKey])
  if (!connection?.token) return { ok: false, error: 'Connect the extension to your account first' }
  const usableAudio = audio?.chunks?.some(c => c.ok && c.segments?.length)
  if (!capture || (!capture.lines?.length && !usableAudio)) return { ok: false, error: 'Nothing was captured' }

  const lines = usableAudio ? mergeAudioWithCaptions(capture.lines || [], audio.chunks, capture.selfName) : capture.lines
  const participants = [...new Set([...(capture.speakers || []), ...lines.map(l => l.speaker)])]
    .filter(n => n !== 'Participant').map(name => ({ name }))
  try {
    const res = await fetch(`${connection.apiUrl}/extension/meetings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${connection.token}` },
      body: JSON.stringify({
        title: capture.title, participants, transcript: toTranscript(lines),
        duration_minutes: capture.endedAt ? Math.max(1, Math.round((capture.endedAt - capture.startedAt) / 60000)) : null,
      }),
    })
    const body = await res.json().catch(() => ({}))
    if (res.status === 401) {
      await chrome.storage.local.set({ connection: { ...connection, needsReconnect: true } })
      notify('MeetingOS: please reconnect', body.detail || 'Your extension sign-in expired. Open the extension and connect again.')
      return { ok: false, error: 'Reconnect the extension' }
    }
    if (!res.ok) return { ok: false, error: body.detail || `Server error (${res.status})` }

    const url = `${connection.appUrl}/meeting/${body.meeting_id}`
    notify('Meeting sent to MeetingOS', `“${capture.title}”: AI agents are extracting tasks now. Click to open.`, url)
    return { ok: true, meetingId: body.meeting_id, url }
  } catch {
    return { ok: false, error: 'Could not reach the MeetingOS server' }
  }
}

function notify(title, message, url) {
  const id = url ? `open|${url}` : `info|${Date.now()}`
  chrome.notifications.create(id, { type: 'basic', iconUrl: 'icons/icon128.png', title, message })
}

chrome.notifications.onClicked.addListener(id => {
  if (id.startsWith('open|')) chrome.tabs.create({ url: id.slice(5) })
  chrome.notifications.clear(id)
})

// Old captures pile up in storage; keep the last 20
chrome.runtime.onStartup.addListener(async () => {
  const all = await chrome.storage.local.get(null)
  const keys = Object.keys(all).filter(k => k.startsWith('capture:')).sort((a, b) => all[b].startedAt - all[a].startedAt)
  const old = keys.slice(20)
  const orphanAudio = Object.keys(all).filter(k => k.startsWith('audio:') && !all[k.slice(6)])
  if (old.length || orphanAudio.length) chrome.storage.local.remove([...old, ...old.map(k => `audio:${k}`), ...orphanAudio])
})
