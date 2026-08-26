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

// win: { name, autoRename, marker }, host: resolved ssh host or null.
// Returns { action: 'rename' | 'restore' | 'clear' | 'none', name? }.
function renamePlan(win, host) {
  const name = win.name || ''
  const marker = win.marker || ''
  const ours = marker !== '' && marker === name

  if (host) {
    // Already ours: follow the host if the session changed under us.
    if (ours) return name === host ? { action: 'none' } : { action: 'rename', name: host }
    // Untouched by you, so tmux is naming it "ssh" and we can do better.
    if (win.autoRename) return { action: 'rename', name: host }
    // You named this window. It stays exactly as you left it.
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
    case 'rename':
      return [
        { scope: 'command', argv: ['rename-window', '-t', id, plan.name] },
        { scope: 'window', target: id, name: MARKER, value: plan.name },
      ]
    case 'restore':
      return [
        // Rename first, then hand automatic-rename back: rename-window turns
        // it off again, so doing these in the other order would leave the
        // window frozen on the host name forever.
        { scope: 'command', argv: ['rename-window', '-t', id, win.command || 'shell'] },
        { scope: 'command', argv: ['set-option', '-uwt', id, 'automatic-rename'] },
        { scope: 'window', target: id, name: MARKER, value: null },
      ]
    case 'clear':
      return [{ scope: 'window', target: id, name: MARKER, value: null }]
    default:
      return []
  }
}

module.exports = { MARKER, renamePlan, planToOps }
