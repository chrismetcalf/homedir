// External agent providers -- tmarchy/lib/agents.js.
//
// The module's whole job is to accept records from code this repo does not
// control, so nearly every test here is a REFUSAL: the interesting behaviour
// is what it declines to believe. Each names the sabotage that makes it fail,
// because an assertion about a guard is worthless until the guard has been
// removed once and watched to break it.
'use strict'

const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const agents = require(path.join(__dirname, '..', 'lib', 'agents.js'))

const NOW = 1789400000000

function doc(over = {}) {
  return JSON.stringify({
    generatedAt: NOW, ttlMs: 30000,
    agents: [{ key: 'goal:hf', label: 'hf-manpack', state: 'wait' }],
    ...over,
  })
}

// A directory of provider files, torn down by the caller.
function withDir(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tmarchy-agentsd-'))
  for (const [name, body] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), body)
  }
  return { dir, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) }
}

// --- the happy path ---------------------------------------------------------

// Sabotage: in normaliseAgent return `key: raw.key` instead of the prefixed
// form -- the key stops being namespaced and the first assertion fails.
test('a fresh file yields its agents, keyed by the FILENAME', () => {
  const got = agents.parseProvider(doc(), 'otto', NOW)
  assert.strictEqual(got.length, 1)
  assert.strictEqual(got[0].key, 'otto:goal:hf')
  assert.strictEqual(got[0].producer, 'otto')
  assert.strictEqual(got[0].label, 'hf-manpack')
  assert.strictEqual(got[0].state, 'wait')
  assert.strictEqual(got[0].pane, null)
  assert.strictEqual(got[0].subagents, 0)
})

// The filename is the identity, so a file cannot claim to be someone else --
// which is what stops one producer forging another's keys, and what makes a
// collision with a tmux pane id (`%12`) impossible.
//
// Sabotage: in readProviders pass `doc.producer || producer` down to
// parseProvider -- the forged name wins and this fails.
test('a file cannot claim a producer name other than its own', () => {
  const { dir, cleanup } = withDir({ 'otto.json': doc({ producer: 'scout' }) })
  try {
    const got = agents.readProviders({ dir, now: NOW })
    assert.strictEqual(got.length, 1)
    assert.strictEqual(got[0].producer, 'otto')
    assert.ok(got[0].key.startsWith('otto:'), `key was ${got[0].key}`)
  } finally { cleanup() }
})

// --- rule 1: the TTL is mandatory -------------------------------------------

// Sabotage: delete the `if (now > at + ...) return []` line -- the expired
// file's agent comes back and this fails.
test('an expired file yields nothing', () => {
  assert.deepStrictEqual(agents.parseProvider(doc(), 'otto', NOW + 30001), [])
  // ...and is still live one millisecond before it expires, so the test is
  // about expiry rather than about the file being unreadable.
  assert.strictEqual(agents.parseProvider(doc(), 'otto', NOW + 29999).length, 1)
})

// A producer with no timestamp at all is the same case as a dead one: there is
// no way to tell whether the file is current, so it is not believed.
//
// Sabotage: change the guard to `if (!Number.isFinite(ttl) || ttl <= 0)` --
// the file with no generatedAt is accepted and the first assertion fails.
test('a file with no generatedAt or no ttlMs yields nothing', () => {
  assert.deepStrictEqual(agents.parseProvider(doc({ generatedAt: undefined }), 'o', NOW), [])
  assert.deepStrictEqual(agents.parseProvider(doc({ ttlMs: undefined }), 'o', NOW), [])
  assert.deepStrictEqual(agents.parseProvider(doc({ ttlMs: 0 }), 'o', NOW), [])
  assert.deepStrictEqual(agents.parseProvider(doc({ generatedAt: 'now' }), 'o', NOW), [])
})

// The two ways a producer could opt out of expiring: claim an enormous ttl, or
// stamp itself in the future. Both have to be closed, because either one alone
// leaves a file that lives for ever -- and a phantom agent pins the
// screensaver's breath and raises a banner about work that is not happening.
//
// Sabotage A: in parseProvider use `at + ttl` instead of
// `at + Math.min(ttl, MAX_TTL_MS)` -- the first assertion fails.
// Sabotage B: delete the `at > now + FUTURE_SKEW_MS` line -- the second fails.
// Each half is independent: removing one leaves the other still holding, so
// both sabotages are named rather than one standing in for the pair.
test('a huge ttl and a future timestamp are both refused', () => {
  const huge = doc({ ttlMs: 999999999 })
  assert.deepStrictEqual(agents.parseProvider(huge, 'o', NOW + agents.MAX_TTL_MS + 1), [],
    'a ttl past the ceiling must not keep an old file alive')
  const ahead = doc({ generatedAt: NOW + agents.FUTURE_SKEW_MS + 1000 })
  assert.deepStrictEqual(agents.parseProvider(ahead, 'o', NOW), [],
    'a file stamped in the future can never expire, so it is refused outright')
  // A little skew is normal and must still work, or every producer on a host
  // with a slightly fast clock goes silent.
  assert.strictEqual(agents.parseProvider(doc({ generatedAt: NOW + 5000 }), 'o', NOW).length, 1)
})

// --- rule 4: nothing unvalidated reaches a command line ---------------------

