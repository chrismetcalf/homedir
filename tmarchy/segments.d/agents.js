// Agent summary: the successor to tmux-powerline's tmux_scout segment.
// Deliberately redundant with the per-tab dots — the dots answer "which
// window", this answers "is anything waiting on me" without reading the tabs.
//
// Counts come from lib/scout.js so the summary and the per-tab dots can never
// disagree: they are the same numbers, from the same call. This segment used to
// parse ~/.tmux-scout/status.json itself, and that second reading had already
// drifted from the tab mapping in three ways — no pane-content fallback for
// sessions started before the PermissionRequest hook existed, an ad-hoc
// `endedAt` liveness filter instead of scout's own getActiveSessions() (which
// also checks pane binding, pane and pid liveness, and a grace window), and no
// per-pane dedup. The visible symptom of that drift is the bar contradicting
// itself: a tab tinted red for wait while the summary reports nothing waiting.
const { scoutStates } = require('../lib/scout')

// states: the Map<windowId, state> that scoutStates() returns.
function summarise(states) {
  const values = [...states.values()]
  const waiting = values.filter(s => s === 'wait').length
  if (waiting) return `${waiting} waiting`
  const busy = values.filter(s => s === 'busy').length
  if (busy) return `${busy} busy`
  return null
}

module.exports = {
  name: 'agents',
  summarise,
  enabled: () => true, // scoutStates() returns an empty Map when scout is absent
  render: () => summarise(scoutStates()),
}
