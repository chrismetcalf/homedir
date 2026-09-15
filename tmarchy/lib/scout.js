// Scout state per window. Behaviour moved verbatim from the old
// bin/tmux-scout-window-tint (now tmarchy/bin/tmarchy-tick); only the early
// exits and the tmux call style changed, since this is now a library rather
// than a script. The `phase`-over-`status` precedence and the pane-content
// fallback are both scar tissue from real bugs — see CLAUDE.md — so they are
// reproduced as they were, not tidied.
const fs = require('node:fs')
const path = require('node:path')
const { tmux } = require('./tmux')

const PRIO = { wait: 4, busy: 3, done: 2, idle: 1 }

// Match only a LIVE dialog at the bottom of the screen, not prose higher up
// that merely quotes a prompt — an agent pane can print dialog-looking text.
// Claude's dialog draws a "❯ <n>." selector plus a footer hint; require both,
// within the last ~12 non-empty lines.
function paneIsPrompting(text) {
  const tail = text.split('\n').map(l => l.replace(/\s+$/, '')).filter(Boolean).slice(-12)
  const hasSelector = tail.some(l => /^\s*❯\s*\d+\.\s/.test(l))
  const hasFooter = tail.some(l =>
    /Esc to (cancel|reject)|Tab to amend|shift\+tab\)|allow all edits|don.t ask again/.test(l))
  return hasSelector && hasFooter
}

// The single definition of what an agent session's state IS. Three consumers
// call it: paneStates() below, bin/tmux-scout-next-wait, and bin/tmux-agents-rows.
//
// It lived in two places before -- here and in next-wait -- byte-identical,
// comment included, and stayed in sync by luck. Drift would be invisible in the
// worst way: the bar tints a window red while the picker calls it idle.
//
// Deliberately NOT a pendingToolUse-age heuristic. That painted merely-busy
// panes red: a long-running tool is not the user being asked something.
//
// Pure function of one session object -- no tmux calls, no file reads -- so a
// consumer needs only JSON.parse, not scout's own sync/render modules.
function sessionState(s) {
  const phase = s.phase || ''
  if (s.needsAttention || s.pendingInteraction
    || phase === 'waitingForApproval' || phase === 'waitingForAnswer') return 'wait'
  if (phase) {
    // phase is authoritative when present (status can lag behind it)
    if (phase === 'running') return 'busy'
    if (phase === 'completed') return 'done'
    if (phase === 'idle') return 'idle'
    return null // crashed/stale/interrupted — not an answer
  }
  if (s.status === 'working') return 'busy'
  if (s.status === 'completed') return 'done'
  if (s.status === 'idle') return 'idle'
  return null
}

// Is this session gone? scout says so by setting staleReason, and that flag CAN
// BE WRONG in the direction that hurts: it marks a pane gone whenever the
// tmux server it happened to ask did not have that pane. Ask a different
// server -- a scratch one from a test, a second socket -- and every live
// session on the real one is declared dead. Observed for real: this repo's own
// end-to-end test pointed a tick at a throwaway socket without isolating HOME,
// and scout wrote `pane %2 no longer exists` about the pane the session was
// actively running in. One of eight stale flags was wrong, and it was the only
// session doing anything.
//
// The pane list is AUTHORITATIVE for existence, so a live pane refutes the
// claim. Deliberately narrow: only a paneGone claim is refuted, because scout
// has other reasons for calling a session stale and those are not about
// whether a pane exists. `endedAt` is a different assertion -- the session
// finished -- and stands regardless.
//
// livePanes may be null (no tmux, or the query failed), in which case there is
// nothing to refute the flag with and it is believed, which is the old
// behaviour and the right fallback.
function claimsPaneGone(session) {
  return session.terminalKind === 'paneGone' ||
    /no longer exists/.test(String(session.staleReason || ''))
}

function isStale(session, livePanes) {
  if (!session || !session.tmuxPane) return true
  if (session.endedAt) return true
  if (!session.staleReason) return false
  if (claimsPaneGone(session) && livePanes && livePanes.has(session.tmuxPane)) return false
  return true
}

