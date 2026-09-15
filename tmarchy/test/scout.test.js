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

// --- subagents --------------------------------------------------------------
//
// scout records Task subagents in `activeSubagents`, and THAT ARRAY LEAKS: it
// never clears entries when the parent finishes. Measured on a real host, 20
// records claimed `phase: "running"` and 19 of them belonged to sessions that
// were already dead. Counting the array as written would peg every consumer at
// maximum permanently.
const { subagentCount, windowSums, SUBAGENT_FRESH_MS } = require('../lib/scout')

const fresh = (over = {}) => ({ phase: 'running', updatedAt: Date.now(), ...over })

// Sabotage: in subagentCount delete the
// `if (!sub.updatedAt || now - sub.updatedAt > SUBAGENT_FRESH_MS) continue`
// line -- yesterday's leaked records all count again and this fails.
test('a subagent that has not reported recently is not running', () => {
  const now = Date.now()
  const s = {
    activeSubagents: [
      fresh(),
      fresh({ updatedAt: now - 5000 }),
      { phase: 'running', updatedAt: now - 24 * 3600 * 1000 },   // yesterday's leak
      { phase: 'running', updatedAt: now - SUBAGENT_FRESH_MS - 1 },
      { phase: 'running' },                                       // no timestamp at all
    ],
  }
  assert.strictEqual(subagentCount(s, now), 2, 'only the two recent ones are running')
})

// Sabotage: in subagentCount replace `if (!sub || sub.phase !== 'running')`
// with `if (!sub)` -- finished subagents are counted as working and this fails.
test('only running subagents count', () => {
  const now = Date.now()
  const s = {
    activeSubagents: [
      fresh(),
      fresh({ phase: 'completed' }),
      fresh({ phase: 'failed' }),
      fresh({ phase: undefined }),
    ],
  }
  assert.strictEqual(subagentCount(s, now), 1)
})

// Sabotage: in subagentCount replace the `Array.isArray(...)` guard with
// `session.activeSubagents || []` -- a session whose field is an object throws
// and this fails.
test('a session with no subagents, or nonsense in the field, counts zero', () => {
  assert.strictEqual(subagentCount({}), 0)
  assert.strictEqual(subagentCount(null), 0)
  assert.strictEqual(subagentCount({ activeSubagents: null }), 0)
  assert.strictEqual(subagentCount({ activeSubagents: {} }), 0)
  assert.strictEqual(subagentCount({ activeSubagents: 'three' }), 0)
  assert.strictEqual(subagentCount({ activeSubagents: [null, undefined] }), 0)
})

// Counts SUM across a window's panes, unlike states, which take the highest
// priority. Two agent panes running two subagents each is four, not two.
// Sabotage: in windowSums replace the accumulate with
// `out.set(winId, n)` -- the second pane overwrites the first and this fails.
test('subagent counts sum across a window rather than replacing', () => {
  const panes = '@1 %1\n@1 %2\n@2 %3\n'
  const perPane = new Map([['%1', 2], ['%2', 2], ['%3', 1]])
  const sums = windowSums(panes, perPane)
  assert.strictEqual(sums.get('@1'), 4, 'two panes with two each is four')
  assert.strictEqual(sums.get('@2'), 1)
})

// A window with no subagents must have no entry at all, not an entry of zero:
// the tick writes `subs.get(id) || null` and a null UNSETS the option, so a
// zero entry and a missing one behave the same there -- but the sidebar reads
// the option directly and would render a "+0" tag. Sabotage: in windowSums
// replace `const n = paneCount.get(paneId); if (n)` with
// `const n = paneCount.get(paneId) || 0; if (n !== undefined)` -- every window
// gains a zero entry and this fails.
test('windowSums reports nothing for panes with no subagents', () => {
  assert.strictEqual(windowSums('', new Map()).size, 0)
  const sums = windowSums('@1 %1\n@2 %2\n', new Map([['%1', 0]]))
  assert.strictEqual(sums.size, 0, 'a zero count must not create a window entry')
})
