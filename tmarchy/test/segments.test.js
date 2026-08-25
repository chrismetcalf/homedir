const test = require('node:test')
const assert = require('node:assert')
const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')
const { loadSegments, renderSegments } = require('../lib/segments')

// mkdtempSync fixtures MUST be rmSync'd — this box has a documented history
// of /tmp accumulation (238k stale entries, 80% inode exhaustion) and a bare
// mkdtemp-per-test-run leaks a tmarchy-seg-* dir every time this file runs.
function fixtureDir(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tmarchy-seg-'))
  for (const [name, body] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), body)
  }
  return dir
}

test('loads only well-formed segment modules', () => {
  const dir = fixtureDir({
    'good.js': "module.exports = { name: 'good', render: () => 'v' }",
    'nameless.js': "module.exports = { render: () => 'v' }",
    'notes.txt': 'ignored',
  })
  try {
    const segs = loadSegments(dir)
    assert.deepStrictEqual(segs.map(s => s.name), ['good'])
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('returns empty for a missing directory', () => {
  assert.deepStrictEqual(loadSegments('/nonexistent/tmarchy'), [])
})

test('a throwing segment does not affect the others', () => {
  const segs = [
    { name: 'boom', render: () => { throw new Error('nope') } },
    { name: 'fine', render: () => 'ok' },
  ]
  assert.deepStrictEqual(renderSegments(segs, {}), { fine: 'ok' })
})

test('a disabled segment is skipped', () => {
  const segs = [{ name: 'off', enabled: () => false, render: () => 'x' }]
  assert.deepStrictEqual(renderSegments(segs, {}), {})
})

test('empty and null values are omitted so the bar can hide them', () => {
  const segs = [
    { name: 'empty', render: () => '' },
    { name: 'nullish', render: () => null },
    { name: 'real', render: () => 'y' },
  ]
  assert.deepStrictEqual(renderSegments(segs, {}), { real: 'y' })
})

test('context is passed through to render', () => {
  const segs = [{ name: 'ctx', render: (c) => c.panePath }]
  assert.deepStrictEqual(renderSegments(segs, { panePath: '/tmp' }), { ctx: '/tmp' })
})
