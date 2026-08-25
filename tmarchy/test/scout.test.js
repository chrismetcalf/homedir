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
  paneIsPrompting, paneStates, windowStates, scoutStates, resetScoutStates,
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
