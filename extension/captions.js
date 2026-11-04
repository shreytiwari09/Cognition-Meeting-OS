// Turning Google Meet's on-screen captions into a clean "Speaker: text" transcript.
// Pure functions (no DOM, no chrome.*) so they can be unit-tested with `cd extension && node --test`.
//
// Wrapped in a function on purpose: in Chrome, this file shares one global scope with content.js,
// popup.js and background.js, so top-level names here would clash with theirs. Only
// `MeetingOSCaptions` is exposed.
;(function () {

  // Meet's markup changes often. Every selector lives here so a breakage is a one-line fix.
  // Meet's markup changes often, so every selector lives here. The structural ones (region role, icon names)
  // follow TranscripTonic (MIT, github.com/vivek-nexus/transcriptonic), which survives Meet redesigns well.
  const MEET = {
    captionRegion: ['div[role="region"][tabindex="0"]', '[role="region"][aria-label*="aption" i]', '[jsname="dsyhDe"]'],
    icons: '.google-symbols, .material-icons-extended, i.google-material-icons',
    captionsOffIcon: 'closed_caption_off',
    callEndIcon: 'call_end',
    leaveButton: ['button[aria-label*="Leave call" i]', 'button[jsname="CQylAd"]', '[data-tooltip*="Leave call" i]'],
    captionsButton: ['button[aria-label*="captions" i]'],
    selfName: ['.awLEm', '[data-self-name]'],
    meetingTitle: ['.u6vdEc', '[data-meeting-title]'],
    speakerBadge: ['.NWpY1d', '.xoMHSc', '.KcIKyf', '.zs7s8d'],
    participantName: ['[data-self-name]', '[data-participant-id] [jsname="EydYod"]', '.zWGUib'],
  }

  const SELF_LABELS = new Set(['you', 'you (presenting)'])

  function normalize(text) {
    return (text || '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim()
  }

  // Length of the longest common in-order word sequence
  function commonWords(a, b) {
    const prev = new Array(b.length + 1).fill(0)
    for (let i = 1; i <= a.length; i++) {
      let diag = 0
      for (let j = 1; j <= b.length; j++) {
        const up = prev[j]
        prev[j] = a[i - 1] === b[j - 1] ? diag + 1 : Math.max(prev[j], prev[j - 1])
        diag = up
      }
    }
    return prev[b.length]
  }

  // Meet keeps rewriting the caption it is currently showing ("I'll" → "I'll have" → "I'll have it ready"),
  // and sometimes fixes earlier words ("their" → "the"). Two texts are the same caption if one grows out of
  // the other, or if most words of the shorter one appear, in order, in the longer one.
  function isSameCaption(a, b) {
    const x = normalize(a), y = normalize(b)
    if (!x || !y) return false
    if (x.startsWith(y) || y.startsWith(x)) return true
    const wx = x.split(' '), wy = y.split(' ')
    const shorter = Math.min(wx.length, wy.length)
    return shorter >= 3 && commonWords(wx, wy) / shorter >= 0.75
  }

  // Split the visible caption text into {speaker, text} blocks.
  // Meet renders a speaker's name on its own line above their words; known names come from the
  // speaker badges on the page. "You" is the person running the extension.
  function parseCaptionText(rawText, knownNames = [], selfName = '') {
    const names = new Map(knownNames.filter(Boolean).map(n => [n.trim().toLowerCase(), n.trim()]))
    const blocks = []
    let speaker = null
    for (const line of (rawText || '').split('\n').map(l => l.trim()).filter(Boolean)) {
      const key = line.toLowerCase()
      if (SELF_LABELS.has(key)) { speaker = selfName || 'You'; continue }
      if (names.has(key)) { speaker = names.get(key); continue }
      const last = blocks[blocks.length - 1]
      const who = speaker || 'Participant'
      if (last && last.speaker === who && !last.closed) last.text = `${last.text} ${line}`
      else blocks.push({ speaker: who, text: line })
      speaker = who
    }
    return blocks.map(({ speaker, text }) => ({ speaker, text }))
  }

  // Meet shows one caption block per turn and keeps rewriting the *current* block until the next turn starts.
  // The block's full text is the truth, so we hold it in a buffer and commit it once, when a new block starts
  // (or when Meet resets a very long block). Earlier blocks still get small corrections from Meet; ignoring them
  // is what prevents duplicated and chopped lines.
  function createBlockBuffer() {
    let current = null   // { id, speaker, text, at, end }  (at/end: when the turn started / last changed)
    const line = c => ({ speaker: c.speaker, text: c.text.trim(), at: c.at, end: c.end })
    return {
      // Returns the line to commit (if a turn just ended), else null
      update(id, speaker, text, now = Date.now()) {
        if (!speaker || !text || !text.trim()) return null
        if (!current) { current = { id, speaker, text, at: now, end: now }; return null }
        // A new block started, or the same block shrank a lot (Meet dropped an over-long turn and started over)
        if (current.id !== id || text.length - current.text.length < -250) {
          const done = current
          current = { id, speaker, text, at: now, end: now }
          return line(done)
        }
        Object.assign(current, { text, speaker, end: now })
        return null
      },
      flush() {
        if (!current) return null
        const done = line(current)
        current = null
        return done.text ? done : null
      },
      peek() { return current && line(current) },
    }
  }

  // Fold a new snapshot of visible captions into the transcript so far.
  // Updates a line in place while Meet is still revising it; appends genuinely new lines.
  function mergeCaptions(lines, snapshot, now = Date.now(), lookback = 6) {
    const result = lines.map(l => ({ ...l }))
    for (const block of snapshot) {
      if (normalize(block.text).length < 2) continue
      let matched = false
      for (let i = result.length - 1; i >= Math.max(0, result.length - lookback); i--) {
        const line = result[i]
        if (line.speaker !== block.speaker || !isSameCaption(line.text, block.text)) continue
        // Keep the more complete version: Meet sometimes shows only the tail of a long caption
        if (!(normalize(line.text).startsWith(normalize(block.text)) && line.text.length > block.text.length)) {
          line.text = block.text
        }
        line.updatedAt = now
        matched = true
        break
      }
      if (!matched) result.push({ speaker: block.speaker, text: block.text, at: now, updatedAt: now })
    }
    return result
  }

  // ── Call audio + captions ────────────────────────────────────────────────
  // With audio recording on, Whisper supplies the words for everyone else in the call (the tab's audio), and
  // the captions only say *who* was talking when. Your own lines still come from captions, because the tab
  // audio doesn't contain your microphone. Wherever the audio failed, the caption lines are kept.

  const CAPTION_LAG_MS = 2500    // captions appear a moment after the words are spoken
  const NEAREST_MS = 8000        // how far to look for a speaker when no caption overlaps a segment

  function overlap(a0, a1, b0, b1) { return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0)) }

  function speakerAt(lines, t0, t1) {
    let best = null, bestOverlap = 0, nearest = null, nearestGap = NEAREST_MS
    for (const l of lines) {
      const s = l.at - CAPTION_LAG_MS, e = (l.end || l.at) + 1000
      const o = overlap(t0, t1, s, e)
      if (o > bestOverlap) { best = l.speaker; bestOverlap = o }
      const gap = Math.max(0, s - t1, t0 - e)
      if (gap < nearestGap) { nearest = l.speaker; nearestGap = gap }
    }
    return best || nearest
  }

  // Whisper sometimes invents words over silence (often echoing the names it was given as hints), and it can
  // look fully confident doing it. The recorder knows when there actually was sound, so keep only segments that
  // overlap it. voiced: [[startMs, endMs]] relative to the chunk start.
  function keepVoiced(segments, voiced, padMs = 500, minOverlapMs = 300) {
    if (!voiced) return segments
    return segments.filter(seg => {
      const s0 = seg.start * 1000, s1 = seg.end * 1000
      const heard = voiced.reduce((sum, [v0, v1]) => sum + overlap(s0, s1, v0 - padMs, v1 + padMs), 0)
      return heard >= Math.min(minOverlapMs, (s1 - s0) / 2)
    })
  }

  // Adds a moment of sound to a list of voiced ranges, joining it to the last range across short gaps
  function addVoiced(voiced, from, to, joinMs = 600) {
    const last = voiced[voiced.length - 1]
    if (last && from - last[1] <= joinMs) last[1] = Math.max(last[1], to)
    else voiced.push([from, to])
    return voiced
  }

  // chunks: [{ start, end (epoch ms), ok, segments: [{ start, end (seconds into the chunk), text }] }]
  function mergeAudioWithCaptions(captionLines, chunks, selfName) {
    const others = captionLines.filter(l => l.speaker !== selfName)
    const heard = (chunks || []).filter(c => c.ok && c.segments?.length)
    const covered = t => heard.some(c => t >= c.start && t <= c.end)

    const entries = []
    let previous = null
    for (const c of heard) {
      for (const seg of c.segments) {
        const t0 = c.start + seg.start * 1000, t1 = c.start + seg.end * 1000
        const speaker = speakerAt(others, t0, t1) || previous || 'Participant'
        previous = speaker
        entries.push({ speaker, text: seg.text.trim(), at: t0, end: t1 })
      }
    }
    for (const l of captionLines) {
      const mid = ((l.at + (l.end || l.at)) / 2) - CAPTION_LAG_MS / 2
      if (l.speaker === selfName || !covered(mid)) entries.push({ ...l })
    }
    entries.sort((a, b) => a.at - b.at)

    // Join consecutive pieces from the same speaker into one turn
    const lines = []
    for (const e of entries) {
      const last = lines[lines.length - 1]
      if (last && last.speaker === e.speaker) { last.text = `${last.text} ${e.text}`; last.end = Math.max(last.end || last.at, e.end || e.at) }
      else lines.push({ speaker: e.speaker, text: e.text, at: e.at, end: e.end || e.at })
    }
    return lines.filter(l => l.text)
  }

  function toTranscript(lines) {
    return lines.map(l => `${l.speaker}: ${l.text}`).join('\n')
  }

  // "Meet - Weekly sync" / "Meet – abc-defg-hij" → a human title
  function meetingTitle(documentTitle, meetingCode, date = new Date()) {
    const title = (documentTitle || '').replace(/^\s*(Google\s+)?Meet\s*[-–—:]\s*/i, '').trim()
    if (title && title !== meetingCode && title.toLowerCase() !== 'meet') return title
    return `Google Meet · ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
  }

  function meetingCodeFromPath(pathname) {
    const match = (pathname || '').match(/\/([a-z]{3,4}-[a-z]{4}-[a-z]{3,4})/i)
    return match ? match[1].toLowerCase() : null
  }

  // Lines typed as "Name: words" (manual paste fallback)
  function parsePastedTranscript(text) {
    return (text || '').split('\n').map(l => l.trim()).filter(Boolean).map(line => {
      const i = line.indexOf(':')
      return i > 0 && i < 40
        ? { speaker: line.slice(0, i).trim(), text: line.slice(i + 1).trim() }
        : { speaker: 'Participant', text: line }
    })
  }


  const MeetingOSCaptions = {
    MEET, normalize, isSameCaption, parseCaptionText, mergeCaptions, toTranscript,
    createBlockBuffer, meetingTitle, meetingCodeFromPath, parsePastedTranscript, mergeAudioWithCaptions,
    keepVoiced, addVoiced,
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = MeetingOSCaptions
  else globalThis.MeetingOSCaptions = MeetingOSCaptions
})()
