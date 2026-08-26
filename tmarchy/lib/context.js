// One tmux query produces everything the segments need, so segments never
// shell out themselves.
//
// TAB-separated, never space-separated. `#{pane_current_path}` is arbitrary
// user data — this user's vault alone holds directories like
// "00.10 - Projects Backup" — so splitting on a space silently mis-assigns
// every field: "/home/me/my project zsh 123" parses as path "/home/me/my",
// command "project", pid "zsh". That is worse than a failure, because
// hasContext() sees a non-empty pid and the branch segment then resolves a
// truncated path, which can land inside a DIFFERENT repo and render a
// plausible-looking wrong branch. NUL would be the ideal separator, but the
// format travels as an argv string and argv cannot carry a NUL; tab is the
// strongest separator that survives, and the fields are parsed from the right
// so even a tab inside a path cannot shift the command or the pid.
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

const SEP = '\t'
const PANE_FORMAT = ['#{pane_current_path}', '#{pane_current_command}', '#{pane_pid}'].join(SEP)
// window_name goes LAST because it is the only field that may contain the
// separator: a window can legitimately be named with a tab in it, and the
// parser below joins the tail back together rather than truncating it. The
// same class of bug already bit parseContext once, with a path.
const WINDOW_FORMAT = [
  '#{window_id}',
  '#{pane_current_command}',
  '#{pane_pid}',
  '#{automatic-rename}',
  '#{@tmarchy-ssh-name}',
  '#{window_name}',
].join(SEP)

const EMPTY_CONTEXT = { panePath: null, paneCommand: null, panePid: null }

function parseContext(out) {
  const line = out.replace(/\r?\n$/, '')
  const parts = line.split(SEP)
  // Parsed from the right: command and pid are the last two fields and cannot
  // contain a tab, so whatever precedes them is the path, tabs and all.
  if (parts.length < 3) return { ...EMPTY_CONTEXT }
  const panePid = parts.pop()
  const paneCommand = parts.pop()
  const panePath = parts.join(SEP)
  if (!panePid) return { ...EMPTY_CONTEXT }
  return { panePath: panePath || null, paneCommand: paneCommand || null, panePid }
}

function parseWindows(out) {
  return out
    .split('\n')
    .filter(Boolean)
    .map(line => {
      const parts = line.split(SEP)
      const [id, command = null, pid = null, auto = '', marker = ''] = parts
      return {
        id,
        command: command || null,
        pid: pid || null,
        // '1' when tmux is still naming the window itself. Anything else --
        // including a tmux too old to expose the option as a format -- counts
        // as "hands off", which fails safe: we decline to rename rather than
        // risk eating a name that was set deliberately.
        autoRename: auto === '1',
        marker: marker || '',
        name: parts.slice(5).join(SEP),
      }
    })
    .filter(win => win.id)
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
  SEP,
  PANE_FORMAT,
  WINDOW_FORMAT,
}
