const test = require('node:test')
const assert = require('node:assert')
const { summarise } = require('../segments.d/agents')

// summarise() now takes the Map that lib/scout.js scoutStates() returns —
// window id -> state — rather than a second, independently parsed reading of
// status.json. The fixture tests for parseStatus() are gone with the function:
// the mapping they pinned now lives in test/scout.test.js, exercised through
// paneStates(), so there is exactly one place where scout's vocabulary is
// interpreted and the summary cannot disagree with the tab colours.
const states = (...pairs) => new Map(pairs.map((s, i) => [`@${i + 1}`, s]))

test('reports nothing when no agents are running', () => {
  assert.strictEqual(summarise(new Map()), null)
})

test('waiting agents outrank busy ones', () => {
  assert.strictEqual(summarise(states('busy', 'busy', 'wait')), '1 waiting')
})

test('falls back to a busy count when nothing waits', () => {
  assert.strictEqual(summarise(states('busy', 'busy')), '2 busy')
})

test('idle-only agents produce nothing to show', () => {
  assert.strictEqual(summarise(states('idle', 'done')), null)
})

test('counts every waiting window, not just the first', () => {
  assert.strictEqual(summarise(states('wait', 'busy', 'wait')), '2 waiting')
})
