// tmarchy-saver's solid-geometry renderer: a z-buffered ASCII rasteriser.
//
// Real 3D, not an animated sprite. Vertices are rotated by actual matrices,
// projected with perspective, and the faces are filled by barycentric
// rasterisation against a depth buffer, so the far side of the solid is hidden
// because it LOSES the z test rather than because a draw order was guessed.
//
// Shading is flat per face (one normal, one lambert term) rather than smooth.
// Two reasons, and the first is the honest one: at one character per pixel the
// screen has perhaps 8,000 samples, and smooth shading spends its subtlety on
// detail the ASCII ramp cannot represent. The second is that flat faces make a
// polyhedron read AS a polyhedron -- the facets are the shape.
//
// Character cells are about twice as tall as they are wide, so every projection
// multiplies x by ASPECT. Without it a sphere renders as a vertical ellipse and
// a cube looks like a door.
'use strict'

const RAMP = ' .:-=+*#%@'          // low to high luminance
const ASPECT = 2.0                 // character cell height : width

// --- solids -----------------------------------------------------------------
// Unit-ish, centred on the origin. Faces are triangles wound counter-clockwise
// when seen from outside, which is what makes the backface test a sign check.
const PHI = (1 + Math.sqrt(5)) / 2

function icosahedron() {
  const v = [
    [-1, PHI, 0], [1, PHI, 0], [-1, -PHI, 0], [1, -PHI, 0],
    [0, -1, PHI], [0, 1, PHI], [0, -1, -PHI], [0, 1, -PHI],
    [PHI, 0, -1], [PHI, 0, 1], [-PHI, 0, -1], [-PHI, 0, 1],
  ].map((p) => {
    const n = Math.hypot(...p)
    return p.map((c) => c / n)
  })
  const f = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ]
  return { v, f, name: 'icosahedron' }
}

function cube() {
  const v = [
    [-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1],
    [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1],
  ].map((p) => p.map((c) => c * 0.62))
  const q = [
    [0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4],
    [2, 3, 7, 6], [0, 4, 7, 3], [1, 2, 6, 5],
  ]
  const f = []
  for (const [a, b, c, d] of q) f.push([a, b, c], [a, c, d])
  return { v, f, name: 'cube' }
}

function octahedron() {
  const s = 0.92
  const v = [[s, 0, 0], [-s, 0, 0], [0, s, 0], [0, -s, 0], [0, 0, s], [0, 0, -s]]
  const f = [
    [0, 2, 4], [2, 1, 4], [1, 3, 4], [3, 0, 4],
    [2, 0, 5], [1, 2, 5], [3, 1, 5], [0, 3, 5],
  ]
  return { v, f, name: 'octahedron' }
}

const SOLIDS = [icosahedron(), cube(), octahedron()]

// --- maths ------------------------------------------------------------------
function rotate([x, y, z], ax, ay, az) {
  let c = Math.cos(ax), s = Math.sin(ax)
  ;[y, z] = [y * c - z * s, y * s + z * c]
  c = Math.cos(ay); s = Math.sin(ay)
  ;[x, z] = [x * c + z * s, -x * s + z * c]
  c = Math.cos(az); s = Math.sin(az)
  ;[x, y] = [x * c - y * s, x * s + y * c]
  return [x, y, z]
}

function normal(a, b, c) {
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
  const w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]
  const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]]
  const len = Math.hypot(...n) || 1
  return n.map((v) => v / len)
}

