const test = require('node:test')
const assert = require('node:assert')
const { MARKER, MARKER_PREV, renamePlan, planToOps } = require('../lib/ssh-name')

test('an auto-named window running ssh is taken over', () => {
  // tmux names it "ssh" by itself, which tells you nothing about where.
  const plan = renamePlan({ name: 'ssh', autoRename: true, marker: '' }, 'altair')
  assert.deepStrictEqual(plan, { action: 'rename', name: 'altair' })
})

test('a window you named is never touched', () => {
  // Every agent worktree window is opened with -n, which turns automatic-rename
  // off. Eating those names would be far worse than showing no host.
  const plan = renamePlan({ name: 'otto-relay', autoRename: false, marker: '' }, 'altair')
  assert.deepStrictEqual(plan, { action: 'none' })
})

test('a window we already renamed is left alone while the host is unchanged', () => {
  const plan = renamePlan({ name: 'altair', autoRename: false, marker: 'altair' }, 'altair')
  assert.deepStrictEqual(plan, { action: 'none' })
})

test('a window we renamed follows the host if the session changes', () => {
  // ssh to one box, exit, ssh to another inside the same window.
  const plan = renamePlan({ name: 'altair', autoRename: false, marker: 'altair' }, 'hydra')
  assert.deepStrictEqual(plan, { action: 'rename', name: 'hydra' })
})

test('the name is handed back when the session ends', () => {
  const plan = renamePlan({ name: 'altair', autoRename: false, marker: 'altair' }, null)
  assert.deepStrictEqual(plan, { action: 'restore' })
})

test('a window you renamed after we did is released, not restored', () => {
  // Restoring here would overwrite a name you chose on purpose.
  const plan = renamePlan({ name: 'my-box', autoRename: false, marker: 'altair' }, null)
  assert.deepStrictEqual(plan, { action: 'clear' })
})

test('a window with no marker and no ssh is left completely alone', () => {
  const plan = renamePlan({ name: 'zsh', autoRename: true, marker: '' }, null)
  assert.deepStrictEqual(plan, { action: 'none' })
})

test('an empty marker never counts as ownership', () => {
  // '' === '' would make every unnamed window look like ours.
  const plan = renamePlan({ name: '', autoRename: false, marker: '' }, null)
  assert.deepStrictEqual(plan, { action: 'none' })
})

test('rename writes the marker alongside the rename', () => {
  const ops = planToOps({ action: 'rename', name: 'altair' }, { id: '@3', command: 'ssh' })
  assert.deepStrictEqual(ops, [
    { scope: 'command', argv: ['rename-window', '-t', '@3', 'altair'] },
    { scope: 'window', target: '@3', name: MARKER, value: 'altair' },
  ])
})

test('restore renames before handing automatic-rename back', () => {
  // rename-window turns automatic-rename off, so the reverse order would leave
  // the window stuck on the host name for good.
  const ops = planToOps({ action: 'restore' }, { id: '@3', command: 'zsh' })
  const kinds = ops.map(op => (op.argv ? op.argv[0] : `opt:${op.name}`))
  assert.deepStrictEqual(kinds, ['rename-window', 'set-option', `opt:${MARKER}`])
  assert.strictEqual(ops[0].argv[3], 'zsh')
  assert.strictEqual(ops[2].value, null)
})

test('restore falls back to a name when the command is unknown', () => {
  const ops = planToOps({ action: 'restore' }, { id: '@3', command: null })
  assert.strictEqual(ops[0].argv[3], 'shell')
})

test('clear drops both markers and changes no name', () => {
  const ops = planToOps({ action: 'clear' }, { id: '@3', command: 'zsh' })
  assert.deepStrictEqual(ops, [
    { scope: 'window', target: '@3', name: MARKER, value: null },
    { scope: 'window', target: '@3', name: MARKER_PREV, value: null },
  ])
  assert.strictEqual(ops.filter(op => op.argv).length, 0)
})

test('a window you named is still untouched in the default mode', () => {
  assert.deepStrictEqual(
    renamePlan({ name: 'otto-relay', autoRename: false, marker: '' }, 'altair', 'auto'),
    { action: 'none' },
  )
})

test('always mode takes over a window you named, recording what it was', () => {
  assert.deepStrictEqual(
    renamePlan({ name: 'otto-relay', autoRename: false, marker: '' }, 'altair', 'always'),
    { action: 'rename', name: 'altair', prev: 'otto-relay' },
  )
})

test('the mode can come from the window row itself', () => {
  // The ticker reads the option once, as a field on every window row.
  assert.deepStrictEqual(
    renamePlan({ name: 'otto-relay', autoRename: false, marker: '', mode: 'always' }, 'altair'),
    { action: 'rename', name: 'altair', prev: 'otto-relay' },
  )
})

test('always mode refuses a name it could not restore', () => {
  // The window query is tab-separated, so a tab in the name could not survive
  // the round trip through @tmarchy-ssh-prev. A name we cannot give back is one
  // we must not take.
  assert.deepStrictEqual(
    renamePlan({ name: 'two\tparts', autoRename: false, marker: '', mode: 'always' }, 'altair'),
    { action: 'none' },
  )
})

test('taking over a named window records the previous name', () => {
  const ops = planToOps({ action: 'rename', name: 'altair', prev: 'otto-relay' }, { id: '@3' })
  assert.deepStrictEqual(ops[2], { scope: 'window', target: '@3', name: MARKER_PREV, value: 'otto-relay' })
})

test('an auto-named window records no previous name', () => {
  // tmux will name it again by itself; there is nothing worth remembering.
  const ops = planToOps({ action: 'rename', name: 'altair' }, { id: '@3' })
  assert.strictEqual(ops.length, 2)
  assert.strictEqual(ops.some(op => op.name === MARKER_PREV), false)
})

test('restoring a name we replaced puts it back verbatim', () => {
  const ops = planToOps({ action: 'restore' }, { id: '@3', command: 'zsh', prev: 'otto-relay' })
  assert.deepStrictEqual(ops[0], { scope: 'command', argv: ['rename-window', '-t', '@3', 'otto-relay'] })
})

test('and does NOT hand automatic-rename back, since it was off before', () => {
  // Re-enabling it would let tmux rename the window to the running command a
  // moment later, destroying the name we just restored.
  const ops = planToOps({ action: 'restore' }, { id: '@3', command: 'zsh', prev: 'otto-relay' })
  assert.strictEqual(ops.some(op => op.argv && op.argv.includes('automatic-rename')), false)
})

test('restoring an auto-named window still hands automatic-rename back', () => {
  const ops = planToOps({ action: 'restore' }, { id: '@3', command: 'zsh', prev: '' })
  assert.strictEqual(ops.some(op => op.argv && op.argv.includes('automatic-rename')), true)
})

test('both markers are cleared on either restore path', () => {
  for (const prev of ['otto-relay', '']) {
    const ops = planToOps({ action: 'restore' }, { id: '@3', command: 'zsh', prev })
    const cleared = ops.filter(op => op.value === null).map(op => op.name).sort()
    assert.ok(cleared.includes(MARKER), `MARKER cleared (prev=${prev})`)
  }
})

test('none produces no ops at all', () => {
  assert.deepStrictEqual(planToOps({ action: 'none' }, { id: '@3', command: 'zsh' }), [])
})
