// Runs on meet.google.com. Detects when you're in a call, turns captions on, captures them with
// speaker names, shows a small status pill on the page, and hands the transcript off when the call ends.
const { MEET, parseCaptionText, mergeCaptions, createBlockBuffer, meetingTitle, meetingCodeFromPath, parsePastedTranscript } = globalThis.MeetingOSCaptions

const DEFAULT_SETTINGS = { autoRecord: true, autoCaptions: true, autoSend: true }
const MIN_LINES_TO_SEND = 3

const state = {
  inCall: false,
  recording: false,
  capture: null,          // { key, code, title, startedAt, lines: [], speakers: [], status, meetingId, error }
  settings: { ...DEFAULT_SETTINGS },
  connection: null,
  observer: null,
  observedRegion: null,
  buffer: createBlockBuffer(),
  blockIds: new WeakMap(),     // caption block element → stable id
  nextBlockId: 1,
  lastStructured: 0,           // last time the precise (block-based) reader worked
  saveTimer: null,
  leftAt: null,
  audio: null,                 // call-audio recording for this capture: { active, chunks, error } (set by background.js)
}

const $ = selectors => {
  for (const sel of selectors) {
    const el = document.querySelector(sel)
    if (el) return el
  }
  return null
}

// ── Storage ─────────────────────────────────────────────────────────────────

function saveCapture(immediate = false) {
  if (!state.capture) return
  clearTimeout(state.saveTimer)
  const write = () => chrome.storage.local.set({ [state.capture.key]: state.capture })
  if (immediate) write()
  else state.saveTimer = setTimeout(write, 1500)
}

function announce() {
  if (!chrome.runtime?.id) return
  chrome.runtime.sendMessage({
    type: 'STATE', recording: state.recording, lines: state.capture?.lines.length || 0,
  }).catch(() => {})
  renderPill()
}

// ── Capture ─────────────────────────────────────────────────────────────────

function newCapture(code) {
  const startedAt = Date.now()
  return {
    key: `capture:${code}:${startedAt}`, code, startedAt, selfName: selfName(),
    title: currentTitle(code), lines: [], speakers: [], status: 'recording',
  }
}

function currentTitle(code) {
  const el = $(MEET.meetingTitle)
  const text = el?.textContent?.trim()
  return meetingTitle(text && text !== code ? `Meet - ${text}` : document.title, code)
}

function selfName() {
  return state.connection?.name || $(MEET.selfName)?.textContent?.trim() || 'You'
}

const iconWithText = text => [...document.querySelectorAll(MEET.icons)].find(el => el.textContent.trim() === text)

function addLine(line) {
  if (!line || !state.capture) return
  const speaker = /^you$/i.test(line.speaker) ? selfName() : line.speaker
  state.capture.lines.push({ speaker, text: line.text, at: line.at })
  state.capture.speakers = [...new Set(state.capture.lines.map(l => l.speaker))].filter(n => n !== 'Participant')
  saveCapture()
  announce()
}

function blockId(el) {
  if (!state.blockIds.has(el)) state.blockIds.set(el, state.nextBlockId++)
  return state.blockIds.get(el)
}

// Precise reader (same approach as TranscripTonic): only the live caption block counts. Its speaker is the
// element right before the text, and its full text is the truth until the next block starts.
function onCaptionMutations(mutations) {
  if (!state.capture) return
  let matched = false
  for (const m of mutations) {
    if (m.type !== 'characterData') continue
    const textEl = m.target.parentElement
    const block = textEl?.parentElement
    const blocks = [...(block?.parentElement?.children || [])]
    // The last two children of the caption list are UI, so the live caption is the third from the end
    if (!block || blocks[blocks.length - 3] !== block) continue
    const speaker = textEl.previousSibling?.textContent?.trim()
    const text = textEl.textContent
    if (!speaker || !text) continue
    matched = true
    state.lastStructured = Date.now()
    addLine(state.buffer.update(blockId(block), speaker, text))
  }
  if (matched) announce()
  else if (Date.now() - state.lastStructured > 15000) scheduleSnapshot()   // Meet changed its markup: fall back
}

// Fallback reader for unknown markup: re-read the whole caption area and merge (less precise)
let snapshotTimer
function scheduleSnapshot() {
  clearTimeout(snapshotTimer)
  snapshotTimer = setTimeout(() => {
    const region = $(MEET.captionRegion)
    if (!region || !state.capture) return
    const names = new Set()
    for (const sel of MEET.speakerBadge) region.querySelectorAll(sel).forEach(el => el.textContent?.trim() && names.add(el.textContent.trim()))
    const before = state.capture.lines.length
    state.capture.lines = mergeCaptions(state.capture.lines, parseCaptionText(region.innerText, [...names], selfName()))
    if (state.capture.lines.length !== before) addLine(null)
    saveCapture(); announce()
  }, 800)
}

