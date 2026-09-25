// Token meter: what this machine has actually spent, over 1h and 12h.
//
// The fallback for a host where the plan quota cannot work. quota.js and
// usage.js both read GET /api/oauth/usage, authenticated with the OAuth token
// in ~/.claude/.credentials.json; a host authenticated per-token has no such
// file and no plan percentage to report. That slot then stays empty forever,
// with nothing on screen to say why — which is the failure this segment fixes,
// by answering the same question ("how much am I burning") from data every host
// has: Claude Code's own transcripts. See bin/tmarchy-tokens for the counting.
//
// THE GATE IS THE QUOTA READING, NOT THE HOST. render() returns null whenever
// usage.js has a five-hour number to show, so the two never appear at once and
// the choice needs no per-host configuration — it is the "auto" behaviour
// asked for.
//
// Keying on the absence of ~/.claude/.credentials.json would have been the
// tidier-looking predicate and is the wrong one: the usage endpoint is
// undocumented and may vanish, and on the day it does, a credentials-keyed gate
// leaves the meter unreachable on exactly the host that has just lost its
// number. Reading the outcome rather than the cause covers both.
//
// The cost is a possible flicker: a transient fetch failure on a subscription
// host swaps the percentage for the meter for an interval or two. That is
// acceptable in a way the reverse is not — both readings are true statements
// about the machine, and the alternative trades a brief swap for a permanent
// blank.
//
// Unlike agents.js this is NOT per-window, for quota.js's reason: spend belongs
// to the machine, not to whichever window happens to be focused.
'use strict'

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawn } = require('node:child_process')
const { fiveHour, readCache: readQuota } = require('./quota')

const STATE_DIR = process.env.TMARCHY_STATE_DIR ||
  path.join(os.homedir(), '.local', 'state', 'tmarchy')
const CACHE = path.join(STATE_DIR, 'claude-tokens.json')
const LOCK = path.join(STATE_DIR, 'claude-tokens.lock')
const REFRESHER = path.join(__dirname, '..', 'bin', 'tmarchy-tokens')

// Two minutes, where quota.js uses ten. It can afford to be quicker because it
// costs nothing but local disk — no API, no token, nobody's rate limit — and it
// has to be, because the short window is an HOUR: a reading ten minutes behind
// would miss a sixth of what it claims to measure. Measured cost of one scan on
// this host: 0.9s across 67 files, detached, off the redraw path entirely.
const REFRESH_MS = 2 * 60 * 1000
// Past this the reading is not worth showing. Generous against REFRESH_MS so a
// single slow or skipped scan does not blank the slot, tight against the 1h
// window so what is on screen is still recognisably now.
const STALE_MS = 20 * 60 * 1000
const LOCK_MS = 60 * 1000

// Compact enough for a status line, and never more than five characters.
// Precision falls away as the magnitude rises, which is the resolution you
// would actually act on: the difference between 4.2M and 4.3M matters, the
// difference between 148M and 149M does not.
function humanTokens(n) {
  if (!Number.isFinite(n) || n < 0) return null
  if (n < 1000) return String(Math.round(n))
  if (n < 1e6) {
    const k = n / 1000
    return `${k < 10 ? k.toFixed(1) : Math.round(k)}k`
  }
  const m = n / 1e6
  return `${m < 10 ? m.toFixed(1) : Math.round(m)}M`
}

// record: the parsed cache file. Returns a string to display, or null.
function summarise(record, now = Date.now()) {
  if (!record || !record.ok || !record.windows) return null
  // A stale reading must not be presented as current — quota.js's rule, and it
  // matters more here, where the label literally says "1h".
  if (record.fetched_at && now - record.fetched_at > STALE_MS) return null

  // Every window at zero means nothing has run recently, and a row of zeroes is
  // furniture carrying no information. The slot renders nothing instead, the
  // same way an idle window gets no tint. A zero in the SHORT window alone is
  // kept — "1h 0 · 12h 31M" says you have stopped, which is worth saying.
  const values = Object.values(record.windows)
  if (!values.length || values.every((v) => !v)) return null

  const parts = []
  // Insertion order, which the refresher sets shortest-first: the number you
  // are most likely to be reacting to reads first.
  for (const name of Object.keys(record.windows)) {
    const value = humanTokens(record.windows[name])
    if (value === null) continue
    parts.push(`${name} ${value}`)
  }
  return parts.length ? parts.join(' · ') : null
}

function readCache() {
  try {
    return JSON.parse(fs.readFileSync(CACHE, 'utf8'))
  } catch {
    return null
  }
}

// Fire and forget, exactly as quota.js does it: the tick must never wait on a
// scan of several hundred files, so this starts the refresher detached and
// returns immediately. The value it computes is picked up by a later tick,
// from the file.
function maybeRefresh(record, now = Date.now()) {
  const fetched = record && record.fetched_at
  if (fetched && now - fetched < REFRESH_MS) return false
  try {
    // Covers the window between spawning and the first write, in which every
    // tick would otherwise spawn another scan.
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

// True when the plan percentage is unavailable, i.e. when this segment is the
// one that should speak. Exported so the test can pin the gate directly rather
// than inferring it from render()'s output.
function quotaUnavailable(now = Date.now()) {
  return fiveHour(readQuota(), now) === null
}

module.exports = {
  name: 'tokens',
  summarise,
  humanTokens,
  readCache,
  maybeRefresh,
  quotaUnavailable,
  STALE_MS,
  REFRESH_MS,
  enabled: () => fs.existsSync(REFRESHER),
  render: () => {
    if (!quotaUnavailable()) return null
    const record = readCache()
    maybeRefresh(record)
    return summarise(record)
  },
}
