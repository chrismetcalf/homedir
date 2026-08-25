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

const { paneIsPrompting, paneStates } = require('../lib/scout')

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
