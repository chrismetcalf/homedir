const test = require('node:test')
const assert = require('node:assert')
const { buildArgv } = require('../lib/tmux')

test('batches global and window options into one invocation', () => {
  assert.deepStrictEqual(
    buildArgv([
      { scope: 'global', name: '@bar-load', value: '1.00' },
      { scope: 'window', target: '@3', name: '@scout-state', value: 'wait' },
    ]),
    [
      'set-option', '-g', '@bar-load', '1.00',
      ';',
      'set-option', '-wt', '@3', '@scout-state', 'wait',
    ],
  )
})

test('a null window value unsets rather than writing a string', () => {
  assert.deepStrictEqual(
    buildArgv([{ scope: 'window', target: '@4', name: '@scout-state', value: null }]),
    ['set-option', '-uwt', '@4', '@scout-state'],
  )
})

test('a null global value unsets', () => {
  assert.deepStrictEqual(
    buildArgv([{ scope: 'global', name: '@bar-branch', value: null }]),
    ['set-option', '-gu', '@bar-branch'],
  )
})

test('an empty op list produces no argv', () => {
  assert.deepStrictEqual(buildArgv([]), [])
})


// The ssh rename must ride in the same invocation as the option writes: a
// second tmux call per tick would double the fork cost tmarchy exists to avoid.
test('a command op is emitted verbatim', () => {
  assert.deepStrictEqual(
    buildArgv([{ scope: 'command', argv: ['rename-window', '-t', '@3', 'altair'] }]),
    ['rename-window', '-t', '@3', 'altair'],
  )
})

test('commands and options batch into one argv', () => {
  const argv = buildArgv([
    { scope: 'command', argv: ['rename-window', '-t', '@3', 'altair'] },
    { scope: 'window', target: '@3', name: '@tmarchy-ssh-name', value: 'altair' },
  ])
  assert.deepStrictEqual(argv, [
    'rename-window', '-t', '@3', 'altair',
    ';',
    'set-option', '-wt', '@3', '@tmarchy-ssh-name', 'altair',
  ])
})

test('a window name that looks like a flag is still passed as a value', () => {
  // tmux takes the argument after the target as the name, so this is safe, but
  // it must not be silently dropped or reordered on the way through.
  const argv = buildArgv([{ scope: 'command', argv: ['rename-window', '-t', '@3', '-weird'] }])
  assert.strictEqual(argv[3], '-weird')
})