// --- renderer ---------------------------------------------------------------
// Writes shaded characters and a colour into the caller's grid. The grid is the
// same one the rain renderer fills, so the HUD and agent nodes paint over this
// identically and neither renderer needs to know about them.
function render({ grid, rows, cols, frame, theme, fg, dim }) {
  // One solid at a time, swapped every so often so a long look is not static.
  const solid = SOLIDS[Math.floor(frame / 900) % SOLIDS.length]

  const ax = frame * 0.021
  const ay = frame * 0.013
  const az = frame * 0.007

  // Fit to the smaller axis so the solid never runs off a narrow pane, and leave
  // the top row and the bottom four to the nodes and the HUD -- the solid is
  // centred in what is LEFT, not in the whole pane, or it collides with both.
  const top = 2
  const bottom = rows - 5
  const usable = Math.max(6, bottom - top)
  const scale = Math.min(usable * 0.40, (cols / ASPECT) * 0.40)
  const cx = cols / 2
  const cy = top + usable / 2
  const DIST = 4.2

  const zbuf = new Float64Array(rows * cols).fill(-Infinity)

  // A light from the upper-left-front, the direction that reads as lit to
  // almost everyone, and the same one the classic donut uses.
  const LIGHT = (() => {
    const l = [-0.5, 0.7, 1]
    const n = Math.hypot(...l)
    return l.map((c) => c / n)
  })()

  for (const face of solid.f) {
    const world = face.map((i) => rotate(solid.v[i], ax, ay, az))
    const n = normal(...world)

    // Backface cull. The eye looks down -z from +z, so a face pointing away has
    // a normal with a non-positive z component after rotation.
    if (n[2] <= 0) continue

    const lum = Math.max(0, n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2])

    // Ambient, and never RAMP[0]. RAMP[0] is a SPACE, so a face turned fully
    // away from the light would render as nothing at all -- a hole in the solid
    // rather than a dark facet, which reads as a rasteriser bug. The floor of 1
    // keeps an unlit face present as '.', so the silhouette stays whole and the
    // shape still reads as a shape when it turns away from the light.
    const shaded = 0.12 + 0.88 * lum
    const ch = RAMP[Math.max(1, Math.min(RAMP.length - 1,
      Math.floor(shaded * (RAMP.length - 1) + 0.5)))]

    // Perspective projection. Depth is kept for the z test.
    const pts = world.map(([x, y, z]) => {
      const f = 1 / (DIST - z)
      return [cx + x * scale * ASPECT * f * DIST, cy - y * scale * f * DIST, z]
    })

    const minX = Math.max(0, Math.floor(Math.min(...pts.map((p) => p[0]))))
    const maxX = Math.min(cols - 1, Math.ceil(Math.max(...pts.map((p) => p[0]))))
    const minY = Math.max(0, Math.floor(Math.min(...pts.map((p) => p[1]))))
    const maxY = Math.min(rows - 1, Math.ceil(Math.max(...pts.map((p) => p[1]))))

    const [p0, p1, p2] = pts
    const area = (p1[0] - p0[0]) * (p2[1] - p0[1]) - (p2[0] - p0[0]) * (p1[1] - p0[1])
    if (Math.abs(area) < 1e-9) continue

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        // Barycentric coordinates at the cell centre.
        const px = x + 0.5, py = y + 0.5
        const w0 = ((p1[0] - px) * (p2[1] - py) - (p2[0] - px) * (p1[1] - py)) / area
        const w1 = ((p2[0] - px) * (p0[1] - py) - (p0[0] - px) * (p2[1] - py)) / area
        const w2 = 1 - w0 - w1
        if (w0 < 0 || w1 < 0 || w2 < 0) continue

        const z = w0 * p0[2] + w1 * p1[2] + w2 * p2[2]
        const idx = y * cols + x
        if (z <= zbuf[idx]) continue
        zbuf[idx] = z

        // Colour carries depth where the ramp cannot: the ramp is only ten
        // steps, so near faces would flatten into far ones without it. Nearer
        // is brighter, and the whole solid is drawn in the theme's accent so it
        // belongs to the same bar as everything else.
        const depth = 0.35 + 0.65 * ((z + 1) / 2)
        grid[y][x] = dim(theme.accent, Math.max(0.15, Math.min(1, depth * (0.4 + 0.6 * lum)))) + ch
      }
    }
  }

  return solid.name
}

module.exports = { render, SOLIDS, RAMP }
