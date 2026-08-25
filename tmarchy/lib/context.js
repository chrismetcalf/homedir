// One tmux query produces everything the segments need, so segments never
// shell out themselves.
//
// lib/tmux.js returns '' both for "the command printed nothing" and for "the
// command failed", and those two mean different things here. An empty
// list-windows is harmless: no windows, no ops, every window option keeps its
// previous value. An empty display-message is NOT harmless — a live pane always
// has a pid, so '' can only mean the query failed, yet it parses into a context
// that looks exactly like "not in a repo, not over ssh". Acting on that would
// unset @bar-branch/@bar-remote, contradicting the ticker's rule that a failed
// tick leaves options where they were. hasContext() is the discriminator the
// ticker checks before it writes any global option.
const { tmux } = require('./tmux')

const PANE_FORMAT = '#{pane_current_path} #{pane_current_command} #{pane_pid}'
const WINDOW_FORMAT = '#{window_id} #{pane_current_command} #{pane_pid}'

function parseContext(out) {
  const [panePath = null, paneCommand = null, panePid = null] =
    out.trim().length ? out.trim().split(' ') : []
  return { panePath, paneCommand, panePid }
}

function parseWindows(out) {
  return out
    .split('\n')
    .filter(Boolean)
    .map(line => {
      const [id, command, pid] = line.split(' ')
      return { id, command, pid }
    })
}

// False when the pane query produced nothing, i.e. tmux failed or there is no
// client to ask. Callers should skip their writes rather than treat it as data.
function hasContext(ctx) {
  return !!(ctx && ctx.panePid)
}

function currentContext() {
  return parseContext(tmux(['display-message', '-p', PANE_FORMAT]))
}

function allWindows() {
  return parseWindows(tmux(['list-windows', '-a', '-F', WINDOW_FORMAT]))
}

module.exports = {
  parseContext,
  parseWindows,
  hasContext,
  currentContext,
  allWindows,
  PANE_FORMAT,
  WINDOW_FORMAT,
}
