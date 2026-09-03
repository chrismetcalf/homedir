const test = require('node:test')
const assert = require('node:assert')
const { summarise, thresholdFor, THRESHOLDS } = require('../segments.d/quota')

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

test('the five-hour bucket warns earlier than the rest', () => {
  // It is the one that interrupts work in progress.
  assert.strictEqual(thresholdFor('five_hour'), 60)
  assert.strictEqual(thresholdFor('seven_day'), 80)
  assert.strictEqual(thresholdFor('seven_day_opus'), 80)
  assert.strictEqual(thresholdFor('some_future_bucket'), 80)
})

test('five_hour warns at 60 with the defaults', () => {
  assert.strictEqual(summarise(rec({ five_hour: { utilization: 60 } }), undefined, NOW), '5h 60%')
  assert.strictEqual(summarise(rec({ five_hour: { utilization: 59 } }), undefined, NOW), null)
})

test('the weekly bucket still holds out until 80', () => {
  assert.strictEqual(summarise(rec({ seven_day: { utilization: 65 } }), undefined, NOW), null)
  assert.strictEqual(summarise(rec({ seven_day: { utilization: 80 } }), undefined, NOW), 'week 80%')
})

test('a higher bucket under ITS threshold cannot mask a lower one over its own', () => {
  // The regression this restructure prevents: picking the highest utilization
  // first and comparing afterwards would choose seven_day at 70, find it under
  // 80, and report nothing -- silently swallowing a five-hour warning at 65.
  const r = rec({ five_hour: { utilization: 65 }, seven_day: { utilization: 70 } })
  assert.strictEqual(summarise(r, undefined, NOW), '5h 65%')
})

test('when both have crossed, the higher utilization wins', () => {
  const r = rec({ five_hour: { utilization: 88 }, seven_day: { utilization: 93 } })
  assert.strictEqual(summarise(r, undefined, NOW), 'week 93%')
})

test('an explicit number still applies uniformly, for callers that want that', () => {
  assert.strictEqual(summarise(rec({ five_hour: { utilization: 65 } }), 80, NOW), null)
})

test('an object override can set one bucket or a default', () => {
  const r = rec({ five_hour: { utilization: 55 } })
  assert.strictEqual(summarise(r, { five_hour: 50 }, NOW), '5h 55%')
  assert.strictEqual(summarise(r, { default: 50 }, NOW), '5h 55%')
  assert.strictEqual(summarise(r, { five_hour: 90 }, NOW), null)
})

test('the threshold table names only what differs from the default', () => {
  // Keeps the intent readable: anything absent is the ordinary 80.
  assert.deepStrictEqual(Object.keys(THRESHOLDS), ['five_hour'])
})
