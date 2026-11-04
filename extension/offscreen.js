// Records the Meet tab's audio (everyone else in the call) and sends it to the backend in short chunks for
// Whisper to transcribe. Chunks are cut at a pause in speech where possible, so words aren't split in half.
// Each chunk's result goes to background.js, which stores it next to the caption capture.
;(function () {
  const { keepVoiced, addVoiced } = globalThis.MeetingOSCaptions
  const MIN_CHUNK_MS = 30000      // start looking for a pause after 30 s…
  const MAX_CHUNK_MS = 90000      // …and cut anyway at 90 s
  const PAUSE_MS = 400            // this much quiet counts as a pause
  const VOICE_RMS = 0.008         // louder than this counts as someone talking
  const MIN_VOICE_MS = 800        // chunks with less speech than this are not sent (saves the free quota)
  const RETRY_MS = 5000

  let session = null   // { key, apiUrl, token, title, stream, ctx, analyser, recorder, chunk, quietMs, lastCheck, timer, pending }

  chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
    if (msg.target !== 'offscreen') return
    if (msg.type === 'START') { start(msg).then(() => reply({ ok: true }), e => reply({ ok: false, error: e.message })); return true }
    if (msg.type === 'STOP') { stop().then(() => reply({ ok: true })); return true }
  })

  async function start({ streamId, key, apiUrl, token, title }) {
    if (session) await stop()
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: streamId } }, video: false,
    })
    // Capturing a tab mutes it for you, so play the audio back
    const ctx = new AudioContext()
    const source = ctx.createMediaStreamSource(stream)
    source.connect(ctx.destination)
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 2048
    source.connect(analyser)

    session = { key, apiUrl, token, title, stream, ctx, analyser, quietMs: 0, lastCheck: Date.now(), pending: [] }
    stream.getAudioTracks()[0].addEventListener('ended', () => stop())   // tab closed or navigated away
    newRecorder()
    session.timer = setInterval(checkLevel, 100)
  }

  function newRecorder() {
    const s = session
    const recorder = new MediaRecorder(s.stream, { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 32000 })
    const chunk = { start: Date.now(), voicedMs: 0, voiced: [] }
    const parts = []
    recorder.ondataavailable = e => { if (e.data.size) parts.push(e.data) }
    s.pending.push(new Promise(resolve => {
      recorder.onstop = () => resolve(send(s, new Blob(parts, { type: 'audio/webm' }), chunk, Date.now()))
    }))
    recorder.start()
    Object.assign(s, { recorder, chunk, quietMs: 0 })
  }

  function checkLevel() {
    const s = session
    if (!s) return
    const now = Date.now(), dt = now - s.lastCheck   // timers can be throttled, so measure real time
    s.lastCheck = now
    const buf = new Float32Array(s.analyser.fftSize)
    s.analyser.getFloatTimeDomainData(buf)
    const rms = Math.sqrt(buf.reduce((sum, v) => sum + v * v, 0) / buf.length)
    if (rms > VOICE_RMS) {
      const t = now - s.chunk.start
      s.chunk.voicedMs += dt
      addVoiced(s.chunk.voiced, Math.max(0, t - dt), t)
      s.quietMs = 0
    } else s.quietMs += dt

    const age = now - s.chunk.start
    if ((age >= MIN_CHUNK_MS && s.quietMs >= PAUSE_MS) || age >= MAX_CHUNK_MS) {
      const old = s.recorder
      newRecorder()        // start the next chunk first, so nothing falls in a gap
      old.stop()
    }
  }

  async function send(s, blob, chunk, end) {
    const result = { start: chunk.start, end, ok: false, segments: [] }
    if (chunk.voicedMs < MIN_VOICE_MS) return report(s, { ...result, ok: true, skipped: true })

    let error = null
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const form = new FormData()
        form.append('audio', blob, 'chunk.webm')
        form.append('title', s.title || '')
        const res = await fetch(`${s.apiUrl}/extension/transcribe`, {
          method: 'POST', headers: { Authorization: `Bearer ${s.token}` }, body: form,
        })
        const body = await res.json().catch(() => ({}))
        if (res.ok) return report(s, { ...result, ok: true, segments: keepVoiced(body.segments || [], chunk.voiced) })
        error = body.detail || `Server error (${res.status})`
        if (res.status === 401 || res.status === 400 || res.status === 413) break
      } catch {
        error = 'Could not reach the MeetingOS server'
      }
      await new Promise(r => setTimeout(r, RETRY_MS))
    }
    return report(s, result, error)
  }

  function report(s, chunk, error = null) {
    return chrome.runtime.sendMessage({ type: 'AUDIO_CHUNK', key: s.key, chunk, error }).catch(() => {})
  }

  async function stop() {
    const s = session
    if (!s) return
    session = null
    clearInterval(s.timer)
    if (s.recorder?.state === 'recording') s.recorder.stop()
    s.stream.getTracks().forEach(t => t.stop())
    s.ctx.close().catch(() => {})
    // Wait for the last chunks to be transcribed (but not forever)
    await Promise.race([Promise.allSettled(s.pending), new Promise(r => setTimeout(r, 45000))])
    chrome.runtime.sendMessage({ type: 'AUDIO_STOPPED', key: s.key }).catch(() => {})
  }
})()
