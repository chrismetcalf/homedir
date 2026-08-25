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

function scoutStates() {
  const scoutDir = tmux(['show-env', '-g', 'SCOUT_DIR']).replace(/^SCOUT_DIR=/m, '').trim()
  if (!scoutDir || !fs.existsSync(scoutDir)) return new Map()

  let sync, render
  try {
    sync = require(path.join(scoutDir, 'scripts/picker/sync'))
    render = require(path.join(scoutDir, 'scripts/picker/render'))
  } catch {
    return new Map()
  }

  const statusFile = path.join(process.env.HOME || '', '.tmux-scout/status.json')
  let cached
  try {
    cached = sync.run(statusFile)
  } catch {
    return new Map()
  }
  if (!cached || !cached.status) return new Map()

  const paneState = paneStates(render.getActiveSessions(cached.status, cached.panes))

  const panesRaw = tmux(['list-panes', '-a', '-F', '#{window_id} #{pane_id}']).trim()
  if (!panesRaw) return new Map()

  const winState = new Map()
  for (const line of panesRaw.split('\n')) {
    const [winId, paneId] = line.split(' ')
    if (!winId) continue
    const state = paneState.get(paneId)
    if (!state) continue
    const prev = winState.get(winId)
    if (!prev || PRIO[state] > PRIO[prev]) winState.set(winId, state)
  }
  return winState
}

module.exports = { scoutStates, paneIsPrompting, paneStates, PRIO }
