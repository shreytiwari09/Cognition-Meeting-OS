const test = require('node:test')
const assert = require('node:assert/strict')
const C = require('../captions.js')

test('a caption that keeps growing becomes one line', () => {
  let lines = []
  for (const text of ["I'll", "I'll have the", "I'll have the pricing page done by Friday."]) {
    lines = C.mergeCaptions(lines, [{ speaker: 'Anika Rao', text }])
  }
  assert.deepEqual(lines.map(l => l.text), ["I'll have the pricing page done by Friday."])
})

test('Meet fixing an earlier word does not duplicate the line', () => {
  let lines = C.mergeCaptions([], [{ speaker: 'Rahul', text: 'we need to ship their new API this week' }])
  lines = C.mergeCaptions(lines, [{ speaker: 'Rahul', text: 'we need to ship the new API this week and test it' }])
  assert.equal(lines.length, 1)
  assert.match(lines[0].text, /and test it$/)
})

test('repeated identical snapshots are ignored', () => {
  const snap = [{ speaker: 'A', text: 'hello there everyone' }, { speaker: 'B', text: 'hi Priya' }]
  const once = C.mergeCaptions([], snap)
  assert.equal(C.mergeCaptions(once, snap).length, 2)
})

test('a shorter tail of a long caption keeps the full text', () => {
  const lines = C.mergeCaptions([], [{ speaker: 'A', text: 'first part of a long sentence that keeps going' }])
  const after = C.mergeCaptions(lines, [{ speaker: 'A', text: 'first part of a long sentence' }])
  assert.equal(after[0].text, 'first part of a long sentence that keeps going')
})

test('a new sentence from the same speaker is a new line', () => {
  let lines = C.mergeCaptions([], [{ speaker: 'A', text: 'Let us review the budget.' }])
  lines = C.mergeCaptions(lines, [{ speaker: 'A', text: 'Next, hiring for the design role.' }])
  assert.equal(lines.length, 2)
})

test('caption text is split by speaker names, and "You" becomes the user', () => {
  const raw = 'Anika Rao\nThe page is almost done.\nI will ship it Friday.\nYou\nGreat, thanks.\nRahul Verma\nStripe sandbox is flaky.'
  assert.deepEqual(C.parseCaptionText(raw, ['Anika Rao', 'Rahul Verma'], 'Priya Sharma'), [
    { speaker: 'Anika Rao', text: 'The page is almost done. I will ship it Friday.' },
    { speaker: 'Priya Sharma', text: 'Great, thanks.' },
    { speaker: 'Rahul Verma', text: 'Stripe sandbox is flaky.' },
  ])
})

test('without known names everything is attributed to Participant', () => {
  assert.deepEqual(C.parseCaptionText('hello world', []), [{ speaker: 'Participant', text: 'hello world' }])
})

test('transcript, title and meeting code helpers', () => {
  assert.equal(C.toTranscript([{ speaker: 'A', text: 'hi' }, { speaker: 'B', text: 'yo' }]), 'A: hi\nB: yo')
  assert.equal(C.meetingTitle('Meet - Weekly sync', 'abc-defg-hij'), 'Weekly sync')
  assert.match(C.meetingTitle('Meet – abc-defg-hij', 'abc-defg-hij', new Date(2026, 9, 2)), /^Google Meet · Oct 2$/)
  assert.equal(C.meetingCodeFromPath('/abc-defg-hij'), 'abc-defg-hij')
  assert.equal(C.meetingCodeFromPath('/landing'), null)
  assert.deepEqual(C.parsePastedTranscript('Rahul: I will fix it\njust a note'), [
    { speaker: 'Rahul', text: 'I will fix it' }, { speaker: 'Participant', text: 'just a note' },
  ])
})

test('block buffer: one line per turn, using the final text of each block', () => {
  const b = C.createBlockBuffer()
  assert.equal(b.update('blk1', 'Anika Rao', "I'll", 1000), null)
  assert.equal(b.update('blk1', 'Anika Rao', "I'll have the pricing", 1500), null)
  assert.equal(b.update('blk1', 'Anika Rao', "I'll have the pricing page live by Friday.", 2000), null)
  const committed = b.update('blk2', 'Rahul Verma', 'Okay', 4000)
  assert.deepEqual(committed, { speaker: 'Anika Rao', text: "I'll have the pricing page live by Friday.", at: 1000, end: 2000 })
  assert.deepEqual(b.flush(), { speaker: 'Rahul Verma', text: 'Okay', at: 4000, end: 4000 })
  assert.equal(b.flush(), null)
})

