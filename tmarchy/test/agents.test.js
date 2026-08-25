const test = require('node:test')
const assert = require('node:assert')
const { summarise, parseStatus } = require('../segments.d/agents')

test('reports nothing when no agents are running', () => {
  assert.strictEqual(summarise([]), null)
})

test('waiting agents outrank busy ones', () => {
  const sessions = [
    { state: 'busy' }, { state: 'busy' }, { state: 'wait' },
  ]
  assert.strictEqual(summarise(sessions), '1 waiting')
})

test('falls back to a busy count when nothing waits', () => {
  assert.strictEqual(summarise([{ state: 'busy' }, { state: 'busy' }]), '2 busy')
})

test('idle-only agents produce nothing to show', () => {
  assert.strictEqual(summarise([{ state: 'idle' }, { state: 'done' }]), null)
})

// Fixture modeled on the live ~/.tmux-scout/status.json on this box (inspected
// 2026-08-25): `sessions` is an OBJECT keyed by sessionId, not an array, and
// carries decades of history — most entries are long-ended. State comes from
// `phase` (authoritative) or `status` as a fallback, same as
// bin/tmux-scout-window-tint's mapping, and `needsAttention`/`pendingInteraction`
// mean "waiting" regardless of phase.
const fixtureStatus = {
  version: 1,
  lastUpdated: 1787679777507,
  sessions: {
    'session-waiting': {
      endedAt: null,
      status: 'working',
      phase: 'waitingForApproval',
      needsAttention: true,
      pendingInteraction: null,
    },
    'session-busy': {
      endedAt: null,
      status: 'working',
      phase: 'running',
      needsAttention: null,
      pendingInteraction: null,
    },
    'session-idle': {
      endedAt: null,
      status: 'idle',
      phase: 'idle',
      needsAttention: null,
      pendingInteraction: null,
    },
    'session-done': {
      endedAt: null,
      status: 'completed',
      phase: 'completed',
      needsAttention: null,
      pendingInteraction: null,
    },
    'session-interrupted': {
      // No wait/busy/done/idle mapping for this phase — must be dropped,
      // not miscounted as busy.
      endedAt: null,
      status: 'interrupted',
      phase: 'interrupted',
      needsAttention: null,
      pendingInteraction: null,
    },
    'session-long-ended': {
      // The bulk of real status.json entries: a finished session that is
      // still sitting in the file. Must not count toward a "live" summary.
      endedAt: 1787594412705,
      status: 'completed',
      phase: 'completed',
      needsAttention: null,
      pendingInteraction: null,
    },
  },
}

test('parseStatus maps the real object-of-sessions shape, dropping ended and unmapped sessions', () => {
  const sessions = parseStatus(fixtureStatus)
  assert.deepStrictEqual(
    sessions.map(s => s.state).sort(),
    ['busy', 'done', 'idle', 'wait'],
  )
})

test('parseStatus feeds summarise() correctly end-to-end on the real shape', () => {
  assert.strictEqual(summarise(parseStatus(fixtureStatus)), '1 waiting')
})

test('parseStatus tolerates a missing or malformed sessions field', () => {
  assert.deepStrictEqual(parseStatus({}), [])
  assert.deepStrictEqual(parseStatus({ sessions: [] }), [])
  assert.deepStrictEqual(parseStatus(null), [])
})
