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

function paneStates(active) {
  const paneState = new Map()
  for (const s of active) {
    if (!s.tmuxPane) continue
    // tmux-scout >= the 2025 refactor expresses state via `phase`; older builds
    // only set `status`. Map both so tinting survives the upgrade.
    const phase = s.phase || ''
    // Mirrors scout's own isNeedsAttention(). Deliberately NOT a
    // pendingToolUse-age heuristic: that painted merely-busy panes red.
    const waiting = !!(s.needsAttention || s.pendingInteraction
      || phase === 'waitingForApproval' || phase === 'waitingForAnswer')
    let state
    if (waiting) state = 'wait'
    else if (phase) {
      // phase is authoritative when present (status can lag behind it)
      if (phase === 'running') state = 'busy'
      else if (phase === 'completed') state = 'done'
      else if (phase === 'idle') state = 'idle'
      else continue // crashed/stale/interrupted — leave untinted
    } else if (s.status === 'working') state = 'busy'
    else if (s.status === 'completed') state = 'done'
    else if (s.status === 'idle') state = 'idle'
    else continue

    const prev = paneState.get(s.tmuxPane)
    if (!prev || PRIO[state] > PRIO[prev]) paneState.set(s.tmuxPane, state)
  }

  // Pane-content fallback: scout only learns of a permission prompt via its
  // PermissionRequest hook, which never fires for sessions started before that
  // hook existed, or when scout has latched an interrupted/stale phase. One
  // capture-pane per agent pane per tick.
  for (const s of active) {
    const pane = s.tmuxPane
    if (!pane || paneState.get(pane) === 'wait') continue
    if (paneIsPrompting(tmux(['capture-pane', '-p', '-t', pane]))) {
      paneState.set(pane, 'wait')
    }
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
  if (!scoutDir || !fs.existsSync(scoutDir)) return new Map()

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

  const paneState = paneStates(render.getActiveSessions(cached.status, cached.panes))
  return windowStates(tmux(['list-panes', '-a', '-F', '#{window_id} #{pane_id}']), paneState)
}

// Memoized for the life of the process. The ticker and the agents segment both
// want this, and two calls ~130ms apart would take two independent snapshots of
// a file another process rewrites continuously, plus two independent
// capture-pane sweeps — so the tab colours and the summary would share a
// mapping but not a snapshot, and could disagree. One call per tick makes them
// literally the same numbers, and halves the ticker's fork count into the
// bargain. There is no cross-tick cache: the process exits in a few hundred ms.
let memo // undefined = not computed yet; null is a legitimate computed value

function scoutStates() {
  if (memo === undefined) memo = computeScoutStates()
  return memo
}

function resetScoutStates() {
  memo = undefined
}

module.exports = {
  scoutStates,
  resetScoutStates,
  computeScoutStates,
  windowStates,
  paneIsPrompting,
  paneStates,
  PRIO,
}
