const test = require('node:test')
const assert = require('node:assert')
const { hostFromArgv } = require('../segments.d/remote')

test('takes the host from a bare ssh invocation', () => {
  assert.strictEqual(hostFromArgv(['ssh', 'argabuthon']), 'argabuthon')
})

test('ignores flags and their values', () => {
  assert.strictEqual(hostFromArgv(['ssh', '-p', '2222', '-A', 'vogsphere']), 'vogsphere')
})

test('strips a user prefix', () => {
  assert.strictEqual(hostFromArgv(['ssh', 'krezel@argabuthon']), 'argabuthon')
})

test('ignores a trailing remote command', () => {
  assert.strictEqual(hostFromArgv(['ssh', 'argabuthon', 'tmux', 'attach']), 'argabuthon')
})

test('returns null when there is no host', () => {
  assert.strictEqual(hostFromArgv(['ssh']), null)
})

test('ignores -B bind_interface and its value', () => {
  assert.strictEqual(hostFromArgv(['ssh', '-B', 'eth0', 'realhost']), 'realhost')
})

test('ignores -P tag and its value', () => {
  assert.strictEqual(hostFromArgv(['ssh', '-P', 'mytag', 'realhost']), 'realhost')
})