function watchCaptions() {
  const region = $(MEET.captionRegion)
  if (region === state.observedRegion) return
  state.observer?.disconnect()
  state.observedRegion = region
  if (!region) return
  state.lastStructured = Date.now()
  state.observer = new MutationObserver(onCaptionMutations)
  state.observer.observe(region, { childList: true, subtree: true, characterData: true })
}

function captionsOn() {
  // The "turn on captions" icon is visible exactly when captions are off
  return !iconWithText(MEET.captionsOffIcon) && !!$(MEET.captionRegion)
}

function turnOnCaptions() {
  if (captionsOn()) return true
  const icon = iconWithText(MEET.captionsOffIcon)
  const button = icon?.closest('button') ||
    [...document.querySelectorAll(MEET.captionsButton.join(','))].find(b => /turn on/i.test(b.getAttribute('aria-label') || ''))
  button?.click()
  return !!button
}

function inCallNow() {
  return !!iconWithText(MEET.callEndIcon) || !!$(MEET.leaveButton)
}

function startRecording() {
  const code = meetingCodeFromPath(location.pathname)
  if (!code) return
  if (!state.capture || state.capture.status !== 'recording' || state.capture.code !== code) {
    state.capture = newCapture(code)
    state.buffer = createBlockBuffer()
    state.audio = null
  }
  state.recording = true
  if (state.settings.autoCaptions) turnOnCaptions()
  watchCaptions()
  saveCapture(true)
  announce()
}

function stopRecording() {
  addLine(state.buffer.flush())
  state.recording = false
  state.observer?.disconnect()
  state.observer = null
  state.observedRegion = null
  if (state.capture) {
    if (state.audio?.active) chrome.runtime.sendMessage({ type: 'AUDIO_STOP', key: state.capture.key }).catch(() => {})
    state.capture.endedAt = Date.now()
    state.capture.status = state.capture.lines.length ? 'ready' : 'empty'
    saveCapture(true)
  }
  announce()
}

const heardAudio = () => state.audio?.chunks?.some(c => c.ok && c.segments?.length)

async function sendCapture() {
  const capture = state.capture
  if (!capture || (!capture.lines.length && !heardAudio())) return
  capture.status = 'sending'
  announce()
  const res = await chrome.runtime.sendMessage({ type: 'UPLOAD', key: capture.key }).catch(e => ({ ok: false, error: e.message }))
  if (res?.ok) Object.assign(capture, { status: 'sent', meetingId: res.meetingId, meetingUrl: res.url, error: null })
  else Object.assign(capture, { status: 'ready', error: res?.error || 'Could not send' })
  saveCapture(true)
  announce()
}

// ── Call lifecycle ──────────────────────────────────────────────────────────

function tick() {
  const inCall = inCallNow()
  if (inCall && !state.inCall) {
    state.inCall = true
    state.leftAt = null
    if (state.settings.autoRecord && state.connection) startRecording()
    announce()
  } else if (!inCall && state.inCall) {
    // The leave button can flicker while Meet re-renders; only treat it as "left" after a few seconds
    state.leftAt = state.leftAt || Date.now()
    if (Date.now() - state.leftAt > 4000) {
      state.inCall = false
      if (state.recording) {
        stopRecording()
        if (state.settings.autoSend && (state.capture?.lines.length >= MIN_LINES_TO_SEND || heardAudio())) sendCapture()
      }
      announce()
    }
  } else if (inCall) {
    state.leftAt = null
  }

  if (state.recording) {
    watchCaptions()                                   // the caption region is re-created when captions toggle
    if (state.settings.autoCaptions && !captionsOn()) turnOnCaptions()
    if (state.capture && state.capture.title.startsWith('Google Meet ·')) state.capture.title = currentTitle(state.capture.code)
  }
}

// ── On-page status pill (in a shadow root so Meet's styles can't touch it) ─────

