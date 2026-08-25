const test = require('node:test')
const assert = require('node:assert')
const { parseContext, parseWindows, hasContext } = require('../lib/context')

test('parses the active pane context from one tmux query', () => {
  const ctx = parseContext('/home/krezel/.homedir ssh 12345\n')
  assert.deepStrictEqual(ctx, {
    panePath: '/home/krezel/.homedir',
    paneCommand: 'ssh',
    panePid: '12345',
  })
})

test('returns empty context for empty tmux output', () => {
  assert.deepStrictEqual(parseContext(''), { panePath: null, paneCommand: null, panePid: null })
})

// tmux() cannot distinguish "printed nothing" from "failed", so the ticker
// needs a way to tell a failed pane query from a genuine answer before it
// unsets @bar-branch / @bar-remote on the strength of it.
test('an empty pane query is recognised as no context at all', () => {
  assert.strictEqual(hasContext(parseContext('')), false)
  assert.strictEqual(hasContext(null), false)
})

test('a real pane query is recognised as context', () => {
  assert.strictEqual(hasContext(parseContext('/tmp zsh 99\n')), true)
})

test('parses the window list', () => {
  const out = '@1 zsh 12\n@2 ssh 34\n'
  assert.deepStrictEqual(parseWindows(out), [
    { id: '@1', command: 'zsh', pid: '12' },
    { id: '@2', command: 'ssh', pid: '34' },
  ])
})
