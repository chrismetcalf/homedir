// The `demo` screensaver -- bin/tmarchy-demo.js.
//
// Modelled on Omarchy's own, read from its source. Two of its behaviours are
// ported rather than approximated, and those are the ones worth pinning:
// effects run to COMPLETION and hand over, and the picker is an
// inverse-frequency shuffle that never repeats back to back.
//
// Every assertion names the sabotage that makes it fail.
'use strict'

const test = require('node:test')
const assert = require('node:assert')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const demo = require(path.join(__dirname, '..', '..', 'bin', 'tmarchy-demo.js'))

const theme = {
  accent: '#7aa2f7', accentAlt: '#bb9af7', info: '#73daca', dim: '#565f89',
  fg: '#c0caf5', wait: '#f7768e', busy: '#e0af68', done: '#9ece6a', remote: '#7dcfff',
}
const fg = (c) => `<${c}>`
const mix = (a, b, t) => (t < 0.5 ? a : b)

// --- the picker -------------------------------------------------------------

// Nothing may run twice in a row. Sabotage: in createEffectPicker drop the
// `catalog.filter((n) => n !== last)` and use the whole catalog -- repeats
// appear within a few hundred picks and this fails.
test('the picker never repeats an effect back to back', () => {
  const p = demo.createEffectPicker(demo.EFFECT_NAMES)
  let prev = null
  for (let i = 0; i < 2000; i++) {
    const n = p.pick()
    assert.notStrictEqual(n, prev, `effect ${n} repeated at pick ${i}`)
    prev = n
  }
})

// Inverse frequency: a recently-shown effect is LESS likely next time, so the
// run self-balances. Pinned DETERMINISTICALLY, by injecting a fixed random
// stream and asserting the exact sequence, because the statistical version of
// this test could not fail: measured over 200 trials of 700 picks, the
// weighted spread ranges 4..36 and a memoryless uniform control 5..45 -- they
// overlap almost entirely, so "weighted is tighter than uniform" is true on
// average and unreliable in any single run. It passed with the weighting
// removed.
//
// The sequence below comes from the real implementation on this stream; the
// same stream through a uniform-weight variant diverges at index 2, which is
// what makes this sharp rather than a snapshot of nothing. Pinning an exact
// sequence is right here because this is a PORT of Omarchy's picker, not a
// design of our own that might reasonably evolve.
//
// Sabotage: in createEffectPicker replace the weight with a constant 1 -- the
// sequence diverges and this fails.
test('the picker is inverse-frequency, not uniform', () => {
  const lcg = (seed) => {
    let s = seed >>> 0
    return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)
  }
  const p = demo.createEffectPicker(demo.EFFECT_NAMES, lcg(12345))
  const got = Array.from({ length: 14 }, () => p.pick())
  assert.deepStrictEqual(got, [
    'colorshift', 'decrypt', 'expand', 'middleout', 'unstable', 'wipe',
    'crumble', 'errorcorrect', 'middleout', 'spotlights', 'decrypt',
    'slice', 'vhstape', 'wipe',
  ])
})

// --- the banner -------------------------------------------------------------

// The font is the SAME FILE the login splash reads, so the two never spell the
// host differently. Sabotage: point FONT_FILE at a path that does not exist --
// the glyph count drops to zero and this fails.
test('the shared font loads, and it is the splash’s font', () => {
  const glyphs = demo.loadFont(demo.FONT_FILE)
  assert.strictEqual(glyphs.size, 38)
  assert.ok(demo.FONT_FILE.includes(path.join('tmarchy', 'lib', 'font-3x5.txt')),
    `font should come from the shared file, got ${demo.FONT_FILE}`)
  // And the splash agrees it is well-formed, which is the structural check.
  const splash = path.join(__dirname, '..', '..', 'bin', 'tmarchy-splash')
  const out = execFileSync(splash, ['--selfcheck'], { encoding: 'utf8' })
  assert.match(out, /38 glyphs/)
})

// Cells are twice as tall as they are wide, so the horizontal scale is doubled
// -- the same 1:2 ratio Omarchy's canvas uses. The scale chosen is the largest
// that fits, and it has to actually grow with the terminal.
//
// Sabotage: in layout start the loop at `s = 1` instead of `s = 4` -- a wide
// terminal stops getting the bigger banner and this fails.
test('the banner takes the largest scale that fits', () => {
  const glyphs = demo.loadFont(demo.FONT_FILE)
  const wide = demo.layout('docker-host', glyphs, 209, 61)
  const mid = demo.layout('docker-host', glyphs, 120, 34)
  assert.ok(wide && mid)
  assert.ok(wide.sv > mid.sv, `a wider terminal should scale up: ${wide.sv} vs ${mid.sv}`)
  assert.strictEqual(wide.sh, wide.sv * 2, 'horizontal scale is double vertical')
  assert.ok(wide.w <= 209 - 4 && wide.h <= 61 - 8, 'the banner stays inside its headroom')
})

