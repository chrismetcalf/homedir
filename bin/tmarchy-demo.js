#!/usr/bin/env node
// The `demo` screensaver: this host's name in heavy block letters, run through
// a sequence of demo-scene effects -- colour transitions and glitches.
//
// MODELLED ON OMARCHY'S OWN SCREENSAVER, read from its source rather than from
// memory (omarchy.org/assets/js/modules/screensaver.js and
// screensaver-picker.js). Three things are taken from it deliberately:
//
//   1. THE STRUCTURE. Omarchy does not run one endless effect; it runs a
//      sequence, each effect animating to COMPLETION and then handing over to
//      the next. That is what gives it the demo feel, and it is the part worth
//      copying -- an effect that loops forever reads as a screensaver, an
//      effect that resolves and is replaced reads as a demo.
//
//   2. THE PICKER, ported exactly: an inverse-frequency shuffle where each
//      pick weights `1 / (count + 1)` so a recently-shown effect is less
//      likely next time, and the previous effect is excluded outright so
//      nothing ever runs twice in a row.
//
//   3. The 400ms blink its paintFrame toggles, here applied to the cursor
//      block that trails the banner.
//
// What is NOT copied is the effect catalogue itself: Omarchy's comes from
// `ttfx`, a WASM engine with dozens of effects, and this is a hand-written
// subset chosen to cover what was actually asked for -- colour transitions and
// glitches. The effects below are therefore in its spirit, not its letter.
//
// Glyphs come from tmarchy/lib/font-3x5.txt, the same file bin/tmarchy-splash
// reads, so the login banner and the screensaver spell the host the same way.
'use strict'

const fs = require('node:fs')
const path = require('node:path')

// --- the banner -------------------------------------------------------------

function loadFont(file) {
  const glyphs = new Map()
  let text
  try { text = fs.readFileSync(file, 'utf8') } catch { return glyphs }
  for (const line of text.split('\n')) {
    if (!line || line.startsWith('#')) continue
    const i = line.indexOf(':')
    if (i !== 1) continue                       // one-character keys only
    glyphs.set(line.slice(0, 1), line.slice(i + 1).split('/'))
  }
  return glyphs
}

const FONT_FILE = path.join(__dirname, '..', 'tmarchy', 'lib', 'font-3x5.txt')

// The lit pixels of a word, in font pixel space. Returned rather than drawn so
// the scale and the centring are the caller's business and every effect can
// work from one description.
function pixels(word, glyphs) {
  const out = []
  let x = 0
  let height = 0
  for (const ch of word.toLowerCase()) {
    const rows = glyphs.get(ch)
    if (!rows) continue
    height = Math.max(height, rows.length)
    const w = rows[0].length
    for (let py = 0; py < rows.length; py++) {
      for (let px = 0; px < w; px++) {
        if (rows[py][px] === '#') out.push({ x: x + px, y: py })
      }
    }
    x += w + 1                                  // one pixel of letter spacing
  }
  return { cells: out, width: Math.max(0, x - 1), height }
}

// Cells are about twice as tall as they are wide, so the horizontal scale is
// doubled to keep the letters from looking squashed -- the same 1:2 ratio
// Omarchy's canvas uses (cellHeight = cellWidth * 2).
function layout(word, glyphs, cols, rows) {
  const art = pixels(word, glyphs)
  if (!art.cells.length) return null
  let sv = 0
  let sh = 0
  for (let s = 4; s >= 1; s--) {
    if (art.width * s * 2 <= cols - 4 && art.height * s <= rows - 8) { sv = s; sh = s * 2; break }
  }
  // Last resort for a narrow terminal: 1:1 instead of 1:2. The letters come
  // out squashed, which is better than the banner not appearing at all -- a
  // 52-column phone cannot fit even `docker-host` at the proper ratio.
  if (!sv && art.width <= cols - 2 && art.height <= rows - 4) { sv = 1; sh = 1 }
  if (!sv) return null
  const w = art.width * sh
  const h = art.height * sv
  const x0 = Math.floor((cols - w) / 2)
  const y0 = Math.floor((rows - h) / 2)
  const out = []
  for (const p of art.cells) {
    for (let dy = 0; dy < sv; dy++) {
      for (let dx = 0; dx < sh; dx++) {
        out.push({ x: x0 + p.x * sh + dx, y: y0 + p.y * sv + dy, px: p.x, py: p.y })
      }
    }
  }
  return { cells: out, x0, y0, w, h, sv, sh }
}

