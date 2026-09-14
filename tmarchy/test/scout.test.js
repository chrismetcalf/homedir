const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

// paneStates() runs its pane-content fallback through a real `tmux capture-pane`.
// The fixture pane ids below (%1, %2, %3) are exactly the ids a freshly started
// tmux server hands out, so on a developer's own machine this file could capture
// a LIVE pane and, if that pane happened to be showing an approval dialog, flip
// an assertion. Point this process at an empty socket directory first: tmux then
// fails to connect, lib/tmux.js returns '', and the fallback is inert.
delete process.env.TMUX
const sockDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tmarchy-scout-test-'))
process.env.TMUX_TMPDIR = sockDir
process.on('exit', () => fs.rmSync(sockDir, { recursive: true, force: true }))

const {
  paneIsPrompting, paneStates, windowStates, scoutStates, resetScoutStates, sessionState,
} = require('../lib/scout')

test('detects a live approval dialog', () => {
  const pane = ['some output', '  ❯ 1. Yes', '    2. No', 'Esc to cancel'].join('\n')
  assert.strictEqual(paneIsPrompting(pane), true)
})

test('ignores dialog text merely quoted in scrollback', () => {
  const quoted = ['❯ 1. Yes', 'Esc to cancel', ...Array(20).fill('later output')].join('\n')
  assert.strictEqual(paneIsPrompting(quoted), false)
})

test('needs both a selector and a footer', () => {
  assert.strictEqual(paneIsPrompting('  ❯ 1. Yes\nsomething else'), false)
})

test('wait outranks busy on the same pane', () => {
  const states = paneStates([
    { tmuxPane: '%1', phase: 'running' },
    { tmuxPane: '%1', needsAttention: true },
  ])
  assert.strictEqual(states.get('%1'), 'wait')
})

test('falls back to status when phase is absent', () => {
  const states = paneStates([{ tmuxPane: '%2', status: 'completed' }])
  assert.strictEqual(states.get('%2'), 'done')
})

test('leaves a crashed session untinted', () => {
  const states = paneStates([{ tmuxPane: '%3', phase: 'crashed' }])
  assert.strictEqual(states.has('%3'), false)
})

// A failed query and a genuine zero must not look alike. The ticker unsets
// @scout-state for any window the Map does not mention — right when scout says
// "nothing is running", wrong when scout merely failed to answer, because it
// would clear tints on the strength of no information. null means "no answer";
// an empty Map means "the answer is none".
test('an empty list-panes is a failure, not an answer', () => {
  assert.strictEqual(windowStates('', new Map()), null)
  assert.strictEqual(windowStates('   \n', new Map()), null)
})

test('a live pane list with no agent states is a genuine zero', () => {
  const states = windowStates('@1 %1\n@2 %2\n', new Map())
  assert.ok(states instanceof Map)
  assert.strictEqual(states.size, 0)
})

test('window state takes the highest-priority pane in the window', () => {
  const panes = new Map([['%1', 'busy'], ['%2', 'wait'], ['%3', 'idle']])
  const states = windowStates('@1 %1\n@1 %2\n@2 %3\n', panes)
  assert.strictEqual(states.get('@1'), 'wait')
  assert.strictEqual(states.get('@2'), 'idle')
})

// The tab colours and the agents summary must be the same numbers from the same
// snapshot, not two readings of a file another process rewrites continuously.
// One memo per process; the process exits after a few hundred ms, so there is
// no cross-tick staleness to worry about.
test('scoutStates is computed once per process', () => {
  resetScoutStates()
  const first = scoutStates()
  assert.strictEqual(scoutStates(), first) // identity, not just equality
  resetScoutStates()
  assert.notStrictEqual(scoutStates(), first)
})

test('sessionState: each of the four wait signals', () => {
  assert.equal(sessionState({ needsAttention: true }), 'wait')
  assert.equal(sessionState({ pendingInteraction: {} }), 'wait')
  assert.equal(sessionState({ phase: 'waitingForApproval' }), 'wait')
  assert.equal(sessionState({ phase: 'waitingForAnswer' }), 'wait')
})

test('sessionState: phase beats status when both are present', () => {
  // status can lag behind phase; phase is authoritative.
  assert.equal(sessionState({ phase: 'running', status: 'idle' }), 'busy')
  assert.equal(sessionState({ phase: 'idle', status: 'working' }), 'idle')
})

