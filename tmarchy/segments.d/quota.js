// Plan-quota warning: how close the account is to its Claude limits.
//
// Modelled on agents.js, which is the pattern for "say nothing unless there is
// something to react to": summarise() returns a short string or null, and
// bar.conf wraps the slot in #{?#{@bar-quota},...,} so an unset option renders
// nothing at all -- no label, no gap. Below the threshold this segment is
// invisible, which is the point. A number that is always there is furniture.
//
// Urgency lives in the WORDS, not the colour, exactly as "1 waiting" does. That
// is deliberate: @theme-busy means "an agent is working" and @theme-wait means
// "an agent needs you", and borrowing either for a quota warning would overload
// a state name with a severity it does not describe. The ten-option theme
// vocabulary has no warning colour, and following this pattern means it needs
// none.
//
// Unlike agents.js this is NOT per-window. An agent belongs to a window, so
// that segment counts windows; quota belongs to the ACCOUNT and is the same
// number whichever window is focused, however many sessions are running. One
// cache file, one global.
'use strict'

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawn } = require('node:child_process')

const STATE_DIR = process.env.TMARCHY_STATE_DIR ||
  path.join(os.homedir(), '.local', 'state', 'tmarchy')
const CACHE = path.join(STATE_DIR, 'claude-usage.json')
const LOCK = path.join(STATE_DIR, 'claude-usage.lock')
const REFRESHER = path.join(__dirname, '..', 'bin', 'tmarchy-usage')

// Quota moves slowly and this is someone else's API: minutes, not seconds.
const REFRESH_MS = 10 * 60 * 1000
// Past this the cached number is not worth showing. A warning based on an hour
// old reading is worse than no warning, because it reads as current.
const STALE_MS = 45 * 60 * 1000
// Two spawns can only overlap inside this window, since the refresher stamps
// fetched_at even when it fails.
const LOCK_MS = 60 * 1000
const DEFAULT_THRESHOLD = 80
// Per bucket, because they mean different things. The five-hour window is the
// one that interrupts work already in progress -- by the time it reads 80%
// there is often not enough left to finish what you are doing -- so it warns
// earlier. The weekly window is a planning number rather than an interruption,
// so it keeps the later threshold.
const THRESHOLDS = { five_hour: 60 }

// `thresholds` accepts a number (uniform, used by the tests), an object keyed by
// bucket with an optional `default`, or nothing at all for the table above.
function thresholdFor(name, thresholds) {
  if (typeof thresholds === 'number') return thresholds
  if (thresholds && typeof thresholds === 'object') {
    if (typeof thresholds[name] === 'number') return thresholds[name]
    if (typeof thresholds.default === 'number') return thresholds.default
  }
  return name in THRESHOLDS ? THRESHOLDS[name] : DEFAULT_THRESHOLD
}

// Short, and named. Account scope removes the "whose" question but not the
// "which limit" one: a bare percentage is ambiguous between the five-hour and
// weekly windows, and those call for very different reactions.
const LABELS = {
  five_hour: '5h',
  seven_day: 'week',
  seven_day_opus: 'opus wk',
  seven_day_sonnet: 'sonnet wk',
}

// record: the parsed cache file. Returns a string to display, or null.
function summarise(record, thresholds, now = Date.now()) {
  if (!record || !record.ok || !record.buckets) return null
  // A stale reading must not be presented as current.
  if (record.fetched_at && now - record.fetched_at > STALE_MS) return null

  // Only buckets that have crossed THEIR OWN threshold are candidates; among
  // those, the highest utilization wins. Comparing raw utilization before
  // applying thresholds would let a weekly reading at 70% mask a five-hour one
  // at 65% that is actually the urgent one.
  let worst = null
  for (const [name, bucket] of Object.entries(record.buckets)) {
    if (!bucket || typeof bucket.utilization !== 'number') continue
    if (bucket.utilization < thresholdFor(name, thresholds)) continue
    if (!worst || bucket.utilization > worst.utilization) {
      worst = { name, utilization: bucket.utilization }
    }
  }
  if (!worst) return null
  const label = LABELS[worst.name] || worst.name
  return `${label} ${Math.round(worst.utilization)}%`
}

function readCache() {
  try {
    return JSON.parse(fs.readFileSync(CACHE, 'utf8'))
  } catch {
    return null
  }
}

// Fire and forget. The tick must never wait on the network, so this starts the
// refresher detached and returns immediately; the value it fetches is picked up
// by a later tick, from the file.
function maybeRefresh(record, now = Date.now()) {
  const fetched = record && record.fetched_at
  if (fetched && now - fetched < REFRESH_MS) return false
  try {
    // A second guard for the small window between spawning and the first
    // write: without it, every tick in that gap would spawn another.
    const lockAge = now - fs.statSync(LOCK).mtimeMs
    if (lockAge < LOCK_MS) return false
  } catch {
    // No lock file yet, which is the normal first-run case.
  }
  try {
    fs.mkdirSync(STATE_DIR, { recursive: true })
    fs.writeFileSync(LOCK, String(now))
    const child = spawn(process.execPath, [REFRESHER], {
      detached: true,
      stdio: 'ignore',
    })
    child.unref()
    return true
  } catch {
    return false
  }
}

module.exports = {
  name: 'quota',
  summarise,
  thresholdFor,
  THRESHOLDS,
  maybeRefresh,
  enabled: () => fs.existsSync(REFRESHER),
  render: () => {
    const record = readCache()
    maybeRefresh(record)
    return summarise(record)
  },
}