// --- the picker -------------------------------------------------------------
// Ported from Omarchy's screensaver-picker.js, behaviour for behaviour: each
// pick increments that effect's count so it is less likely next time, and the
// last effect is excluded so nothing repeats back to back.
function createEffectPicker(names, random = Math.random) {
  const catalog = names.filter((n) => typeof n === 'string' && n.length > 0)
  const counts = new Map(catalog.map((n) => [n, 0]))
  let last = null

  function pick() {
    if (!catalog.length) throw new Error('effect catalog is empty')
    const pool = catalog.length === 1 ? catalog : catalog.filter((n) => n !== last)
    let total = 0
    const weights = pool.map((n) => {
      const w = 1 / ((counts.get(n) ?? 0) + 1)
      total += w
      return w
    })
    let ticket = random() * total
    let chosen = pool[pool.length - 1]
    for (let i = 0; i < pool.length; i++) {
      ticket -= weights[i]
      if (ticket <= 0) { chosen = pool[i]; break }
    }
    counts.set(chosen, (counts.get(chosen) ?? 0) + 1)
    last = chosen
    return chosen
  }
  return { pick, counts, get last() { return last } }
}

// --- effects ----------------------------------------------------------------
// Each is a factory returning { step(), cell(c, i) }. `step` advances one frame
// and returns false once the animation has RESOLVED, which is what hands over
// to the next effect; `cell` returns what to draw for one banner cell, or null
// to leave it blank this frame.
//
// `t` is progress 0..1 so every effect reads the same way regardless of how
// long it runs, and a cell's own identity (its index, its pixel coordinates)
// is what staggers it -- never Math.random per frame, which shimmers.

const BLOCK = '█'
const GLITCH_CHARS = '!<>-_\\/[]{}=+*^?#%$&@01'
const RAMP = ['░', '▒', '▓', '█']

