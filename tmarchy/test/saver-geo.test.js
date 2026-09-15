// The solid's two live signals: it SPINS with the machine's load and BREATHES
// with the number of agents actually working. Two different questions -- a box
// can be busy with one agent, or idle with six of them waiting on you -- so
// they are two signals rather than one.
//
// Every assertion is sabotage-proved in the comment above it.
'use strict'

const test = require('node:test')
const assert = require('node:assert')
const path = require('node:path')

const geo = require(path.join(__dirname, '..', '..', 'bin', 'tmarchy-geo.js'))

const theme = { accent: '#7aa2f7', fg: '#c0caf5' }
const noColour = () => ''

// Painted cells at a FIXED frame and zero spin, so the only thing that can move
// the number is the breath.
function area(pulse) {
  const rows = 30
  const cols = 80
  const grid = Array.from({ length: rows }, () => new Array(cols).fill(null))
  geo.render({ grid, rows, cols, frame: 200, theme, fg: noColour, dim: noColour, spin: 0, pulse })
  let n = 0
  for (const r of grid) for (const v of r) if (v !== null) n++
  return n
}

const series = (pulse, n) => Array.from({ length: n }, () => area(pulse))
const spread = (a) => Math.max(...a) - Math.min(...a)

// Nothing happening has to LOOK like nothing happening, or the animation stops
// carrying information. Sabotage: in pulseFor delete the
// `if (!n) return { rate: 0, depth: 0 }` line -- an idle box starts throbbing
// and this fails.
test('an idle box does not breathe at all', () => {
  const p = geo.pulseFor(0)
  assert.strictEqual(p.rate, 0)
  assert.strictEqual(p.depth, 0)
  assert.strictEqual(spread(series(p, 12)), 0, 'the solid must hold a fixed size')
})

// Sabotage: in pulseFor return a constant `{ rate: 0.06, depth: 0.035 }` for
// any non-zero n -- busier stops meaning faster and this fails.
test('more busy agents breathe faster and deeper', () => {
  const rates = [1, 2, 3, 4, 5, 6].map((n) => geo.pulseFor(n))
  for (let i = 1; i < rates.length; i++) {
    assert.ok(rates[i].rate > rates[i - 1].rate, `rate must rise: ${rates.map((r) => r.rate)}`)
    assert.ok(rates[i].depth > rates[i - 1].depth, `depth must rise: ${rates.map((r) => r.depth)}`)
  }
  // And it shows: six busy moves the solid far more than one does.
  assert.ok(spread(series(geo.pulseFor(6), 12)) > spread(series(geo.pulseFor(1), 12)) * 2,
    'six busy agents should be visibly more agitated than one')
})

// Past six the period drops under a second and it strobes, which is unpleasant
// to sit next to and no more informative than "lots". Sabotage: in pulseFor
// replace `Math.min(Math.max(busy | 0, 0), 6)` with `Math.max(busy | 0, 0)` --
// this fails.
test('the breath is capped, and nonsense input is harmless', () => {
  assert.deepStrictEqual(geo.pulseFor(12), geo.pulseFor(6), 'capped at six')
  assert.deepStrictEqual(geo.pulseFor(200), geo.pulseFor(6))
  assert.deepStrictEqual(geo.pulseFor(-3), { rate: 0, depth: 0 }, 'negative is idle')
  assert.deepStrictEqual(geo.pulseFor(undefined), { rate: 0, depth: 0 })
})

// The peak must equal the un-pulsed size, not exceed it: the solid is fitted to
// the room left between the banner and the CPU graph, and growing past that
// makes the rasteriser clip it against the pane edge -- which reads as the
// shape being cut off rather than as breathing. Sabotage: in render replace the
// normalised `breathe` with `1 + pulse.depth * Math.sin(render.breath)` -- the
// swing goes above 1 and this fails.
test('breathing never grows past the space the solid was fitted to', () => {
  const still = area(geo.pulseFor(0))
  for (const n of [1, 3, 6]) {
    const peak = Math.max(...series(geo.pulseFor(n), 40))
    assert.ok(peak <= still,
      `${n} busy peaked at ${peak} cells against a fixed size of ${still}`)
  }
})

// The phase ACCUMULATES rather than being computed from the frame number, for
// the same reason the rotation angles do: frame * rate would teleport the size
// the moment an agent started or finished, because the same frame number would
// suddenly mean a different point in the cycle. Sabotage: in render replace
// `render.breath = (render.breath || 0) + pulse.rate` with
// `render.breath = frame * pulse.rate` -- every call at frame 200 then returns
// the same size and this fails.
test('the breath advances between frames, not with the frame number', () => {
  assert.ok(spread(series(geo.pulseFor(3), 12)) > 0,
    'repeated renders at the same frame number must still advance the cycle')
})

// Spin is the OTHER signal and is unchanged -- load per core, clamped both ends.
// Sabotage: in spinFactor drop the Math.max floor -- an idle box freezes and
// reads as a hang, and this fails.
test('spin still tracks load per core, clamped at both ends', () => {
  assert.ok(geo.spinFactor(0, 20) >= 0.35, 'an idle box must still drift, not freeze')
  assert.strictEqual(geo.spinFactor(400, 20), 3.2, 'and a hammered one must not strobe')
  assert.ok(geo.spinFactor(20, 20) > geo.spinFactor(2, 20), 'busier is faster')
})
