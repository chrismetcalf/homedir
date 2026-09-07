const test = require('node:test')
const assert = require('node:assert')
const { summarise, fiveHour, thresholdFor, THRESHOLDS } = require('../segments.d/quota')
const usage = require('../segments.d/usage')

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

// --- the always-on five-hour number (segments.d/usage.js) -------------------
//
// This is the slot that is NOT threshold-gated. Its whole job is to render when
// summarise() would not, so every assertion here pairs the two: a case where the
// warning is silent and the number is present is the only thing that proves they
// are independent.

test('usage: shows a number exactly where the warning stays silent', () => {
  const r = rec({ five_hour: { utilization: 12 } })
  assert.strictEqual(summarise(r, 80, NOW), null, 'warning must stay silent')
  assert.strictEqual(fiveHour(r, NOW), '5h 12%')
})

test('usage: pinned to five_hour, not to the worst bucket', () => {
  // The warning picks the worst bucket; this deliberately does not. A weekly
  // reading at 90% must not displace the five-hour number, or the always-on slot
  // would change which limit it describes depending on the day.
  const r = rec({ five_hour: { utilization: 12 }, seven_day: { utilization: 90 } })
  assert.strictEqual(summarise(r, 80, NOW), 'week 90%', 'warning still takes the worst')
  assert.strictEqual(fiveHour(r, NOW), '5h 12%', 'number stays on five_hour')
})

test('usage: a stale reading renders nothing, same rule as the warning', () => {
  // 45 minutes is the cutoff; an hour-old number presented as current is worse
  // than no number, and that has to hold for the informational slot too.
  const r = rec({ five_hour: { utilization: 12 } }, { fetched_at: NOW - 46 * 60 * 1000 })
  assert.strictEqual(fiveHour(r, NOW), null)
})

test('usage: nothing to say when the five-hour bucket is absent or broken', () => {
  assert.strictEqual(fiveHour(rec({ seven_day: { utilization: 40 } }), NOW), null)
  assert.strictEqual(fiveHour(rec({ five_hour: { utilization: 'lots' } }), NOW), null)
  assert.strictEqual(fiveHour(rec({}), NOW), null)
  assert.strictEqual(fiveHour(null, NOW), null)
  assert.strictEqual(fiveHour({ ok: false, buckets: {} }, NOW), null)
})

test('usage: is a segment named "usage", so the tick writes @bar-usage', () => {
  // tmarchy-tick keys the option off segment.name -- @bar-<name>. bar.conf reads
  // @bar-usage by that exact spelling, so a rename here silently empties the slot.
  assert.strictEqual(usage.name, 'usage')
  assert.strictEqual(typeof usage.render, 'function')
  assert.strictEqual(typeof usage.enabled, 'function')
})