// How many subagents a session is actually running.
//
// scout records them in `activeSubagents`, and THAT ARRAY LEAKS. It never
// clears entries when the parent finishes, so a session that ended yesterday
// still lists its Task subagents as `phase: "running"` forever. Measured on
// this host: 20 records claiming to be running, of which **19 belonged to
// sessions that were already dead**. Counting the array as written would peg
// every consumer at maximum permanently -- the screensaver's solid would
// breathe flat out on an idle machine.
//
// Two filters, and both are needed. The caller must already have established
// that the PARENT is live (isStale above), because a finished session's
// subagents are finished by definition and that is where 19 of the 20 came
// from. And each record must have reported activity recently: a subagent that
// has not touched a tool in two minutes is either done or wedged, and either
// way is not something to animate.
const SUBAGENT_FRESH_MS = 2 * 60 * 1000

function subagentCount(session, now = Date.now()) {
  const subs = session && Array.isArray(session.activeSubagents) ? session.activeSubagents : []
  let n = 0
  for (const sub of subs) {
    if (!sub || sub.phase !== 'running') continue
    if (!sub.updatedAt || now - sub.updatedAt > SUBAGENT_FRESH_MS) continue
    n++
  }
  return n
}

// Is this pane's agent mid-turn? The counterpart to paneIsPrompting, and it
// exists for the same reason: scout only learns what a session is doing from
// hooks, and a session it found by SCANNING TMUX PANES has never fired one.
// Those get `phase: 'idle'` as a DEFAULT -- it means "never heard from", not
// "not working" -- and every surface believed it. Measured here: five of six
// live agents had `lastHookAt: null` and `lastEvent.type: 'discovered'`, so an
// agent that was genuinely running read as idle, tinted nothing, and did not
// move the screensaver's spin or breath.
//
// The marker is the live status line Claude Code draws while a turn is in
// flight:
//
//     · Frolicking… (1m 43s · ↓ 4.6k tokens)      <- working
//     ✻ Worked for 1m 16s · done 8:36 PM          <- finished, and stays on screen
//
// So the test is the ELLIPSIS followed by a parenthesised running clock, which
// the finished line does not have. Matching the spinner glyph would be wrong --
// Claude Code cycles through several and they appear on the finished line too --
// and matching a duration alone would match the finished line exactly.
//
// Only the last dozen non-blank lines, exactly as paneIsPrompting does, so a
// transcript quoting one of these does not count as live.
function paneIsWorking(text) {
  const tail = text.split('\n').map((l) => l.replace(/\s+$/, '')).filter(Boolean).slice(-12)
  return tail.some((l) =>
    /\u2026\s*\((?:\d+h\s*)?(?:\d+m\s*)?\d+s\b/.test(l) || /esc to interrupt/i.test(l))
}

function paneStates(active) {
  const paneState = new Map()
  for (const s of active) {
    if (!s.tmuxPane) continue
    // tmux-scout >= the 2025 refactor expresses state via `phase`; older builds
    // only set `status`. Map both so tinting survives the upgrade.
    const state = sessionState(s)
    if (!state) continue

    const prev = paneState.get(s.tmuxPane)
    if (!prev || PRIO[state] > PRIO[prev]) paneState.set(s.tmuxPane, state)
  }

  // Pane-content fallback: scout only learns what a session is doing from its
  // hooks, which never fire for a session started before the hook existed or
  // one scout discovered by scanning panes. ONE capture-pane per agent pane per
  // tick, feeding BOTH tests -- capturing twice would double the fork cost this
  // whole design exists to avoid, and would read two different moments.
  for (const s of active) {
    const pane = s.tmuxPane
    if (!pane || paneState.get(pane) === 'wait') continue
    const text = tmux(['capture-pane', '-p', '-t', pane])
    if (paneIsPrompting(text)) {
      paneState.set(pane, 'wait')
      continue
    }
    // Only ever an UPGRADE: a session scout can see is running stays running,
    // and one it calls done is not demoted because its finished line scrolled
    // off. This rescues exactly the case the scrape exists for -- idle-by-
    // default, or no opinion at all.
    const known = paneState.get(pane)
    if ((!known || known === 'idle') && paneIsWorking(text)) paneState.set(pane, 'busy')
  }
  return paneState
}

// Roll pane states up to their windows, highest priority winning. Returns null
// when the pane list is empty, which is not an answer: a live tmux server always
// has at least one pane, so an empty result means the query failed.
function windowStates(panesRaw, paneState) {
  const raw = panesRaw.trim()
  if (!raw) return null

  const winState = new Map()
  for (const line of raw.split('\n')) {
    const [winId, paneId] = line.split(' ')
    if (!winId) continue
    const state = paneState.get(paneId)
    if (!state) continue
    const prev = winState.get(winId)
    if (!prev || PRIO[state] > PRIO[prev]) winState.set(winId, state)
  }
  return winState
}

// Returns a Map<windowId, state>, or null when scout could not be read at all.
//
// The distinction matters because callers unset @scout-state for every window
// the Map does not mention. That is right for a genuine zero ("scout is
// installed and nothing is running", "scout is not installed at all") and wrong
// for a failure ("scout blipped this tick"), where clearing every tint means
// acting on no information. Unsetting stays the DEFAULT — a frozen `wait` tint
// is worse than a five-second flicker, because prefix+~ navigates by wait state
// and a stale red tab sends you to a pane that is not asking anything, the same
// failure class that got the pendingToolUse heuristic deleted (see CLAUDE.md).
// null is reserved for the cases where we genuinely learned nothing.
function computeScoutStates() {
  const scoutDir = tmux(['show-env', '-g', 'SCOUT_DIR']).replace(/^SCOUT_DIR=/m, '').trim()
  // Scout absent, rather than unreadable: a genuine zero. Any tint still on a
  // window is left over from a scout that is no longer there, so clear it.
  if (!scoutDir || !fs.existsSync(scoutDir)) return { states: new Map(), subs: new Map() }

  let sync, render
  try {
    sync = require(path.join(scoutDir, 'scripts/picker/sync'))
    render = require(path.join(scoutDir, 'scripts/picker/render'))
  } catch {
    return null // scout is there but its libraries would not load
  }

  const statusFile = path.join(process.env.HOME || '', '.tmux-scout/status.json')
  let cached
  try {
    cached = sync.run(statusFile)
  } catch {
    return null // torn read, bad JSON, transient I/O — no information
  }
  if (!cached || !cached.status) return null

  const active = render.getActiveSessions(cached.status, cached.panes)
  const paneState = paneStates(active)

  // Subagents per pane, rolled up from the same snapshot the tints come from.
  // getActiveSessions has already dropped the sessions scout considers finished,
  // which is the parent-liveness half of subagentCount's filter.
  const paneSubs = new Map()
  for (const s of active) {
    if (!s.tmuxPane) continue
    const n = subagentCount(s)
    if (n) paneSubs.set(s.tmuxPane, (paneSubs.get(s.tmuxPane) || 0) + n)
  }

  // ONE list-panes for both rollups. Two calls would be two forks and, worse,
  // two snapshots of a pane list another process is changing underneath us.
  const panesRaw = tmux(['list-panes', '-a', '-F', '#{window_id} #{pane_id}'])
  return {
    states: windowStates(panesRaw, paneState),
    subs: windowSums(panesRaw, paneSubs),
  }
}

// Roll per-pane counts up to their windows by SUMMING -- unlike states, which
// take the highest priority. A window with two agent panes running two
// subagents each is running four, not two.
function windowSums(panesRaw, paneCount) {
  const raw = panesRaw.trim()
  if (!raw) return new Map()
  const out = new Map()
  for (const line of raw.split('\n')) {
    const [winId, paneId] = line.split(' ')
    if (!winId) continue
    const n = paneCount.get(paneId)
    if (n) out.set(winId, (out.get(winId) || 0) + n)
  }
  return out
}

// Memoized for the life of the process. The ticker and the agents segment both
// want this, and two calls ~130ms apart would take two independent snapshots of
// a file another process rewrites continuously, plus two independent
// capture-pane sweeps — so the tab colours and the summary would share a
// mapping but not a snapshot, and could disagree. One call per tick makes them
// literally the same numbers, and halves the ticker's fork count into the
// bargain. There is no cross-tick cache: the process exits in a few hundred ms.
let memo // undefined = not computed yet; null is a legitimate computed value

function scoutAll() {
  if (memo === undefined) memo = computeScoutStates()
  return memo
}

// Kept returning a bare Map (or null) because every existing caller expects
// one: the tick's tints, the agents segment, the pickers. The subagent counts
// ride alongside in the same memoized snapshot rather than in a second read,
// so the two can never describe different moments.
function scoutStates() {
  const all = scoutAll()
  return all === null ? null : all.states
}

function scoutSubagents() {
  const all = scoutAll()
  return all === null ? null : all.subs
}

function resetScoutStates() {
  memo = undefined
}

module.exports = {
  scoutStates,
  scoutSubagents,
  windowSums,
  resetScoutStates,
  computeScoutStates,
  windowStates,
  paneIsPrompting,
  paneIsWorking,
  paneStates,
  sessionState,
  isStale,
  claimsPaneGone,
  subagentCount,
  SUBAGENT_FRESH_MS,
  PRIO,
}
