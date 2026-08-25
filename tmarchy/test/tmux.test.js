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