test('sessionState: falls back to status when phase is absent', () => {
  assert.equal(sessionState({ status: 'working' }), 'busy')
  assert.equal(sessionState({ status: 'completed' }), 'done')
  assert.equal(sessionState({ status: 'idle' }), 'idle')
})

test('sessionState: unknown phase is null, not a guess', () => {
  assert.equal(sessionState({ phase: 'crashed' }), null)
  assert.equal(sessionState({ phase: 'interrupted' }), null)
  assert.equal(sessionState({}), null)
})

test('sessionState: wait wins over any phase', () => {
  assert.equal(sessionState({ needsAttention: true, phase: 'running' }), 'wait')
})

test('next-wait does not carry its own copy of the predicate', () => {
  // The predicate lived in two places and stayed in sync by luck. If someone
  // re-inlines it, CLAUDE.md's "same criteria" claim silently goes false again.
  const fs = require('node:fs')
  const path = require('node:path')
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'bin', 'tmux-scout-next-wait'), 'utf8')
  assert.equal(/needsAttention\s*\|\|/.test(src), false,
    'bin/tmux-scout-next-wait inlines the wait predicate again; call sessionState() instead')
})

// --- isStale: the pane list beats the flag ----------------------------------
//
// scout says a session is gone by setting staleReason, and that flag can be
// wrong in BOTH directions. It lags (36 dead entries once accumulated in a 587K
// file), and it also declares live sessions dead when scout asks a tmux server
// that does not have the pane -- observed for real when this repo's own e2e
// test pointed a tick at a throwaway socket without isolating HOME, and scout
// wrote "pane %2 no longer exists" about the pane the session was running in.
// One of eight flags was wrong, and it was the only session doing anything.
const { isStale } = require('../lib/scout')

// Sabotage: in isStale delete the `claimsPaneGone(...) && livePanes.has(...)`
// clause -- a live session that scout has wrongly flagged stays hidden from the
// screensaver's banner and the triage picker, and this fails.
test('a live pane refutes a paneGone flag', () => {
  const live = new Set(['%2'])
  assert.strictEqual(
    isStale({ tmuxPane: '%2', staleReason: 'pane %2 no longer exists', terminalKind: 'paneGone' }, live),
    false, 'the pane is right there; the flag is wrong')
  // Older scout builds set no terminalKind, so the reason text has to carry it.
  assert.strictEqual(
    isStale({ tmuxPane: '%2', staleReason: 'pane %2 no longer exists' }, live),
    false, 'the reason text alone should be enough')
})

// The refutation is NARROW on purpose: only a claim about the pane existing can
// be refuted by the pane existing. Sabotage: in isStale drop the
// `claimsPaneGone(session) &&` guard so any staleReason is refuted -- a session
// scout called stale for some other reason comes back to life, and this fails.
test('a stale reason that is not about the pane still stands', () => {
  const live = new Set(['%2'])
  assert.strictEqual(
    isStale({ tmuxPane: '%2', staleReason: 'no hooks for 30m', terminalKind: 'stale' }, live),
    true, 'this flag is not a claim the pane list can refute')
})

// Sabotage: in isStale replace `if (session.endedAt) return true` with
// `if (false) return true` -- a finished session reappears and this fails.
test('a genuinely gone session stays gone', () => {
  const live = new Set(['%2'])
  assert.strictEqual(
    isStale({ tmuxPane: '%9', staleReason: 'pane %9 no longer exists', terminalKind: 'paneGone' }, live),
    true, 'the pane really is absent')
  assert.strictEqual(isStale({ tmuxPane: '%2', endedAt: 123 }, live), true,
    'endedAt is a different claim and the pane list cannot refute it')
  assert.strictEqual(isStale({ staleReason: null }, live), true, 'no pane at all')
})

// No pane list means nothing to refute the flag WITH, so the flag is believed.
// Sabotage: in isStale change the clause to `if (claimsPaneGone(session))
// return false` (dropping the livePanes check) -- every flagged session is
// resurrected on a host where the tmux query failed, and this fails.
test('with no pane list the flag is believed', () => {
  const s = { tmuxPane: '%2', staleReason: 'pane %2 no longer exists', terminalKind: 'paneGone' }
  assert.strictEqual(isStale(s, null), true, 'nothing to refute it with')
  assert.strictEqual(isStale(s, undefined), true)
  assert.strictEqual(isStale({ tmuxPane: '%2' }, null), false, 'unflagged is still live')
})
