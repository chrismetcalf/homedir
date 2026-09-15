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
  assert.deepStrictEqual(geo.pulseFor(-3), { rate: 0, depth: 0, swing: 0 }, 'negative is idle')
  assert.deepStrictEqual(geo.pulseFor(undefined), { rate: 0, depth: 0, swing: 0 })
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

// The floor is defence in depth and the comment says so rather than naming a
// sabotage that does not bite: `fromLoad` already starts AT 0.35, so removing
// the outer `Math.max(0.35, ...)` alone changes nothing. Sabotage: remove BOTH,
// i.e. `const fromLoad = ratio * 3.4` AND the outer floor -- an idle box then
// freezes completely, which reads as a hang rather than as idle, and this
// fails. Either change alone leaves the other holding.
test('spin tracks load per core, clamped at both ends', () => {
  assert.ok(geo.spinFactor(0, 20) >= 0.35, 'an idle box must still drift, not freeze')
  assert.strictEqual(geo.spinFactor(400, 20), 3.2, 'and a hammered one must not strobe')
  assert.ok(geo.spinFactor(20, 20) > geo.spinFactor(2, 20), 'busier is faster')
})

// Agents spin it up even when they cost no CPU -- which is most of what an
// agent does, since one blocked on an API call contributes nothing to the load
// average. Sabotage: in spinFactor replace `Math.max(fromLoad, fromAgents)`
// with `fromLoad` -- agents stop moving the spin and this fails.
test('agents spin it up even on an idle machine', () => {
  const idle = geo.spinFactor(0.1, 20, 0)
  assert.ok(geo.spinFactor(0.1, 20, 1) > idle, 'one agent should already be faster')
  for (let n = 2; n <= 6; n++) {
    assert.ok(geo.spinFactor(0.1, 20, n) > geo.spinFactor(0.1, 20, n - 1),
      `${n} agents should out-spin ${n - 1}`)
  }
})

// MAX, not sum: agents usually ARE the load, so adding the two would
// double-count the common case and peg the spin the moment anything happened.
// Sabotage: in spinFactor replace `Math.max(fromLoad, fromAgents)` with
// `fromLoad + fromAgents` -- a lightly loaded box with one agent jumps most of
// the way to the ceiling and this fails.
test('load and agents are combined by taking the busier, not by adding', () => {
  const load = 1.9
  const cores = 20
  const oneAgent = geo.spinFactor(load, cores, 1)
  assert.ok(oneAgent < 1.2,
    `one agent on a lightly loaded box should stay gentle, got ${oneAgent}`)
  // And a hammered machine is already at the ceiling, so agents cannot push it
  // past -- there is nowhere past.
  assert.strictEqual(geo.spinFactor(400, cores, 6), 3.2)
  assert.strictEqual(geo.spinFactor(400, cores, 0), 3.2)
})

// Both signals saturate at the SAME count, so one does not keep climbing after
// the other has stopped. Sabotage: in spinFactor replace `n * 0.48` with
// `n * 0.2` -- six agents then reach 1.55 instead of the ceiling, so the spin
// still has room to grow when the breath has none, and this fails.
//
// (Note the obvious sabotage here is not one: removing the `Math.min(..., 6)`
// cap changes nothing, because the outer clamp already stops at 3.2. The cap
// earns its place in pulseFor, not here.)
test('spin and breath saturate at the same agent count', () => {
  assert.strictEqual(geo.spinFactor(0.1, 20, 6), 3.2, 'spin maxes at six')
  assert.deepStrictEqual(geo.pulseFor(6), geo.pulseFor(12), 'and so does the breath')
})

// --- the breath is a colour as well as a size -------------------------------
//
// Size alone is easy to miss on a shape that is also rotating: a few percent of
// radius reads as the rotation rather than as a signal. A hue shift in step
// with it is unmistakable from across the room.

// Every painted tone, across a cycle. `dim` is stubbed to hand back the colour
// VALUE it was given, so this reads what the renderer chose rather than a
// brightness-faded version of it.
function tones(pulse, frames) {
  const theme = { accent: '#7aa2f7', accentAlt: '#bb9af7', fg: '#c0caf5' }
  const seen = new Set()
  for (let i = 0; i < frames; i++) {
    const rows = 20
    const cols = 60
    const grid = Array.from({ length: rows }, () => new Array(cols).fill(null))
    geo.render({ grid, rows, cols, frame: 200, theme, fg: noColour,
      dim: (v) => v + '|', spin: 0, pulse })
    for (const r of grid) for (const v of r) if (v) seen.add(v.split('|')[0])
  }
  return seen
}

// Idle must be ONE colour, for the same reason it must be one size. Sabotage:
// in render replace `const swing = Math.min(1, pulse.depth / 0.095)` with
// `const swing = 1` -- an idle box starts shifting hue and this fails.
test('an idle solid holds a single colour', () => {
  const seen = tones(geo.pulseFor(0), 24)
  assert.strictEqual(seen.size, 1, `expected one tone, got ${[...seen].join(' ')}`)
  assert.ok(seen.has('#7aa2f7'), 'and it should be the theme accent')
})

