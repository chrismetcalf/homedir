// The screensaver's CPU timeline: CPU on the Y axis, time on the X.
//
// renderGraph is pure -- a grid in, a painted grid out -- so these assertions
// read the cells rather than a screenshot. Every one of them is sabotage-proved
// in the comment above it: the named change to bin/tmarchy-panel.js makes that
// assertion fail.
'use strict'

const test = require('node:test')
const assert = require('node:assert')
const path = require('node:path')

const panel = require(path.join(__dirname, '..', '..', 'bin', 'tmarchy-panel.js'))

const theme = { dim: '#565f89', accent: '#7aa2f7' }
const fg = () => '<head>'
const dim = () => '<trace>'

function paint(history, { rows = 12, cols = 10, height = 4 } = {}) {
  const grid = Array.from({ length: rows }, () => new Array(cols).fill(null))
  panel.renderGraph({ grid, rows, cols, theme, fg, dim, history, height })
  return { grid, rows, cols, height }
}

// A mark's row is its sample's share of the band. Sabotage: in renderGraph
// replace `const level = Math.round((pct / 100) * steps)` with
// `const level = steps` -- the 0% mark then rises to the top and this fails.
test('a mark sits at the height of its CPU sample', () => {
  const { grid, rows, height } = paint([0, 100])
  const top = rows - height

  assert.ok(grid[top][9] !== null, '100% should mark the top row of the band')
  assert.strictEqual(grid[rows - 1][9], null, '100% should not mark the floor')
  assert.ok(grid[rows - 1][8] !== null, '0% should mark the floor')
  assert.strictEqual(grid[top][8], null, '0% should not mark the top row')
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

  assert.ok(newest.grid[top][9] !== null, 'newest 100% should mark the last column')
  assert.strictEqual(newest.grid[top][8], null, 'older 0% should not mark the top row')
  // Reversing the history moves the high mark, which is what proves the axis has
  // a direction rather than the last column merely always being marked.
  assert.strictEqual(oldest.grid[top][9], null, 'newest 0% should not mark the top row')
  assert.ok(oldest.grid[top][8] !== null, 'older 100% should mark the second-to-last column')
})

// SPARSE, not filled: one mark per column, nothing underneath it. This is the
// whole visual point -- a filled bar chart at pane width reads as a block of
// texture competing with the solid above it. Sabotage: in renderGraph, after
// the `grid[y][x] = ...` assignment, add
// `for (let f = y + 1; f < rows; f++) grid[f][x] = trace + '█'`
// -- the area beneath each mark fills in and this fails.
test('a mark has nothing painted beneath it', () => {
  const { grid, rows, cols, height } = paint(new Array(10).fill(100))
  const top = rows - height

  for (let x = 0; x < cols; x++) {
    assert.ok(grid[top][x] !== null, `no mark in column ${x}`)
    // The floor row is excluded: that is where the axis ticks live.
    for (let y = top + 1; y < rows - 1; y++) {
      assert.strictEqual(grid[y][x], null, `painted beneath the mark at ${y},${x}`)
    }
  }
})

// The graph is a band, not a backdrop: it never reaches into the solid's space.
//
// This one is defence in depth, and the sabotage says so honestly: the bound is
// held by TWO independent guards -- the `pct` clamp and the `y >= top` gate --
// so removing either alone leaves the other holding and the test still passes.
// Sabotage: remove BOTH, i.e. replace `const pct = Math.max(0, Math.min(100,
// shown[i]))` with `const pct = shown[i]` AND `if (y < top || y >= rows)` with
// `if (y >= rows)`. The out-of-range sample below then marks above the band and
// this fails. A single-guard version of this test would be vacuous, which is
// why the input is 400 rather than 100.
test('an out-of-range sample cannot escape the bottom band', () => {
  const { grid, rows, cols, height } = paint(new Array(10).fill(400))
  const top = rows - height
  for (let y = 0; y < top; y++) {
    for (let x = 0; x < cols; x++) {
      assert.strictEqual(grid[y][x], null, `painted above the band at ${y},${x}`)
    }
  }
})

