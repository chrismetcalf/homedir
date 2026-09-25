const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const tokens = require('../bin/tmarchy-tokens')
const segment = require('../segments.d/tokens')

// mkdtempSync fixtures MUST be rmSync'd -- this box has a documented history of
// /tmp accumulation (238k stale entries, 80% inode exhaustion), and this file
// builds a whole tree rather than one dir, so a leak here is worse than most.
function fixture(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tmarchy-tok-'))
  for (const [rel, lines] of Object.entries(files)) {
    const full = path.join(dir, rel)
    fs.mkdirSync(path.dirname(full), { recursive: true })
    fs.writeFileSync(full, lines.map((l) => JSON.stringify(l)).join('\n') + '\n')
  }
  return dir
}

const NOW = Date.parse('2026-09-25T12:00:00Z')
const ago = (ms) => new Date(NOW - ms).toISOString()
const MIN = 60 * 1000
const HOUR = 60 * MIN

// A minimal assistant record in the shape Claude Code writes.
function msg(id, when, usage) {
  return { timestamp: when, uuid: `u-${id}-${Math.round(Math.random() * 1e9)}`,
    message: { id, usage } }
}
const use = (o) => ({
  input_tokens: 0, output_tokens: 0,
  cache_creation_input_tokens: 0, cache_read_input_tokens: 0, ...o,
})

// --- formatting -------------------------------------------------------------

test('humanTokens keeps the status line to five characters', () => {
  const h = segment.humanTokens
  assert.strictEqual(h(0), '0')
  assert.strictEqual(h(999), '999')
  assert.strictEqual(h(1000), '1.0k')
  assert.strictEqual(h(4200), '4.2k')
  assert.strictEqual(h(42000), '42k')
  assert.strictEqual(h(999000), '999k')
  assert.strictEqual(h(1e6), '1.0M')
  assert.strictEqual(h(4.25e6), '4.3M')
  assert.strictEqual(h(148e6), '148M')
  // Never longer than '999k'/'148M' is: the slot shares status-right with five
  // other segments and an unbounded digit count would push the clock off a
  // narrow client.
  for (const n of [0, 1, 999, 1e3, 1e5, 1e6, 1e8, 9.99e8]) {
    assert.ok(segment.humanTokens(n).length <= 5, `${n} -> ${segment.humanTokens(n)}`)
  }
})

test('humanTokens refuses a value it cannot render', () => {
  assert.strictEqual(segment.humanTokens(NaN), null)
  assert.strictEqual(segment.humanTokens(-1), null)
  assert.strictEqual(segment.humanTokens(undefined), null)
})

// --- summarise --------------------------------------------------------------

const record = (windows, extra = {}) =>
  ({ ok: true, fetched_at: NOW, windows, ...extra })

test('summarise renders the windows shortest-first', () => {
  assert.strictEqual(
    segment.summarise(record({ '1h': 4.2e6, '12h': 31e6 }), NOW),
    '1h 4.2M · 12h 31M')
})

test('a stale reading is withheld rather than shown as current', () => {
  const r = record({ '1h': 4.2e6, '12h': 31e6 })
  assert.ok(segment.summarise(r, NOW + segment.STALE_MS - MIN))
  assert.strictEqual(segment.summarise(r, NOW + segment.STALE_MS + MIN), null)
})

test('a failed or missing scan renders nothing', () => {
  assert.strictEqual(segment.summarise(null, NOW), null)
  assert.strictEqual(segment.summarise({ ok: false, windows: { '1h': 5 } }, NOW), null)
  assert.strictEqual(segment.summarise({ ok: true }, NOW), null)
})

test('all-zero renders nothing, but a zero short window still speaks', () => {
  // An idle machine gets an empty slot, the same way an idle window gets no
  // tint. "1h 0" next to a non-zero 12h is a real statement -- you have
  // stopped -- so it is kept.
  assert.strictEqual(segment.summarise(record({ '1h': 0, '12h': 0 }), NOW), null)
  assert.strictEqual(segment.summarise(record({ '1h': 0, '12h': 31e6 }), NOW),
    '1h 0 · 12h 31M')
})

// --- counting ---------------------------------------------------------------