// Sabotage: in render replace `tone` in the `grid[y][x] = dim(tone, ...)`
// assignment with `theme.accent` -- the colour stops moving with the breath and
// this fails.
test('a busy solid shifts colour as it breathes', () => {
  assert.ok(tones(geo.pulseFor(3), 24).size > 5,
    'three busy agents should sweep a range of tones')
  // Deliberately NOT "six visits more distinct tones than one". That was the
  // assertion here, and the count of distinct shades is a bad proxy for how far
  // the sweep travels -- a slower breath lingers and visits MORE intermediate
  // values per frame sampled, so one busy agent can out-count six while
  // covering a third of the ramp. Distance is measured properly below, on the
  // red channel's extent.
})

const RAMP_THEME = { accent: '#7aa2f7', accentAlt: '#bb9af7', fg: '#c0caf5',
  wait: '#f7768e', busy: '#e0af68' }

function rampTones(busy, frames) {
  const seen = new Set()
  for (let i = 0; i < frames; i++) {
    const rows = 20
    const cols = 60
    const grid = Array.from({ length: rows }, () => new Array(cols).fill(null))
    geo.render({ grid, rows, cols, frame: 200, theme: RAMP_THEME, fg: noColour,
      dim: (v) => v + '|', spin: 0, pulse: geo.pulseFor(busy) })
    for (const r of grid) for (const v of r) if (v) seen.add(v.split('|')[0])
  }
  return seen
}

const redOf = (hex) => parseInt(hex.slice(1, 3), 16)

// The sweep has to ARRIVE somewhere, not just drift a few shades. Reaching
// @theme-busy is the point: it means "an agent is working" everywhere else in
// this config, and the breath is driven by exactly that. Sabotage: in render
// drop the third stop, leaving `[theme.accent, theme.accentAlt || theme.accent]`
// -- the sweep stops at purple, never gets near orange, and this fails.
test('a fully busy solid sweeps all the way into the orange', () => {
  const reds = [...rampTones(6, 60)].map(redOf)
  assert.ok(Math.max(...reds) >= 0xd0,
    `expected the ramp to reach orange, peaked at red=${Math.max(...reds).toString(16)}`)
  assert.ok(Math.min(...reds) <= 0x82,
    'and to come back down to the accent at the bottom of the breath')
})

// But it must stop AT orange. @theme-wait means "an agent needs you", the
// sticky banner owns it, and a solid that went red while nothing was asking
// would be a lie. Sabotage: in render append `theme.wait` as a fourth stop --
// tones run past orange into red and this fails.
test('the breath stops at orange and never reaches the alert red', () => {
  for (const busy of [1, 3, 6]) {
    for (const t of rampTones(busy, 60)) {
      assert.ok(redOf(t) <= redOf(RAMP_THEME.busy),
        `busy=${busy}: tone ${t} is redder than @theme-busy, i.e. past orange`)
      assert.notStrictEqual(t, RAMP_THEME.wait, 'never the alert colour itself')
    }
  }
})

// Fewer busy agents means a shorter journey along the same ramp, so the amount
// of colour still carries the count. Sabotage: in pulseFor replace
// `swing: 0.55 + 0.09 * (n - 1)` with `swing: 1` -- one busy agent sweeps as
// far as six and this fails.
test('how far along the ramp it gets tracks how many are busy', () => {
  const peak = (n) => Math.max(...[...rampTones(n, 60)].map(redOf))
  assert.ok(peak(6) > peak(3), `six should out-reach three: ${peak(6)} vs ${peak(3)}`)
  assert.ok(peak(3) > peak(1), `three should out-reach one: ${peak(3)} vs ${peak(1)}`)
})

// A theme with no accent-alt must not produce 'undefined' as a colour.
// Sabotage: in render drop the `|| theme.accent` fallback -- mixHex is handed
// undefined, returns it at the top of the swing, and this fails.
test('a theme without an accent-alt degrades to its accent', () => {
  // A WHOLE CYCLE, not one frame. mixHex returns the second colour only once
  // the blend passes halfway, and the breath phase is a module-level
  // accumulator carried in from earlier tests -- so a single frame lands
  // wherever it happens to land and passed with the fallback deleted. At
  // pulseFor(4) the period is ~32 frames, so 48 covers it with room to spare.
  const theme = { accent: '#7aa2f7', fg: '#c0caf5' }
  const seen = new Set()
  for (let i = 0; i < 48; i++) {
    const rows = 20
    const cols = 60
    const grid = Array.from({ length: rows }, () => new Array(cols).fill(null))
    geo.render({ grid, rows, cols, frame: 200, theme, fg: noColour,
      dim: (v) => v + '|', spin: 0, pulse: geo.pulseFor(4) })
    for (const r of grid) for (const v of r) if (v) seen.add(v.split('|')[0])
  }
  assert.deepStrictEqual([...seen], ['#7aa2f7'],
    `every tone should be the accent, got ${[...seen].join(' ')}`)
})