// The axis is DOTTED, so it reads as a scale rather than as a border framing
// the pane. Sabotage: in renderGraph replace `x += AXIS_EVERY` with `x += 1` --
// the floor becomes a continuous rule and this fails.
test('the floor carries a dotted axis, not a solid rule', () => {
  const { grid, rows, cols } = paint([50, 50])     // marks sit mid-band, off the floor
  const ticks = []
  for (let x = 0; x < cols; x++) if (grid[rows - 1][x] !== null) ticks.push(x)

  assert.deepStrictEqual(ticks, [0, 4, 8], 'axis ticks should be every fourth column')
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

// --- portable fallbacks -----------------------------------------------------
//
// This repo deploys to macOS as well as Linux, where /proc and /sys do not
// exist at all. The suite only ever runs on Linux, so the only way to hold that
// promise is to take /proc away and look.

// Loads a FRESH copy of the panel with /proc and /sys unreadable, so its
// sampler state starts clean rather than carrying this process's real readings.
function panelWithoutProc() {
  const fs = require('node:fs')
  const spec = require.resolve(path.join(__dirname, '..', '..', 'bin', 'tmarchy-panel.js'))
  const real = fs.readFileSync
  fs.readFileSync = (p, ...rest) => {
    if (typeof p === 'string' && (p.startsWith('/proc') || p.startsWith('/sys'))) {
      const e = new Error('ENOENT: simulated non-Linux host')
      e.code = 'ENOENT'
      throw e
    }
    return real(p, ...rest)
  }
  delete require.cache[spec]
  const mod = require(spec)
  return {
    mod,
    restore() { fs.readFileSync = real; delete require.cache[spec] },
  }
}

// Sabotage: in cpuTicks replace the os.cpus() loop with the old
// `readFile('/proc/stat')` parse -- CPU goes null on a host without /proc and
// this fails, while every Linux assertion in the suite still passes.
test('CPU still reads on a host with no /proc', () => {
  const { mod, restore } = panelWithoutProc()
  try {
    assert.strictEqual(mod.sampleCpu(), null, 'the first sample has no previous to diff')
    const spin = Date.now(); while (Date.now() - spin < 150) { /* accrue ticks */ }
    const pct = mod.sampleCpu()
    assert.strictEqual(typeof pct, 'number', 'a second sample should still yield a number')
    assert.ok(pct >= 0 && pct <= 100, `cpu out of range: ${pct}`)
    // And the graph therefore has something to draw, which is the point: with
    // the /proc parse it stayed empty forever and the band never appeared.
    assert.ok(mod.read().cpuHistory.length > 0, 'the timeline should still fill')
  } finally { restore() }
})

// Sabotage: in memPercent delete the os.totalmem()/os.freemem() fallback (make
// the function return null when /proc/meminfo is unreadable) -- this fails.
test('memory falls back to the portable reading with no /proc', () => {
  const { mod, restore } = panelWithoutProc()
  try {
    const mem = mod.memPercent()
    assert.ok(mem && typeof mem.pct === 'number', 'memory should still report')
    assert.ok(mem.pct >= 0 && mem.pct <= 100, `mem out of range: ${mem.pct}`)
  } finally { restore() }
})

// The rows that genuinely have no portable source say so rather than lying.
// Sabotage: in render replace `String(s.temp ?? '--')` with `String(s.temp ?? 0)`
// -- a host with no thermal zone claims to be at 0 degrees and this fails.
test('a reading with no portable source renders as --, not as zero', () => {
  const { mod, restore } = panelWithoutProc()
  try {
    const s = mod.read()
    assert.strictEqual(s.temp, null, 'no /sys means no temperature')
    assert.strictEqual(s.net, null, 'no /proc/net/dev means no network rate')

    const rows = 30, cols = 100
    const grid = Array.from({ length: rows }, () => new Array(cols).fill(null))
    mod.render({
      grid, rows, cols, frame: 0,
      theme: { dim: '#565f89', accent: '#7aa2f7', fg: '#c0caf5', done: '#9ece6a',
        busy: '#e0af68', wait: '#f7768e', info: '#73daca' },
      fg: () => '', dim: () => '', stats: s, agents: [], claude: [],
      ping: { net: [], ssh: [] }, meta: { theme: 't', host: 'mac', uptimeHours: 5 },
    })
    const text = grid.map((r) => r.map((c) => (c === null ? ' ' : [...c].pop())).join('')).join('\n')
    const tmp = text.split('\n').find((l) => l.includes('TMP'))
    assert.ok(tmp.includes('--'), `temperature should read --, got: ${tmp.trim()}`)
    assert.ok(!/TMP\s+0\u00b0C/.test(tmp), 'temperature must not claim to be zero')
  } finally { restore() }
})

// --- panel row padding ------------------------------------------------------

// Agent icons come from the Nerd Font ranges in plane 15, where ONE glyph is
// two UTF-16 units. `row()` used to pad with `.length`, which was correct for
// as long as every glyph the panel drew lived in the BMP; an astral one made
// the row pad a column short and sit one short of its own border, which reads
// as a box-drawing bug rather than an encoding one.
//
// Measure the ROW THAT CARRIES THE ICON, not the widest row on the panel. The
// first version of this test took a maximum across every line and passed
// against the broken code, because the borders and rules are full width no
// matter what the agent row does -- a reminder that a panel-wide measurement
// says nothing about one row in it.
//
// Sabotage: in tmarchy-panel.js's `row()` go back to
// `content.length > inner ? content.slice(0, inner) : content.padEnd(inner)`
// -- the icon row comes back one column narrow and this fails.
test('a row carrying an astral glyph pads to the same width as one without', () => {
  const rows = 40, cols = 100
  // U+F03EB is astral (two UTF-16 units, one terminal column -- tmux reports
  // cursor_x = 1 for it, and 2 for an emoji, which is why the icon allowlist
  // in lib/agents.js admits the first and refuses the second).
  const rowFor = (agent, needle) => {
    const grid = Array.from({ length: rows }, () => new Array(cols).fill(null))
    panel.render({
      grid, rows, cols, frame: 0, theme, fg, dim,
      stats: { cpu: 1, load: [0, 0, 0], cores: 1 },
      agents: [agent], claude: [], meta: {}, ping: {},
    })
    // Each grid cell holds `colour + oneCharacter`, so the row's text has to
    // be reassembled before it can be searched -- no single cell contains the
    // label. The two stub colours are the ones this file's `fg`/`dim` return.
    const text = (r) => r.map((c) => (c || ' ').replace('<head>', '').replace('<trace>', '')).join('')
    const line = grid.find((r) => text(r).includes(needle))
    assert.ok(line, `no panel row drew ${needle}`)
    return line.filter(Boolean).length
  }

  const iconRow = rowFor({ label: 'astral', state: 'wait', icon: '\u{f03eb}' }, 'astral')
  const plainRow = rowFor({ label: 'plainbmp', state: 'wait' }, 'plainbmp')

  assert.strictEqual(iconRow, plainRow,
    `an icon row must occupy the same columns as any other (${iconRow} vs ${plainRow})`)
  assert.strictEqual(plainRow, panel.WIDTH,
    'sanity: a panel row fills the panel width, so this is not two equally-broken rows')
})
