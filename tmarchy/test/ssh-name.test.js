const test = require('node:test')
const assert = require('node:assert')
const { MARKER, renamePlan, planToOps } = require('../lib/ssh-name')

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

test('clear only drops the marker', () => {
  const ops = planToOps({ action: 'clear' }, { id: '@3', command: 'zsh' })
  assert.deepStrictEqual(ops, [{ scope: 'window', target: '@3', name: MARKER, value: null }])
})

test('none produces no ops at all', () => {
  assert.deepStrictEqual(planToOps({ action: 'none' }, { id: '@3', command: 'zsh' }), [])
})