// A deterministic 0..1 per cell, so stagger is stable across frames.
function hash01(a, b) {
  let h = 2166136261 ^ (a * 374761393) ^ (b * 668265263)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

const EFFECTS = {
  // A hue sweep across the whole word: the "colour transition" of the brief.
  colorshift(ctx) {
    const SPAN = 220
    let f = 0
    return {
      step() { return ++f < SPAN },
      cell(c) {
        const phase = (f / SPAN) * 3 + (c.px / Math.max(1, ctx.pxWidth)) * 1.2
        return { ch: BLOCK, colour: ctx.ramp(phase % 1) }
      },
    }
  },

  // Characters resolve out of noise, staggered. Colour settles with them.
  decrypt(ctx) {
    const SPAN = 200
    let f = 0
    return {
      step() { return ++f < SPAN },
      cell(c, i) {
        const start = hash01(c.px, c.py) * 0.55
        const local = (f / SPAN - start) / 0.45
        if (local <= 0) {
          const g = GLITCH_CHARS[(i + f) % GLITCH_CHARS.length]
          return { ch: g, colour: ctx.theme.dim }
        }
        if (local >= 1) return { ch: BLOCK, colour: ctx.theme.accent }
        const g = GLITCH_CHARS[(i * 7 + f * 3) % GLITCH_CHARS.length]
        return { ch: g, colour: ctx.ramp(local) }
      },
    }
  },

  // A bright leading edge sweeping left to right, leaving the word behind it.
  wipe(ctx) {
    const SPAN = 150
    let f = 0
    return {
      step() { return ++f < SPAN },
      cell(c) {
        const edge = (f / SPAN) * (ctx.w + 12) - 6
        const d = c.x - ctx.x0 - edge
        if (d > 0) return null
        if (d > -2) return { ch: BLOCK, colour: ctx.theme.fg }
        return { ch: BLOCK, colour: ctx.theme.accent }
      },
    }
  },

  // Cells fly in from scattered positions and settle onto the word.
  scattered(ctx) {
    const SPAN = 190
    let f = 0
    return {
      step() { return ++f < SPAN },
      cell(c, i) {
        const t = Math.min(1, (f / SPAN) / 0.8)
        const e = 1 - Math.pow(1 - t, 3)
        const ax = (hash01(i, 11) - 0.5) * ctx.cols
        const ay = (hash01(i, 29) - 0.5) * ctx.rows
        return {
          ch: BLOCK,
          colour: e < 1 ? ctx.ramp(e) : ctx.theme.accent,
          dx: Math.round(ax * (1 - e)),
          dy: Math.round(ay * (1 - e)),
        }
      },
    }
  },

  // The glitch: periodic bursts that shear rows sideways, corrupt characters
  // and split the colour, settling back between bursts. Bursts are driven by
  // the frame number rather than by chance, so the rhythm reads as deliberate.
  glitch(ctx) {
    const SPAN = 260
    let f = 0
    return {
      step() { return ++f < SPAN },
      cell(c, i) {
        const burst = Math.sin(f / 9) > 0.82 || Math.sin(f / 23 + 1.7) > 0.93
        if (!burst) return { ch: BLOCK, colour: ctx.theme.accent }
        const band = hash01(c.py, Math.floor(f / 3))
        const shear = band > 0.55 ? Math.round((band - 0.55) * 18) * (band > 0.8 ? -1 : 1) : 0
        const corrupt = hash01(i, f) > 0.86
        return {
          ch: corrupt ? GLITCH_CHARS[(i + f) % GLITCH_CHARS.length] : BLOCK,
          // The split: a cell lands on wait or remote instead of the accent,
          // which reads as a channel offset without needing real subpixels.
          colour: band > 0.9 ? ctx.theme.wait
            : band < 0.12 ? ctx.theme.remote : ctx.theme.accent,
          dx: shear,
        }
      },
    }
  },

  // Bottom-up burn: the word ignites from its base, running wait -> busy ->
  // done as the front passes, then cools to the accent.
  burn(ctx) {
    const SPAN = 210
    let f = 0
    return {
      step() { return ++f < SPAN },
      cell(c) {
        const rel = ctx.h <= 1 ? 1 : (c.y - ctx.y0) / (ctx.h - 1)
        const front = 1 - (f / SPAN) / 0.75
        const d = rel - front
        if (d < -0.12) return { ch: RAMP[0], colour: ctx.theme.dim }
        if (d < 0) return { ch: RAMP[1], colour: ctx.theme.wait }
        if (d < 0.1) return { ch: RAMP[3], colour: ctx.theme.busy }
        if (d < 0.22) return { ch: BLOCK, colour: ctx.theme.done }
        return { ch: BLOCK, colour: ctx.theme.accent }
      },
    }
  },

  // Alternate pixel rows slide in from opposite sides and meet.
  slide(ctx) {
    const SPAN = 160
    let f = 0
    return {
      step() { return ++f < SPAN },
      cell(c) {
        const t = Math.min(1, (f / SPAN) / 0.85)
        const e = 1 - Math.pow(1 - t, 4)
        const dir = c.py % 2 === 0 ? -1 : 1
        return {
          ch: BLOCK,
          colour: e < 1 ? ctx.ramp(e * 0.6) : ctx.theme.accent,
          dx: Math.round(dir * (1 - e) * (ctx.cols / 2 + 10)),
        }
      },
    }
  },
}


// --- the second batch -------------------------------------------------------
// Named after Omarchy's own catalogue (37 effects, read out of ttfx.wasm's
// embedded source paths) so the vocabulary matches, but written from the names
// rather than from its code -- the engine is Rust compiled to WASM and nothing
// about its implementation is readable. Where an effect could be read two
// ways, it is written to be DISTINCT from its neighbours here: `slice` splits
// at the middle row where `slide` alternates per pixel row, `expand` grows from
// the centre where `scattered` arrives from everywhere.

Object.assign(EFFECTS, {
  // Light sweeping across and down; a cell is bright as a beam crosses it and
  // stays lit behind.
  beams(ctx) {
    const SPAN = 200
    let f = 0
    return {
      step() { return ++f < SPAN },
      cell(c) {
        const t = f / SPAN
        const hx = ctx.x0 + t * 1.6 * ctx.w
        const vy = ctx.y0 + t * 1.6 * ctx.h
        const near = Math.abs(c.x - hx) < 2 || Math.abs(c.y - vy) < 1
        if (near) return { ch: BLOCK, colour: ctx.theme.fg }
        const lit = c.x < hx || c.y < vy
        return { ch: lit ? BLOCK : RAMP[0], colour: lit ? ctx.theme.accent : ctx.theme.dim }
      },
    }
  },

  // Collapse to a point, hold, then explode back out into place.
  blackhole(ctx) {
    const SPAN = 260
    let f = 0
    const cx = ctx.x0 + ctx.w / 2
    const cy = ctx.y0 + ctx.h / 2
    return {
      step() { return ++f < SPAN },
      cell(c, i) {
        const t = f / SPAN
        let k                                   // 1 = in place, 0 = at the centre
        if (t < 0.35) k = 1 - t / 0.35
        else if (t < 0.5) k = 0
        else k = Math.min(1, (t - 0.5) / 0.4)
        const spin = (1 - k) * (hash01(i, 3) - 0.5) * 6
        return {
          ch: k < 0.15 ? RAMP[1] : BLOCK,
          colour: k < 0.15 ? ctx.theme.wait : ctx.ramp(k),
          dx: Math.round((cx - c.x) * (1 - k) + spin),
          dy: Math.round((cy - c.y) * (1 - k)),
        }
      },
    }
  },

  // The word falls apart downward and fades, then reassembles.
  crumble(ctx) {
    const SPAN = 240
    let f = 0
    return {
      step() { return ++f < SPAN },
      cell(c, i) {
        const t = f / SPAN
        const lag = hash01(i, 17)
        if (t < 0.45) {
          const fall = Math.max(0, (t / 0.45 - lag * 0.6)) * 14
          return {
            ch: fall > 2 ? RAMP[1] : BLOCK,
            colour: fall > 4 ? ctx.theme.dim : ctx.ramp(1 - t / 0.45),
            dy: Math.round(fall),
          }
        }
        const back = Math.min(1, (t - 0.45) / 0.45)
        const e = 1 - Math.pow(1 - back, 3)
        return {
          ch: e > 0.8 ? BLOCK : RAMP[2],
          colour: e >= 1 ? ctx.theme.accent : ctx.ramp(e),
          dy: Math.round((1 - e) * 14 * (0.4 + lag)),
        }
      },
    }
  },

  // Cells arrive in a neighbour's place and swap pairwise into their own,
  // flashing as each pair corrects itself.
  errorcorrect(ctx) {
    const SPAN = 220
    let f = 0
    return {
      step() { return ++f < SPAN },
      cell(c, i) {
        const pair = Math.floor(i / 2)
        const when = (hash01(pair, 5) * 0.75)
        const t = f / SPAN
        const partner = ctx.cells[i ^ 1] || c
        if (t < when) {
          return {
            ch: BLOCK, colour: ctx.theme.dim,
            dx: partner.x - c.x, dy: partner.y - c.y,
          }
        }
        if (t < when + 0.06) return { ch: BLOCK, colour: ctx.theme.wait }
        return { ch: BLOCK, colour: ctx.theme.accent }
      },
    }
  },

  // Everything starts stacked at the centre and expands outward into place --
  // the orderly counterpart to `scattered`.
  expand(ctx) {
    const SPAN = 170
    let f = 0
    const cx = ctx.x0 + ctx.w / 2
    const cy = ctx.y0 + ctx.h / 2
    return {
      step() { return ++f < SPAN },
      cell(c) {
        const t = Math.min(1, (f / SPAN) / 0.85)
        const e = 1 - Math.pow(1 - t, 3)
        return {
          ch: BLOCK,
          colour: e >= 1 ? ctx.theme.accent : ctx.ramp(e),
          dx: Math.round((cx - c.x) * (1 - e)),
          dy: Math.round((cy - c.y) * (1 - e)),
        }
      },
    }
  },

  // A line in the middle opens vertically, then the word fills in horizontally.
  middleout(ctx) {
    const SPAN = 200
    let f = 0
    const my = ctx.y0 + (ctx.h - 1) / 2
    const mx = ctx.x0 + (ctx.w - 1) / 2
    return {
      step() { return ++f < SPAN },
      cell(c) {
        const t = f / SPAN
        const vOpen = Math.min(1, t / 0.45) * (ctx.h / 2 + 1)
        const hOpen = t < 0.45 ? 0 : Math.min(1, (t - 0.45) / 0.45) * (ctx.w / 2 + 1)
        if (Math.abs(c.y - my) > vOpen) return null
        if (t < 0.45) {
          return Math.abs(c.x - mx) < 1
            ? { ch: BLOCK, colour: ctx.theme.fg } : null
        }
        if (Math.abs(c.x - mx) > hOpen) return null
        return { ch: BLOCK, colour: ctx.ramp(Math.min(1, (t - 0.45) / 0.45)) }
      },
    }
  },

  // Poured in from above, column by column, settling like liquid.
  pour(ctx) {
    const SPAN = 220
    let f = 0
    return {
      step() { return ++f < SPAN },
      cell(c) {
        const t = f / SPAN
        const col = ctx.w <= 1 ? 0 : (c.x - ctx.x0) / (ctx.w - 1)
        const start = col * 0.6
        const local = (t - start) / 0.35
        if (local <= 0) return null
        if (local >= 1) return { ch: BLOCK, colour: ctx.theme.accent }
        return {
          ch: BLOCK,
          colour: ctx.ramp(local),
          dy: -Math.round((1 - local) * (ctx.rows / 2)),
        }
      },
    }
  },

  // Cut across the middle: the top half rides in from the left, the bottom
  // from the right, and they meet. Distinct from `slide`, which alternates
  // every pixel row.
  slice(ctx) {
    const SPAN = 170
    let f = 0
    const my = ctx.y0 + (ctx.h - 1) / 2
    return {
      step() { return ++f < SPAN },
      cell(c) {
        const t = Math.min(1, (f / SPAN) / 0.85)
        const e = 1 - Math.pow(1 - t, 4)
        const dir = c.y <= my ? -1 : 1
        return {
          ch: BLOCK,
          colour: e >= 1 ? ctx.theme.accent : ctx.ramp(e * 0.7),
          dx: Math.round(dir * (1 - e) * (ctx.cols / 2 + 10)),
        }
      },
    }
  },

  // Two roaming spotlights pick the word out of the dark, then the lights come
  // up on everything.
  spotlights(ctx) {
    const SPAN = 280
    let f = 0
    return {
      step() { return ++f < SPAN },
      cell(c) {
        const t = f / SPAN
        if (t > 0.82) {
          const up = (t - 0.82) / 0.18
          return { ch: BLOCK, colour: ctx.ramp(up) }
        }
        const r = Math.max(6, ctx.w / 6)
        const lit = [0, 1].some((k) => {
          const px = ctx.x0 + ctx.w * (0.5 + 0.45 * Math.sin(f / 37 + k * 2.1))
          const py = ctx.y0 + ctx.h * (0.5 + 0.45 * Math.sin(f / 23 + k * 1.3))
          // Scaled horizontally, because a circle in a 1:2 cell grid is an
          // ellipse on screen -- an unscaled radius reads as a vertical slot.
          const dx = (c.x - px) / 2
          const dy = c.y - py
          return dx * dx + dy * dy < (r / 2) * (r / 2)
        })
        return lit ? { ch: BLOCK, colour: ctx.theme.fg }
          : { ch: RAMP[0], colour: ctx.theme.dim }
      },
    }
  },

  // A bright band in from each edge, meeting in the middle.
  sweep(ctx) {
    const SPAN = 160
    let f = 0
    return {
      step() { return ++f < SPAN },
      cell(c) {
        const t = Math.min(1, f / SPAN / 0.9)
        const reach = t * (ctx.w / 2 + 3)
        const from = c.x - ctx.x0
        const d = Math.min(from, ctx.w - 1 - from)
        if (d > reach) return null
        if (d > reach - 2) return { ch: BLOCK, colour: ctx.theme.fg }
        return { ch: BLOCK, colour: ctx.theme.accent }
      },
    }
  },

  // Jitter that decays: the word shakes itself still.
  unstable(ctx) {
    const SPAN = 230
    let f = 0
    return {
      step() { return ++f < SPAN },
      cell(c, i) {
        const t = f / SPAN
        const amp = Math.max(0, 1 - t / 0.85)
        if (amp <= 0) return { ch: BLOCK, colour: ctx.theme.accent }
        // Jitter is hashed on the FRAME as well as the cell, which is the one
        // place per-frame variation is wanted -- the whole effect is instability.
        const jx = Math.round((hash01(i, f) - 0.5) * amp * 8)
        const jy = Math.round((hash01(i + 9901, f) - 0.5) * amp * 3)
        return {
          ch: hash01(i, f + 7) > 0.93 ? GLITCH_CHARS[(i + f) % GLITCH_CHARS.length] : BLOCK,
          colour: ctx.ramp(1 - amp),
          dx: jx, dy: jy,
        }
      },
    }
  },

  // VHS tracking: horizontal bands shear as a tracking line rolls down the
  // word, with the colour bleeding at the band edges.
  vhstape(ctx) {
    const SPAN = 300
    let f = 0
    return {
      step() { return ++f < SPAN },
      cell(c, i) {
        const roll = (f * 0.6) % (ctx.h + 6) - 3
        const dist = Math.abs(c.y - (ctx.y0 + roll))
        if (dist < 1.5) {
          // The tracking line itself: heavily sheared and bleeding.
          const band = hash01(c.y, Math.floor(f / 2))
          return {
            ch: band > 0.7 ? GLITCH_CHARS[(i + f) % GLITCH_CHARS.length] : BLOCK,
            colour: band > 0.5 ? ctx.theme.remote : ctx.theme.wait,
            dx: Math.round((band - 0.5) * 14),
          }
        }
        if (dist < 4) {
          const bleed = hash01(c.y, 31)
          return {
            ch: BLOCK,
            colour: bleed > 0.5 ? ctx.theme.info : ctx.theme.accentAlt,
            dx: Math.round((bleed - 0.5) * 4),
          }
        }
        return { ch: BLOCK, colour: ctx.theme.accent }
      },
    }
  },
})

const EFFECT_NAMES = Object.keys(EFFECTS)

// --- the renderer -----------------------------------------------------------

let glyphs = null

// A three-stop ramp through the theme, which is what makes the colour
// transitions read as part of tmarchy rather than as a rainbow: accent ->
// accent-alt -> info, the same family the solid's breath uses.
function makeRamp(theme, mix) {
  const stops = [theme.accent, theme.accentAlt || theme.accent, theme.info || theme.accent]
  return (t) => {
    const u = Math.max(0, Math.min(1, t)) * (stops.length - 1)
    const i = Math.min(stops.length - 2, Math.floor(u))
    return mix(stops[i], stops[i + 1], u - i)
  }
}

const state = { session: null, name: '', picker: null, key: '' }

function render({ grid, rows, cols, frame, theme, fg, dim, mix, word }) {
  if (!glyphs) glyphs = loadFont(process.env.TMARCHY_FONT || FONT_FILE)
  const box = layout(word, glyphs, cols, rows)
  if (!box) return 0

  // A resize invalidates the geometry, so the session is rebuilt against the
  // new box rather than animating cells that no longer exist.
  const key = `${cols}x${rows}:${word}`
  if (!state.picker) state.picker = createEffectPicker(EFFECT_NAMES)
  if (state.key !== key) { state.key = key; state.session = null }

  const ctx = {
    ...box, cols, rows, theme, pxWidth: Math.max(1, box.w / box.sh),
    ramp: makeRamp(theme, mix),
    // `errorcorrect` swaps cells with a partner, so it needs to see the whole
    // list rather than just the cell it is being asked about.
    cells: box.cells,
  }
  // $TMARCHY_DEMO_EFFECT pins one effect and replays it, which is how you look
  // at a single one without waiting for the shuffle to offer it -- nineteen
  // effects at 8-15s each is a long time to sit through to judge `vhstape`.
  // An unknown name is ignored rather than fatal: this is a screensaver.
  const forced = EFFECTS[process.env.TMARCHY_DEMO_EFFECT] ? process.env.TMARCHY_DEMO_EFFECT : null
  if (!state.session) {
    state.name = forced || state.picker.pick()
    state.session = EFFECTS[state.name](ctx)
  }
  // Omarchy advances the session and starts the next effect the moment the
  // current one reports it has finished; the same here.
  if (!state.session.step()) {
    state.name = forced || state.picker.pick()
    state.session = EFFECTS[state.name](ctx)
  }

  box.cells.forEach((c, i) => {
    const v = state.session.cell(c, i, ctx)
    if (!v) return
    const x = c.x + (v.dx || 0)
    const y = c.y + (v.dy || 0)
    if (x < 0 || x >= cols || y < 0 || y >= rows) return
    grid[y][x] = fg(v.colour) + v.ch
  })

  // The cursor block that trails the word, blinking on Omarchy's 400ms.
  // At 20fps that is every 8 frames.
  if (Math.floor(frame / 8) % 2 === 0) {
    const cx = box.x0 + box.w + 2
    const cy = box.y0 + box.h - 1
    if (cx < cols && cy >= 0 && cy < rows) grid[cy][cx] = fg(theme.fg) + BLOCK
  }

  return box.h
}

module.exports = {
  render, createEffectPicker, EFFECT_NAMES, EFFECTS,
  pixels, layout, loadFont, hash01, makeRamp, FONT_FILE,
}