test('a message repeated by streaming snapshots is counted once', async () => {
  // Claude Code appends a line per streaming update: the same message.id with a
  // fresh uuid each time. Summing lines rather than messages inflated every
  // total by ~3x on this host.
  const dir = fixture({
    'proj/s.jsonl': [
      msg('m1', ago(MIN), use({ output_tokens: 100 })),
      msg('m1', ago(MIN), use({ output_tokens: 400 })),
      msg('m1', ago(MIN), use({ output_tokens: 846 })),
    ],
  })
  try {
    const r = await tokens.scan(NOW, dir)
    assert.strictEqual(r.messages, 1)
    // The LARGEST snapshot wins: an early one is partial, not authoritative.
    assert.strictEqual(r.windows['1h'], 846)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('subagent and workflow transcripts are counted, however deep they nest', async () => {
  // The regression this test exists for: a one-level walk found 45 of 440
  // transcripts on this host and missed EVERY subagent, under-reporting hardest
  // exactly when a fan-out is burning the most tokens. It failed silently --
  // the smaller number still looked plausible.
  const dir = fixture({
    'proj/s.jsonl': [msg('top', ago(MIN), use({ output_tokens: 1 }))],
    'proj/s/subagents/agent-a1.jsonl': [msg('sub', ago(MIN), use({ output_tokens: 20 }))],
    'proj/s/subagents/workflows/wf_1/agent-a2.jsonl': [
      msg('wf', ago(MIN), use({ output_tokens: 300 })),
    ],
  })
  try {
    const r = await tokens.scan(NOW, dir)
    assert.strictEqual(r.windows['1h'], 321, 'a nested transcript was missed')
    assert.strictEqual(r.messages, 3)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('every token category is counted, and kept separately', async () => {
  const dir = fixture({
    'proj/s.jsonl': [msg('m', ago(MIN), use({
      input_tokens: 1, output_tokens: 20,
      cache_creation_input_tokens: 300, cache_read_input_tokens: 4000,
    }))],
  })
  try {
    const r = await tokens.scan(NOW, dir)
    assert.strictEqual(r.windows['1h'], 4321)
    // The split is what makes the headline interpretable -- 95% cache read
    // means something very different from 95% output -- so it is recorded
    // rather than summed away.
    assert.deepStrictEqual(r.breakdown['1h'],
      { input: 1, output: 20, cache_creation: 300, cache_read: 4000 })
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('each window counts only what falls inside it', async () => {
  const dir = fixture({
    'proj/s.jsonl': [
      msg('recent', ago(30 * MIN), use({ output_tokens: 7 })),
      msg('older', ago(5 * HOUR), use({ output_tokens: 500 })),
      msg('ancient', ago(30 * HOUR), use({ output_tokens: 9999 })),
    ],
  })
  try {
    const r = await tokens.scan(NOW, dir)
    assert.strictEqual(r.windows['1h'], 7)
    assert.strictEqual(r.windows['12h'], 507, 'the 12h window must include the 1h one')
    // Beyond the longest window nothing is counted, whatever the file's mtime.
    assert.ok(!String(r.windows['12h']).includes('9999'))
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('a file untouched since the cutoff is skipped, not read', async () => {
  // This is what keeps the scan proportional to recent activity rather than to
  // history: 373 of 440 files skipped on this host. The saving is only sound
  // because a file's newest line is at least as old as its mtime.
  const dir = fixture({
    'proj/fresh.jsonl': [msg('a', ago(MIN), use({ output_tokens: 5 }))],
    'proj/old.jsonl': [msg('b', ago(MIN), use({ output_tokens: 1000 }))],
  })
  try {
    const stale = new Date(NOW - 40 * HOUR)
    fs.utimesSync(path.join(dir, 'proj/old.jsonl'), stale, stale)
    const r = await tokens.scan(NOW, dir)
    assert.strictEqual(r.files_scanned, 1)
    assert.strictEqual(r.files_skipped, 1)
    // The skipped file held an IN-WINDOW record, so this also proves the skip
    // is what excluded it rather than the timestamp filter doing the work.
    assert.strictEqual(r.windows['1h'], 5)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('a malformed line does not cost the rest of the file', async () => {
  const dir = fixture({ 'proj/s.jsonl': [msg('ok', ago(MIN), use({ output_tokens: 42 }))] })
  try {
    // A partially-flushed final line is normal on a live session.
    fs.appendFileSync(path.join(dir, 'proj/s.jsonl'), '{"timestamp":"2026-')
    const r = await tokens.scan(NOW, dir)
    assert.strictEqual(r.windows['1h'], 42)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('a missing projects tree yields zeroes rather than throwing', async () => {
  const r = await tokens.scan(NOW, '/nonexistent/tmarchy-tokens')
  assert.strictEqual(r.windows['1h'], 0)
  assert.strictEqual(r.files_scanned, 0)
})

test('records with no usage are ignored', async () => {
  const dir = fixture({
    'proj/s.jsonl': [
      { timestamp: ago(MIN), type: 'user', message: { role: 'user', content: 'hi' } },
      msg('m', ago(MIN), use({ output_tokens: 3 })),
    ],
  })
  try {
    assert.strictEqual((await tokens.scan(NOW, dir)).windows['1h'], 3)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