// A phone cannot fit even a short hostname at the proper 1:2 ratio, and a
// screensaver that renders nothing is worse than one with squashed letters.
// Sabotage: delete the `if (!sv && ...) { sv = 1; sh = 1 }` fallback -- the
// narrow case returns null and this fails.
test('a narrow terminal falls back to a 1:1 banner rather than nothing', () => {
  const glyphs = demo.loadFont(demo.FONT_FILE)
  const narrow = demo.layout('docker-host', glyphs, 52, 27)
  assert.ok(narrow, 'a 52-column terminal should still get a banner')
  assert.strictEqual(narrow.sh, narrow.sv, 'the fallback is 1:1')
})

// And when it genuinely cannot fit, nothing -- rather than a banner spilling
// off both edges. Sabotage: make layout return a box unconditionally -- this
// fails.
test('an impossibly small pane gets no banner at all', () => {
  const glyphs = demo.loadFont(demo.FONT_FILE)
  assert.strictEqual(demo.layout('docker-host', glyphs, 10, 6), null)
})

// --- the effects ------------------------------------------------------------

// EVERY effect must finish. That is the whole structure borrowed from Omarchy:
// an effect that resolves and hands over reads as a demo, one that loops
// forever reads as a screensaver. An effect whose step never returns false
// would silently pin the sequence on itself for ever.
//
// Sabotage: change any effect's `step()` to `return true` -- that effect never
// completes and this fails, naming it.
test('every effect finishes', () => {
  const glyphs = demo.loadFont(demo.FONT_FILE)
  const box = demo.layout('docker-host', glyphs, 120, 34)
  const ctx = {
    ...box, cols: 120, rows: 34, theme, pxWidth: box.w / box.sh,
    ramp: demo.makeRamp(theme, mix),
  }
  for (const name of demo.EFFECT_NAMES) {
    const s = demo.EFFECTS[name](ctx)
    let f = 0
    while (s.step()) {
      if (++f > 5000) break
    }
    assert.ok(f <= 5000, `effect ${name} never finished`)
    assert.ok(f > 10, `effect ${name} finished in ${f} frames, which is not an animation`)
  }
})

// No effect may paint outside the pane. They apply dx/dy offsets -- the glitch
// shears rows sideways and scattered flies cells in from off-screen -- so the
// renderer clips, and this is the check that it does. A write past the end of a
// row would corrupt the frame the saver then emits.
//
// Sabotage: in render drop the `if (x < 0 || x >= cols || y < 0 || y >= rows)`
// guard -- scattered and glitch both push cells out of range and this fails.
test('nothing is ever painted outside the grid', () => {
  const rows = 34
  const cols = 120
  // A grid that refuses an out-of-range write, rather than one checked
  // afterwards: an assertion after the fact cannot tell a clipped write from a
  // write that never happened.
  const guard = () => Array.from({ length: rows }, () => new Proxy(new Array(cols).fill(null), {
    set(target, prop, value) {
      if (typeof prop === 'string' && /^\d+$/.test(prop)) {
        const i = Number(prop)
        assert.ok(i >= 0 && i < cols, `wrote to column ${i}, outside 0..${cols - 1}`)
      }
      target[prop] = value
      return true
    },
  }))
  for (let f = 0; f < 1600; f++) {
    demo.render({ grid: guard(), rows, cols, frame: f, theme, fg, dim: fg, mix, word: 'docker-host' })
  }
})

// The sequence actually advances: over a long run the picture changes and more
// than one effect gets a turn. Sabotage: in render stop rebuilding the session
// when `step()` returns false -- the last frame of the first effect freezes and
// this fails.
test('the sequence animates and hands over', () => {
  const rows = 34
  const cols = 120
  const sigs = new Set()
  for (let f = 0; f < 1400; f++) {
    const grid = Array.from({ length: rows }, () => new Array(cols).fill(null))
    demo.render({ grid, rows, cols, frame: f, theme, fg, dim: fg, mix, word: 'docker-host' })
    sigs.add(grid.flat().filter(Boolean).join('').length)
  }
  assert.ok(sigs.size > 20, `only ${sigs.size} distinct frames in 1400 -- it is not animating`)
})
