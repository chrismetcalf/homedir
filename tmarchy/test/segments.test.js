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

// --- the tick's option list must cover segments.d/ --------------------------
//
// loadSegments finds and renders every segments.d/*.js, but tmarchy-tick writes
// options from an EXPLICIT list. A segment missing from that list is loaded,
// rendered, and then silently dropped -- the bar slot stays empty with nothing
// anywhere to explain why. That is exactly what happened when usage.js was
// added, and it cost a live debugging round to find.
//
// 'remote' is excluded on purpose: the ssh host renames the window instead of
// sitting in status-left. The assertion pins that exclusion too, so the list
// cannot quietly grow a second silent omission.

test('every segment is written by the tick, except the documented exclusion', () => {
  const fs = require('node:fs')
  const path = require('node:path')

  const dir = path.join(__dirname, '..', 'segments.d')
  const onDisk = fs.readdirSync(dir)
    .filter((f) => f.endsWith('.js'))
    .map((f) => require(path.join(dir, f)).name)
    .filter(Boolean)
    .sort()

  const tick = fs.readFileSync(path.join(__dirname, '..', 'bin', 'tmarchy-tick'), 'utf8')
  const m = tick.match(/for \(const name of \[([^\]]+)\]\)/)
  assert.ok(m, 'could not find the tick\'s option list -- did its shape change?')
  const written = m[1].split(',').map((x) => x.trim().replace(/^'|'$/g, '')).sort()

  const EXCLUDED = ['remote']
  const missing = onDisk.filter((n) => !written.includes(n) && !EXCLUDED.includes(n))
  assert.deepStrictEqual(missing, [],
    `segment(s) on disk but never written by the tick: ${missing.join(', ')}`)

  const stale = written.filter((n) => !onDisk.includes(n))
  assert.deepStrictEqual(stale, [],
    `tick writes @bar-* for segment(s) that no longer exist: ${stale.join(', ')}`)

  assert.deepStrictEqual(onDisk.filter((n) => !written.includes(n)), EXCLUDED,
    'the set of deliberately-unwritten segments changed')
})