let pillRoot = null
function renderPill() {
  if (!state.inCall && !['ready', 'sending', 'sent'].includes(state.capture?.status)) {
    pillRoot?.host.remove(); pillRoot = null; return
  }
  if (!pillRoot) {
    const host = document.createElement('div')
    host.style.cssText = 'position:fixed;left:16px;bottom:96px;z-index:2147483647'
    document.documentElement.appendChild(host)
    pillRoot = host.attachShadow({ mode: 'open' })
  }
  const c = state.capture
  const lines = (c?.lines.length || 0) + (state.recording && state.buffer.peek() ? 1 : 0)
  let dot = '#6b7280', text = 'MeetingOS ready', button = ''
  if (!state.connection) { text = 'MeetingOS: open the extension to connect' }
  else if (state.recording && !captionsOn()) { dot = '#f59e0b'; text = 'Turn on captions (CC) so MeetingOS can listen'; button = '<button data-a="stop">Stop</button>' }
  else if (state.recording) {
    dot = '#ef4444'
    text = `Recording · ${lines} line${lines === 1 ? '' : 's'} · ${state.audio?.active ? 'audio + captions' : 'captions only'}`
    button = '<button data-a="stop">Stop</button>'
  }
  else if (c?.status === 'sending') { dot = '#a78bfa'; text = state.audio?.chunks?.length ? 'Finishing the audio transcript and sending…' : 'Sending to MeetingOS…' }
  else if (c?.status === 'sent') { dot = '#22c55e'; text = 'Sent · agents are processing'; button = c.meetingUrl ? '<button data-a="open">Open</button>' : '' }
  else if (c?.status === 'ready' && lines) { dot = '#a78bfa'; text = c.error ? `Not sent: ${c.error}` : `Captured ${lines} lines`; button = '<button data-a="send">Send</button>' }
  else if (state.inCall) { button = '<button data-a="start">Record</button>' }

  pillRoot.innerHTML = `
    <style>
      .p{display:flex;align-items:center;gap:8px;background:rgba(17,17,24,.92);color:#e5e7eb;border:1px solid #2d2d3a;
         border-radius:999px;padding:6px 8px 6px 12px;font:500 12px/1.2 -apple-system,system-ui,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.35)}
      .d{width:8px;height:8px;border-radius:50%;background:${dot};${state.recording ? 'animation:b 1.4s infinite' : ''}}
      @keyframes b{50%{opacity:.35}}
      button{background:#7c3aed;color:#fff;border:0;border-radius:999px;padding:4px 10px;font:600 11px system-ui;cursor:pointer}
      button[data-a=stop]{background:#374151}
      .x{background:transparent;color:#6b7280;padding:2px 6px}
    </style>
    <div class="p"><span class="d"></span><span></span>${button}<button class="x" data-a="hide" title="Hide">✕</button></div>`
  pillRoot.querySelector('.p > span:nth-child(2)').textContent = text
  pillRoot.querySelectorAll('button').forEach(b => b.onclick = () => {
    const a = b.dataset.a
    if (a === 'stop') stopRecording()
    if (a === 'start') startRecording()
    if (a === 'send') sendCapture()
    if (a === 'open') window.open(c.meetingUrl, '_blank')
    if (a === 'hide') { pillRoot.host.remove(); pillRoot = null }
  })
}

// ── Messages from the popup ─────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  const c = state.capture
  if (msg.type === 'GET_STATE') {
    reply({
      onMeet: true, inCall: state.inCall, recording: state.recording,
      captionsOn: captionsOn(),
      capture: c && { key: c.key, title: c.title, lines: c.lines.length + (state.buffer.peek() ? 1 : 0), speakers: c.speakers, status: c.status,
                      error: c.error, meetingUrl: c.meetingUrl,
                      preview: [...c.lines, ...(state.recording && state.buffer.peek() ? [state.buffer.peek()] : [])].slice(-3) },
    })
  } else if (msg.type === 'START') { startRecording(); reply({ ok: true }) }
  else if (msg.type === 'STOP') { stopRecording(); reply({ ok: true }) }
  else if (msg.type === 'SEND') { sendCapture().then(() => reply({ ok: state.capture?.status === 'sent', error: state.capture?.error })); return true }
  else if (msg.type === 'SET_TITLE' && c) { c.title = msg.title; saveCapture(true); reply({ ok: true }) }
  else if (msg.type === 'PASTE') {
    const code = meetingCodeFromPath(location.pathname) || 'pasted'
    if (!state.capture || state.capture.status === 'sent') state.capture = newCapture(code)
    state.capture.lines.push(...parsePastedTranscript(msg.text).map(l => ({ ...l, at: Date.now() })))
    state.capture.speakers = [...new Set(state.capture.lines.map(l => l.speaker))].filter(s => s !== 'Participant')
    if (!state.recording) state.capture.status = 'ready'
    saveCapture(true); announce()
    reply({ ok: true, lines: state.capture.lines.length })
  }
})

chrome.storage.onChanged.addListener(changes => {
  const audioChange = state.capture && changes[`audio:${state.capture.key}`]
  if (audioChange) { state.audio = audioChange.newValue || null; announce() }
  if (changes.settings) state.settings = { ...DEFAULT_SETTINGS, ...changes.settings.newValue }
  if (changes.connection) {
    state.connection = changes.connection.newValue || null
    if (state.connection && state.inCall && !state.recording && state.settings.autoRecord) startRecording()
    announce()
  }
})

chrome.storage.local.get(['settings', 'connection'], data => {
  state.settings = { ...DEFAULT_SETTINGS, ...data.settings }
  state.connection = data.connection || null
  const timer = setInterval(() => {
    // After the extension is reloaded or removed, this old copy loses access to chrome.* APIs
    if (!chrome.runtime?.id) { clearInterval(timer); state.observer?.disconnect(); pillRoot?.host.remove(); return }
    try { tick() } catch (e) { if (!/context invalidated/i.test(e.message)) console.warn('[MeetingOS]', e) }
  }, 1500)
  tick()
})
