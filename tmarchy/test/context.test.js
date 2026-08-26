const test = require('node:test')
const assert = require('node:assert')
const {
  parseContext, parseWindows, parsePanes, hasContext,
  PANE_FORMAT, WINDOW_FORMAT, PANE_LIST_FORMAT,
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
  const out = '@1\tzsh\t12\t1\t\tshell\n@2\tssh\t34\t0\taltair\taltair\n'
  assert.deepStrictEqual(parseWindows(out), [
    { id: '@1', command: 'zsh', pid: '12', autoRename: true, marker: '', name: 'shell' },
    { id: '@2', command: 'ssh', pid: '34', autoRename: false, marker: 'altair', name: 'altair' },
  ])
})

// A window name is the one field a user can put anything in, tabs included, so
// it is parsed as the tail rather than as a fixed column.
test('a window name containing the separator survives', () => {
  const [win] = parseWindows('@5\tzsh\t78\t1\t\tone\ttwo\n')
  assert.strictEqual(win.name, 'one\ttwo')
  assert.strictEqual(win.pid, '78')
})

// Only the literal '1' means tmux is still naming the window. A tmux too old to
// expose the option as a format yields '', and that must read as "hands off"
// rather than as permission to rename.
test('anything but 1 counts as not auto-named', () => {
  assert.strictEqual(parseWindows('@6\tzsh\t9\t0\t\tx\n')[0].autoRename, false)
  assert.strictEqual(parseWindows('@7\tzsh\t9\t\t\tx\n')[0].autoRename, false)
  assert.strictEqual(parseWindows('@8\tzsh\t9\t1\t\tx\n')[0].autoRename, true)
})

// pane_current_command is process-supplied and can carry a space just as a path
// can; splitting on one would report command "my" for "my helper", quietly
// losing the `ssh` match that drives @remote-host.
test('a window whose command contains a space stays intact', () => {
  assert.deepStrictEqual(parseWindows('@3\tmy helper\t56\t1\t\tshell\n'), [
    { id: '@3', command: 'my helper', pid: '56', autoRename: true, marker: '', name: 'shell' },
  ])
})

test('a malformed window row keeps its id so its options still get written', () => {
  assert.deepStrictEqual(parseWindows('@4\n'), [
    { id: '@4', command: null, pid: null, autoRename: false, marker: '', name: '' },
  ])
})

// An ssh in a background pane of a split used to be invisible: a window list
// reports only its ACTIVE pane's command.
test('parses the pane list, including inactive panes', () => {
  const out = '@1\tssh\t12\t0\n@1\tzsh\t13\t1\n@2\tclaude\t14\t1\n'
  assert.deepStrictEqual(parsePanes(out), [
    { windowId: '@1', command: 'ssh', pid: '12', active: false },
    { windowId: '@1', command: 'zsh', pid: '13', active: true },
    { windowId: '@2', command: 'claude', pid: '14', active: true },
  ])
})

test('only the literal 1 means a pane is active', () => {
  assert.strictEqual(parsePanes('@1\tzsh\t9\t0\n')[0].active, false)
  assert.strictEqual(parsePanes('@1\tzsh\t9\t\n')[0].active, false)
})

test('a malformed pane row is dropped rather than half-parsed', () => {
  assert.deepStrictEqual(parsePanes('\n'), [])
})

test('the pane format asks for the window id so panes can be grouped', () => {
  assert.ok(PANE_LIST_FORMAT.includes('#{window_id}'))
  assert.ok(PANE_LIST_FORMAT.includes('#{pane_active}'))
  assert.ok(PANE_LIST_FORMAT.includes('\t'))
})

test('the formats ask tmux for tab-separated fields', () => {
  assert.ok(PANE_FORMAT.includes('\t'))
  assert.ok(!PANE_FORMAT.includes(' '))
  assert.ok(WINDOW_FORMAT.includes('\t'))
  assert.ok(!WINDOW_FORMAT.includes(' '))
})