test('block buffer: Meet word fixes inside a block never duplicate lines', () => {
  const b = C.createBlockBuffer()
  b.update('x', 'A', 'we need to ship their new API', 0)
  b.update('x', 'A', 'we need to ship the new API this week', 1)
  assert.equal(b.flush().text, 'we need to ship the new API this week')
})

test('block buffer: a reset of a very long block commits the long part', () => {
  const b = C.createBlockBuffer()
  const long = 'word '.repeat(80)
  b.update('x', 'A', long, 0)
  const committed = b.update('x', 'A', 'and then', 5)
  assert.equal(committed.text, long.trim())
  assert.equal(b.flush().text, 'and then')
})


// ── Call audio + captions ────────────────────────────────────────────────────

const T = 1_000_000   // call start (epoch ms)
const captionsSample = [
  { speaker: 'Anika Rao', text: 'ill have the pricing paige live by friday', at: T + 2000, end: T + 5000 },
  { speaker: 'Priya Shah', text: 'great thanks', at: T + 6000, end: T + 7000 },              // you
  { speaker: 'Rahul Verma', text: 'cooper netties migration is blocked', at: T + 9000, end: T + 12000 },
]

test('audio: Whisper words, caption speakers, your own lines from captions', () => {
  const chunks = [{ start: T, end: T + 13000, ok: true, segments: [
    { start: 0.4, end: 3.6, text: "I'll have the pricing page live by Friday." },
    { start: 7.2, end: 10.5, text: 'The Kubernetes migration is blocked.' },
  ] }]
  const lines = C.mergeAudioWithCaptions(captionsSample, chunks, 'Priya Shah')
  assert.deepEqual(lines.map(l => `${l.speaker}: ${l.text}`), [
    "Anika Rao: I'll have the pricing page live by Friday.",
    'Priya Shah: great thanks',
    'Rahul Verma: The Kubernetes migration is blocked.',
  ])
})

test('audio: where a chunk failed, the caption lines are kept', () => {
  const chunks = [
    { start: T, end: T + 6000, ok: true, segments: [{ start: 0.4, end: 3.6, text: "I'll have the pricing page live by Friday." }] },
    { start: T + 6000, end: T + 13000, ok: false, segments: [] },
  ]
  const lines = C.mergeAudioWithCaptions(captionsSample, chunks, 'Priya Shah')
  assert.deepEqual(lines.map(l => l.text), [
    "I'll have the pricing page live by Friday.", 'great thanks', 'cooper netties migration is blocked',
  ])
})

test('audio: consecutive pieces from one speaker become one turn; unmatched audio follows the last speaker', () => {
  const caps = [{ speaker: 'Anika Rao', text: 'x', at: T + 1000, end: T + 3000 }]
  const chunks = [
    { start: T, end: T + 4000, ok: true, segments: [{ start: 0, end: 2, text: 'First part.' }, { start: 2, end: 3.5, text: 'Second part.' }] },
    { start: T + 60000, end: T + 64000, ok: true, segments: [{ start: 0, end: 2, text: 'Much later.' }] },
  ]
  assert.deepEqual(C.mergeAudioWithCaptions(caps, chunks, 'Me').map(l => `${l.speaker}: ${l.text}`),
    ['Anika Rao: First part. Second part. Much later.'])
})

test('audio: no usable audio means the captions are returned unchanged', () => {
  const lines = C.mergeAudioWithCaptions(captionsSample, [{ start: T, end: T + 13000, ok: true, segments: [] }], 'Priya Shah')
  assert.deepEqual(lines.map(l => l.text), captionsSample.map(l => l.text))
})

test('audio: segments over silence are dropped, even when Whisper is confident', () => {
  const voiced = []
  for (let t = 0; t < 19500; t += 100) C.addVoiced(voiced, t, t + 100)    // speech for the first 19.5 s
  assert.deepEqual(voiced, [[0, 19500]])
  C.addVoiced(voiced, 25000, 25100)                                        // a separate blip later
  assert.equal(voiced.length, 2)
  const kept = C.keepVoiced([
    { start: 0, end: 19.5, text: 'Real speech.' },
    { start: 21, end: 24, text: 'Tintas Kya, Ssye Tiwari, Aneen.' },        // invented over silence
    { start: 30, end: 32, text: 'Ack.' },                                    // past the end of the audio
  ], [[0, 19500]])
  assert.deepEqual(kept.map(s => s.text), ['Real speech.'])
  assert.equal(C.keepVoiced([{ start: 0, end: 1, text: 'x' }], undefined).length, 1)   // no data: keep everything
})