// `pane` is passed to `tmux -t`, so it must look exactly like a pane id.
// Sabotage: in normaliseAgent drop the `PANE_RE.test(raw.pane)` term -- the
// shell-ish value survives as a pane and the second assertion fails.
test('pane is accepted only as a tmux pane id', () => {
  const ok = agents.normaliseAgent({ key: 'a', label: 'a', state: 'busy', pane: '%17' }, 'p')
  assert.strictEqual(ok.pane, '%17')
  for (const bad of ['main:0.1', '$(id)', '-X', 'x; tmux kill-server', '%1x', '', 42]) {
    const got = agents.normaliseAgent({ key: 'a', label: 'a', state: 'busy', pane: bad }, 'p')
    assert.strictEqual(got.pane, null, `pane ${JSON.stringify(bad)} should not be accepted`)
  }
})

// A label is drawn into the saver's character grid and handed to tmux for the
// toast, so a control byte is the same class of problem tmux-gen guards at the
// prompt. Stripped rather than rejected: a label is cosmetic, and losing a real
// agent over one stray byte is the worse failure.
//
// Sabotage: in sanitiseLabel drop the `[\x00-\x1f\x7f]` replace -- the escape
// survives into the label and this fails.
test('control bytes are stripped from a label, not carried', () => {
  const got = agents.sanitiseLabel('a\u001b[31mred \u0007 goal')
  assert.ok(!/[\u0000-\u001f\u007f]/.test(got),
    `label still holds a control byte: ${JSON.stringify(got)}`)
  assert.strictEqual(got, 'a [31mred goal')
  // A label that was nothing but control bytes has nothing left to show, and a
  // blank row would be worse than no row.
  assert.strictEqual(agents.normaliseAgent(
    { key: 'a', label: '\u001b\u0007', state: 'busy' }, 'p'), null)
})

// --- one bad record, or one bad file, must not cost the rest ----------------

// Sabotage: in normaliseAgent replace the `STATES.has(raw.state)` guard with
// `raw.state` -- 'exploded' is accepted, the length goes to 3, and this fails.
test('a record with an unknown state or no key is dropped, siblings survive', () => {
  const body = JSON.stringify({
    generatedAt: NOW, ttlMs: 30000,
    agents: [
      { key: 'a', label: 'first', state: 'busy' },
      { key: 'b', label: 'bad state', state: 'exploded' },
      { label: 'no key', state: 'wait' },
      { key: 'c', label: 'last', state: 'idle' },
    ],
  })
  const got = agents.parseProvider(body, 'p', NOW)
  assert.deepStrictEqual(got.map((a) => a.label), ['first', 'last'])
})

// Sabotage: remove the try/catch around JSON.parse in parseProvider --
// readProviders throws on the broken file and never reaches the good one.
test('a corrupt file costs only its own rows', () => {
  const { dir, cleanup } = withDir({
    'broken.json': '{ not json at all',
    'otto.json': doc(),
  })
  try {
    const got = agents.readProviders({ dir, now: NOW })
    assert.deepStrictEqual(got.map((a) => a.key), ['otto:goal:hf'])
  } finally { cleanup() }
})

// Sabotage: in producerFor return the stem unconditionally instead of testing
// PRODUCER_RE -- the odd filenames become producers and the count rises.
test('only conforming filenames are read', () => {
  const { dir, cleanup } = withDir({
    'otto.json': doc(),
    'Otto.json': doc(),          // capitals are not in the producer alphabet
    'notes.txt': doc(),          // not json
    'has space.json': doc(),
  })
  try {
    const got = agents.readProviders({ dir, now: NOW })
    assert.deepStrictEqual(got.map((a) => a.producer), ['otto'])
  } finally { cleanup() }
})

// A producer listing one agent twice would double it in every count that SUMS
// -- the screensaver's breath, the subagent rollup -- rather than merely
// showing a duplicate row.
//
// Sabotage: delete the `seen` set in parseProvider -- two records come back
// and this fails.
test('a repeated key is counted once', () => {
  const body = JSON.stringify({
    generatedAt: NOW, ttlMs: 30000,
    agents: [
      { key: 'a', label: 'first', state: 'busy', subagents: 3 },
      { key: 'a', label: 'again', state: 'wait', subagents: 5 },
    ],
  })
  const got = agents.parseProvider(body, 'p', NOW)
  assert.strictEqual(got.length, 1)
  assert.strictEqual(got[0].label, 'first')
})

// A missing directory is the normal case -- nobody has installed a producer --
// and must read as "no agents", never as an error on the frame loop.
// Sabotage: remove the try/catch around readdirSync -- this throws.
test('a missing directory is simply no providers', () => {
  assert.deepStrictEqual(
    agents.readProviders({ dir: path.join(os.tmpdir(), 'tmarchy-nope-' + Date.now()) }), [])
})

// Bounds, so a runaway producer cannot make the data tick walk a huge list.
// Sabotage: drop the `.slice(0, MAX_RECORDS)` in parseProvider -- 200 records
// come back and this fails.
test('a file is bounded to MAX_RECORDS agents', () => {
  const many = Array.from({ length: 200 }, (_, i) => ({ key: 'k' + i, label: 'a' + i, state: 'idle' }))
  const body = JSON.stringify({ generatedAt: NOW, ttlMs: 30000, agents: many })
  assert.strictEqual(agents.parseProvider(body, 'p', NOW).length, agents.MAX_RECORDS)
})
