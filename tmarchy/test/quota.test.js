const test = require('node:test')
const assert = require('node:assert')
const { summarise } = require('../segments.d/quota')

const NOW = 1_800_000_000_000

function rec(buckets, extra = {}) {
  return { fetched_at: NOW, ok: true, buckets, ...extra }
}

test('nothing at all below the threshold', () => {
  // The whole point: silence is how this bar says "nothing to react to".
  assert.strictEqual(summarise(rec({ five_hour: { utilization: 2 } }), 80, NOW), null)
  assert.strictEqual(summarise(rec({ five_hour: { utilization: 79 } }), 80, NOW), null)
})

test('the threshold itself warns', () => {
  assert.strictEqual(summarise(rec({ five_hour: { utilization: 80 } }), 80, NOW), '5h 80%')
})

test('the bucket is named, not just the number', () => {
  // "5h 92%" and "week 92%" call for very different reactions.
  assert.strictEqual(summarise(rec({ seven_day: { utilization: 92 } }), 80, NOW), 'week 92%')
  assert.strictEqual(summarise(rec({ seven_day_opus: { utilization: 92 } }), 80, NOW), 'opus wk 92%')
})

test('the worst bucket wins, like waiting beats busy', () => {
  const r = rec({ five_hour: { utilization: 83 }, seven_day: { utilization: 95 } })
  assert.strictEqual(summarise(r, 80, NOW), 'week 95%')
})

test('a bucket below the threshold cannot mask one above it', () => {
  const r = rec({ five_hour: { utilization: 5 }, seven_day: { utilization: 91 } })
  assert.strictEqual(summarise(r, 80, NOW), 'week 91%')
})

test('an unknown bucket name still renders rather than being dropped', () => {
  // The endpoint is undocumented; a new bucket must not vanish silently.
  assert.strictEqual(summarise(rec({ some_new_window: { utilization: 90 } }), 80, NOW), 'some_new_window 90%')
})

test('a stale reading is not presented as current', () => {
  // A warning based on an hour-old number reads as now, and is worse than none.
  const old = rec({ five_hour: { utilization: 99 } }, { fetched_at: NOW - 60 * 60 * 1000 })
  assert.strictEqual(summarise(old, 80, NOW), null)
})

test('a fresh reading just inside the window still counts', () => {
  const r = rec({ five_hour: { utilization: 99 } }, { fetched_at: NOW - 40 * 60 * 1000 })
  assert.strictEqual(summarise(r, 80, NOW), '5h 99%')
})

test('a failed fetch shows nothing rather than a wrong number', () => {
  const failed = { fetched_at: NOW, ok: false, error: 'http 500', buckets: {} }
  assert.strictEqual(summarise(failed, 80, NOW), null)
})

test('missing, empty and malformed records are all silent', () => {
  assert.strictEqual(summarise(null, 80, NOW), null)
  assert.strictEqual(summarise({}, 80, NOW), null)
  assert.strictEqual(summarise(rec({}), 80, NOW), null)
  assert.strictEqual(summarise(rec({ five_hour: null }), 80, NOW), null)
  assert.strictEqual(summarise(rec({ five_hour: { utilization: 'lots' } }), 80, NOW), null)
})

test('utilization is rounded, not truncated to a decimal', () => {
  assert.strictEqual(summarise(rec({ five_hour: { utilization: 92.6 } }), 80, NOW), '5h 93%')
})
