// The screensaver's CPU timeline: CPU on the Y axis, time on the X.
//
// renderGraph is pure -- a grid in, a painted grid out -- so these assertions
// read the cells rather than a screenshot. Every one of them is sabotage-proved
// in the comment above it: the named change to bin/tmarchy-panel.js makes that
// assertion, and only that assertion, fail.
'use strict'

const test = require('node:test')
const assert = require('node:assert')
const path = require('node:path')

const panel = require(path.join(__dirname, '..', '..', 'bin', 'tmarchy-panel.js'))

const theme = { dim: '#565f89', accent: '#7aa2f7' }
const fg = () => '<crest>'
const dim = () => '<body>'

function paint(history, { rows = 12, cols = 10, height = 4 } = {}) {
  const grid = Array.from({ length: rows }, () => new Array(cols).fill(null))
  panel.renderGraph({ grid, rows, cols, theme, fg, dim, history, height })
  return { grid, rows, cols, height }
}

// Column height is the sample's percentage of the band. Sabotage: in
// renderGraph replace `const units = Math.round((pct / 100) * height * 8)` with
// `const units = height * 8` -- the 0% column then fills too and this fails.
test('a column is as tall as its CPU sample', () => {
  const { grid, rows, height } = paint([0, 100])
  const top = rows - height

  // 100% reaches the top row of the band.
  assert.ok(grid[top][9] !== null, '100% sample should reach the top of the band')
  // 0% paints nothing but the baseline.
  for (let y = top; y < rows - 1; y++) {
    assert.strictEqual(grid[y][8], null, `0% sample painted at row ${y}`)
  }
})

// Time runs left to right with NOW at the right edge. Sabotage: in renderGraph
// replace `const x0 = cols - shown.length` with `const x0 = 0` -- the pair moves
// to the left edge and this fails. (It takes the height assertion down with it,
// since that one also reads the last column; the direction is what the reversed
// pair below proves, and nothing else in the file asserts it.)
test('the newest sample is the rightmost column', () => {
  const newest = paint([0, 100])
  const oldest = paint([100, 0])
  const top = newest.rows - newest.height
  const a = newest.grid
  const b = oldest.grid

  assert.ok(a[top][9] !== null, 'newest 100% should paint the last column')
  assert.strictEqual(a[top][8], null, 'older 0% should leave its column empty')
  // Reversing the history moves the tall column, which is what proves the axis
  // has a direction rather than the last column merely always being painted.
  assert.strictEqual(b[top][9], null, 'newest 0% should leave the last column empty')
  assert.ok(b[top][8] !== null, 'older 100% should paint the second-to-last column')
})

// The graph is a band, not a backdrop: it never reaches into the solid's space.
//
// This one is defence in depth, and the sabotage says so honestly: the bound is
// held by TWO independent guards -- the `pct` clamp and the `y >= top` gate --
// so removing either alone leaves the other holding and the test still passes.
// Sabotage: remove BOTH, i.e. replace `const pct = Math.max(0, Math.min(100,
// shown[i]))` with `const pct = shown[i]` AND `const top = rows - height` with
// `const top = 0`. The out-of-range sample below then paints to the top of the
// pane and this fails. A single-guard version of this test would be vacuous,
// which is why the input is 400 rather than 100.
test('an out-of-range sample cannot escape the bottom band', () => {
  const { grid, rows, cols, height } = paint(new Array(10).fill(400))
  const top = rows - height
  for (let y = 0; y < top; y++) {
    for (let x = 0; x < cols; x++) {
      assert.strictEqual(grid[y][x], null, `painted above the band at ${y},${x}`)
    }
  }
})

// An idle machine still shows an axis. Sabotage: delete the baseline loop at the
// end of renderGraph -- an all-zero history then paints nothing at all and this
// fails.
test('an idle machine still draws a baseline', () => {
  const { grid, rows, cols } = paint([0, 0, 0])
  for (let x = 0; x < cols; x++) {
    assert.ok(grid[rows - 1][x] !== null, `no baseline at column ${x}`)
  }
})

// The gauge reads the sampler rather than taking its own /proc/stat delta: two
// samplers would each steal the other's reading. Sabotage: in read() replace
// `cpu: lastCpu` with `cpu: null` -- this fails while the graph still draws.
test('read() reports the sampler\'s latest CPU value', () => {
  panel.sampleCpu()                       // first call has no previous sample
  const spin = Date.now(); while (Date.now() - spin < 120) { /* accrue jiffies */ }
  const sampled = panel.sampleCpu()
  assert.strictEqual(typeof sampled, 'number', 'second sample should be a number')
  const r = panel.read()
  assert.strictEqual(r.cpu, sampled, 'read().cpu should be the sampler\'s value')
  assert.strictEqual(r.cpuHistory[r.cpuHistory.length - 1], sampled,
    'the newest history entry should be the sampler\'s value')
})
