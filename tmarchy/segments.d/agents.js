// Agent summary: the successor to tmux-powerline's tmux_scout segment.
// Deliberately redundant with the per-tab dots — the dots answer "which
// window", this answers "is anything waiting on me" without reading the tabs.
//
// The plan for this segment assumed status.json's `sessions` was an array of
// `{state}` objects. Inspecting the live file (~/.tmux-scout/status.json,
// 767KB, 58 entries) showed otherwise: `sessions` is an OBJECT keyed by
// sessionId, most entries are long-ended history (non-null `endedAt`) rather
// than live agents, and state isn't a single `state` field — it's `phase`
// (authoritative, values like running/idle/completed/waitingForApproval) with
// `status` as an older fallback (working/idle/completed), plus
// `needsAttention`/`pendingInteraction` as the real "waiting on the user"
// signal independent of phase. This mirrors the mapping already worked out in
// bin/tmux-scout-window-tint, which reads the same file via scout's own
// sync/render libraries — see that script for the fuller rationale (e.g. why
// there's no pendingToolUse-age heuristic).
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')

const STATUS_FILE = path.join(os.homedir(), '.tmux-scout', 'status.json')

function summarise(sessions) {
  const waiting = sessions.filter(s => s.state === 'wait').length
  if (waiting) return `${waiting} waiting`
  const busy = sessions.filter(s => s.state === 'busy').length
  if (busy) return `${busy} busy`
  return null
}

// Map one raw scout session record to our {wait,busy,done,idle} vocabulary,
// or null if it doesn't map (crashed/stale/interrupted — leave uncounted,
// same as window-tint's `continue`).
function mapState(s) {
  const phase = s.phase || ''
  const waiting = !!(s.needsAttention || s.pendingInteraction
    || phase === 'waitingForApproval' || phase === 'waitingForAnswer')
  if (waiting) return 'wait'
  if (phase) {
    if (phase === 'running') return 'busy'
    if (phase === 'completed') return 'done'
    if (phase === 'idle') return 'idle'
    return null
  }
  if (s.status === 'working') return 'busy'
  if (s.status === 'completed') return 'done'
  if (s.status === 'idle') return 'idle'
  return null
}

// Turn a parsed status.json document into the array of {state} objects
// summarise() expects. Tolerant of a missing/malformed `sessions` field so a
// scout version bump degrades to "nothing to show" instead of throwing — but
// that's the only tolerance this function offers. A torn/truncated read of
// status.json (it's written continuously by another process) fails earlier,
// in readSessions()'s JSON.parse, and relies entirely on lib/segments.js's
// per-segment try/catch to keep a bad tick from taking the bar with it.
//
// This mapping (mapState + the endedAt filter) duplicates the one in
// bin/tmux-scout-window-tint rather than sharing it — same phase/status
// priority, but no pane-content fallback, no dedup, and endedAt filtering
// standing in for scout's own getActiveSessions() liveness check. That's
// slated to be folded onto a shared lib/scout.js in Task 7; don't take the
// duplication here as a deliberate design choice.
function parseStatus(data) {
  const rawSessions = data && typeof data.sessions === 'object' && !Array.isArray(data.sessions)
    ? Object.values(data.sessions)
    : []
  return rawSessions
    .filter(s => s.endedAt == null) // only sessions still live
    .map(s => ({ state: mapState(s) }))
    .filter(s => s.state)
}

function readSessions() {
  const raw = JSON.parse(fs.readFileSync(STATUS_FILE, 'utf8'))
  return parseStatus(raw)
}

module.exports = {
  name: 'agents',
  summarise,
  parseStatus,
  enabled: () => fs.existsSync(STATUS_FILE),
  render: () => summarise(readSessions()),
}
