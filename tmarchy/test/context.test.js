const test = require('node:test')
const assert = require('node:assert')
const {
  parseContext, parseWindows, hasContext, PANE_FORMAT, WINDOW_FORMAT,
} = require('../lib/context')

test('parses the active pane context from one tmux query', () => {
  const ctx = parseContext('/home/krezel/.homedir\tssh\t12345\n')
  assert.deepStrictEqual(ctx, {
    panePath: '/home/krezel/.homedir',
    paneCommand: 'ssh',
    panePid: '12345',
  })
})

// The whole reason the separator is a tab. A space-split parser reads this as
// path "/home/krezel/00.10", command "-", pid "Projects" — and then reports
// hasContext() true, so the branch segment resolves a truncated path that may
// well be inside a different repo. A wrong branch is worse than no branch.
test('a pane path containing spaces keeps every field in the right place', () => {
  const ctx = parseContext('/home/krezel/00.10 - Projects Backup\tzsh\t99\n')
  assert.deepStrictEqual(ctx, {
    panePath: '/home/krezel/00.10 - Projects Backup',
    paneCommand: 'zsh',
    panePid: '99',
  })
})

test('even a tab inside the path cannot shift the command or the pid', () => {
  const ctx = parseContext('/home/krezel/od\td\tzsh\t7\n')
  assert.strictEqual(ctx.paneCommand, 'zsh')
  assert.strictEqual(ctx.panePid, '7')
  assert.strictEqual(ctx.panePath, '/home/krezel/od\td')
})

test('returns empty context for empty tmux output', () => {
  assert.deepStrictEqual(parseContext(''), { panePath: null, paneCommand: null, panePid: null })
})

test('returns empty context for a truncated query result', () => {
  assert.deepStrictEqual(parseContext('/tmp\tzsh\n'), { panePath: null, paneCommand: null, panePid: null })
})

// tmux() cannot distinguish "printed nothing" from "failed", so the ticker
// needs a way to tell a failed pane query from a genuine answer before it
// unsets @bar-branch / @bar-remote on the strength of it.
test('an empty pane query is recognised as no context at all', () => {
  assert.strictEqual(hasContext(parseContext('')), false)
  assert.strictEqual(hasContext(null), false)
})

test('a real pane query is recognised as context', () => {
  assert.strictEqual(hasContext(parseContext('/tmp\tzsh\t99\n')), true)
})

test('parses the window list', () => {
  const out = '@1\tzsh\t12\n@2\tssh\t34\n'
  assert.deepStrictEqual(parseWindows(out), [
    { id: '@1', command: 'zsh', pid: '12' },
    { id: '@2', command: 'ssh', pid: '34' },
  ])
})

// pane_current_command is process-supplied and can carry a space just as a path
// can; splitting on one would report command "my" for "my helper", quietly
// losing the `ssh` match that drives @remote-host.
test('a window whose command contains a space stays intact', () => {
  assert.deepStrictEqual(parseWindows('@3\tmy helper\t56\n'), [
    { id: '@3', command: 'my helper', pid: '56' },
  ])
})

test('a malformed window row keeps its id so its options still get written', () => {
  assert.deepStrictEqual(parseWindows('@4\n'), [{ id: '@4', command: null, pid: null }])
})

test('the formats ask tmux for tab-separated fields', () => {
  assert.ok(PANE_FORMAT.includes('\t'))
  assert.ok(!PANE_FORMAT.includes(' '))
  assert.ok(WINDOW_FORMAT.includes('\t'))
  assert.ok(!WINDOW_FORMAT.includes(' '))
})
