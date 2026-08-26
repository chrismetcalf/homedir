// Deciding what a window should be called while it holds an ssh session.
//
// The bar used to answer "am I on a remote host?" in status-left, next to the
// session name — which put one pane's ssh host in a spot that reads as a
// property of the whole session. The window name is the honest place for it:
// it is per-window, it is already on the tab, and tmarchy's tab already shows a
// remote glyph beside it.
//
// Pure on purpose. Renaming windows automatically is the kind of thing that
// silently eats a name you set by hand, so the decision is a function of four
// values and is tested directly rather than inferred from live tmux state.
//
// The rules:
//   - Only a window tmux is still auto-naming may be taken over. Once you name
//     a window (or open it with -n, as every agent worktree does), tmux turns
//     automatic-rename off for it, and that is the signal to keep our hands off.
//   - A window we renamed is remembered in @tmarchy-ssh-name. That marker is
//     what lets the name be handed back when the session ends; without it we
//     could not tell our own name from one you chose.
//   - If the name no longer matches the marker, you renamed it after we did.
//     Stop tracking it and never touch it again.

const MARKER = '@tmarchy-ssh-name'
// What the window was called before we took it over. Only written in "always"
// mode, and it is what makes taking over a name you chose reversible: without
// it, the restore path would rename your window to the pane's command and your
// name would be gone for good.
const MARKER_PREV = '@tmarchy-ssh-prev'

// set -g @tmarchy-ssh-rename always
//   "auto"   (default) only rename windows tmux is still naming itself
//   "always" also take over windows you named -- and give the name back after

// win: { name, autoRename, marker }, host: resolved ssh host or null.
// Returns { action: 'rename' | 'restore' | 'clear' | 'none', name? }.
function renamePlan(win, host, mode) {
  const name = win.name || ''
  const marker = win.marker || ''
  const ours = marker !== '' && marker === name
  const always = (mode || win.mode || 'auto') === 'always'

  if (host) {
    // Already ours: follow the host if the session changed under us.
    if (ours) return name === host ? { action: 'none' } : { action: 'rename', name: host }
    // Untouched by you, so tmux is naming it "ssh" and we can do better.
    if (win.autoRename) return { action: 'rename', name: host }
    // You named this window, and you asked us to take those over too. Record
    // what it was called so it can be handed back intact.
    //
    // A name containing a tab is refused rather than taken over: the window
    // query is tab-separated, so such a name could not survive the round trip
    // through @tmarchy-ssh-prev, and a name we cannot restore is one we must
    // not touch.
    if (always && !name.includes('\t')) return { action: 'rename', name: host, prev: name }
    // Default: it stays exactly as you left it.
    return { action: 'none' }
  }

  if (!marker) return { action: 'none' }
  // The session ended and the name is still the one we set: give it back.
  if (ours) return { action: 'restore' }
  // You renamed it while we were tracking it. Forget it, change nothing.
  return { action: 'clear' }
}

// A plan plus the window's id and current command becomes tmux ops. Renames go
// through the same batched invocation as the option writes, so the ticker still
// costs exactly one fork per interval.
function planToOps(plan, win) {
  const id = win.id
  switch (plan.action) {
    case 'rename': {
      const ops = [
        { scope: 'command', argv: ['rename-window', '-t', id, plan.name] },
        { scope: 'window', target: id, name: MARKER, value: plan.name },
      ]
      // Only when taking over a name you chose. An auto-named window has
      // nothing worth remembering: tmux will name it again by itself.
      if (plan.prev) ops.push({ scope: 'window', target: id, name: MARKER_PREV, value: plan.prev })
      return ops
    }
    case 'restore': {
      // A name we replaced goes back verbatim, and automatic-rename stays off
      // because it was off before we arrived. Renaming to the pane's command
      // here -- the auto-named path below -- would silently destroy it.
      if (win.prev) {
        return [
          { scope: 'command', argv: ['rename-window', '-t', id, win.prev] },
          { scope: 'window', target: id, name: MARKER, value: null },
          { scope: 'window', target: id, name: MARKER_PREV, value: null },
        ]
      }
      return [
        // Rename first, then hand automatic-rename back: rename-window turns
        // it off again, so doing these in the other order would leave the
        // window frozen on the host name forever.
        { scope: 'command', argv: ['rename-window', '-t', id, win.command || 'shell'] },
        { scope: 'command', argv: ['set-option', '-uwt', id, 'automatic-rename'] },
        { scope: 'window', target: id, name: MARKER, value: null },
      ]
    }
    case 'clear':
      return [
        { scope: 'window', target: id, name: MARKER, value: null },
        { scope: 'window', target: id, name: MARKER_PREV, value: null },
      ]
    default:
      return []
  }
}

module.exports = { MARKER, MARKER_PREV, renamePlan, planToOps }
