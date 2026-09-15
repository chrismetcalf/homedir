// tmarchy-saver's solid-geometry renderer: a z-buffered ASCII rasteriser that
// morphs between platonic solids, spinning faster when the box is busier.
//
// Real 3D. Vertices rotate through actual matrices, project with perspective,
// and faces fill by barycentric rasterisation against a depth buffer -- the far
// side is hidden because it LOSES the z test, not because a draw order was
// guessed.
//
// ONE MESH, MANY SHAPES. Morphing between differently-shaped meshes is not a
// tween: an icosahedron has 12 vertices and a cube has 8, and there is no honest
// correspondence between them. So every shape here is the SAME subdivided-
// icosahedron mesh, deformed by a radius function -- for a unit direction d each
// solid answers "how far to your surface along d?", and the vertex goes there.
// Interpolating those two answers is a continuous, artefact-free morph, and it
// is why a cube can become a dodecahedron without anything popping.
//
// A convex solid's radius along d is the nearest face plane it pierces:
// min over faces with dot(d, n) > 0 of (plane distance / dot(d, n)). That one
// line is the whole trick; each solid is just a list of planes.
//
// Shading is flat per face rather than smooth. At one character per pixel there
// are only ~8,000 samples, so smooth shading would spend its subtlety on detail
// the ten-step ramp cannot represent -- and flat facets are what make a
// polyhedron read AS a polyhedron.
//
// Character cells are about twice as tall as they are wide, so every projection
// multiplies x by ASPECT. Without it a sphere renders as a vertical ellipse.
'use strict'

const RAMP = ' .:-=+*#%@'          // low to high luminance
const ASPECT = 2.0                 // character cell height : width
const SUBDIV = 2                   // 20 -> 80 -> 320 faces, 162 vertices

const PHI = (1 + Math.sqrt(5)) / 2

// --- the mesh ---------------------------------------------------------------
function norm(p) {
  const n = Math.hypot(p[0], p[1], p[2]) || 1
  return [p[0] / n, p[1] / n, p[2] / n]
}

function icosphere(level) {
  let v = [
    [-1, PHI, 0], [1, PHI, 0], [-1, -PHI, 0], [1, -PHI, 0],
    [0, -1, PHI], [0, 1, PHI], [0, -1, -PHI], [0, 1, -PHI],
    [PHI, 0, -1], [PHI, 0, 1], [-PHI, 0, -1], [-PHI, 0, 1],
  ].map(norm)
  let f = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ]
  for (let s = 0; s < level; s++) {
    const mid = new Map()
    const midpoint = (a, b) => {
      const key = a < b ? `${a},${b}` : `${b},${a}`
      if (mid.has(key)) return mid.get(key)
      v.push(norm([
        (v[a][0] + v[b][0]) / 2, (v[a][1] + v[b][1]) / 2, (v[a][2] + v[b][2]) / 2,
      ]))
      mid.set(key, v.length - 1)
      return v.length - 1
    }
    const out = []
    for (const [a, b, c] of f) {
      const ab = midpoint(a, b), bc = midpoint(b, c), ca = midpoint(c, a)
      out.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca])
    }
    f = out
  }
  return { v, f }
}

const MESH = icosphere(SUBDIV)

// --- the shapes, as plane sets ----------------------------------------------
// Each distance is chosen so the shapes look the same SIZE on screen. A morph
// that also changes apparent size reads as a zoom rather than a change of form.
function planes(normals, d) {
  return { planes: normals.map(norm).map((n) => ({ n, d })) }
}

const SHAPES = [
  { name: 'sphere', radius: () => 0.90 },
  { name: 'cube', ...planes([[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]], 0.74) },
  {
    name: 'octahedron',
    ...planes([
      [1, 1, 1], [-1, 1, 1], [1, -1, 1], [1, 1, -1],
      [-1, -1, 1], [-1, 1, -1], [1, -1, -1], [-1, -1, -1],
    ], 0.64),
  },
  {
    name: 'dodecahedron',
    ...planes([
      [0, 1, PHI], [0, 1, -PHI], [0, -1, PHI], [0, -1, -PHI],
      [1, PHI, 0], [1, -PHI, 0], [-1, PHI, 0], [-1, -PHI, 0],
      [PHI, 0, 1], [-PHI, 0, 1], [PHI, 0, -1], [-PHI, 0, -1],
    ], 0.84),
  },
]

function radiusOf(shape, d) {
  if (shape.radius) return shape.radius()
  let best = Infinity
  for (const { n, d: dist } of shape.planes) {
    const denom = d[0] * n[0] + d[1] * n[1] + d[2] * n[2]
    if (denom > 1e-6) best = Math.min(best, dist / denom)
  }
  return Number.isFinite(best) ? best : 0.9
}

// The mesh never changes, so each shape's radius at each vertex is 162 numbers
// computed once rather than a per-frame solve.
const RADII = SHAPES.map((s) => MESH.v.map((d) => radiusOf(s, d)))

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

function faceNormal(a, b, c) {
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
  const w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]
  return norm([
    u[1] * w[2] - u[2] * w[1],
    u[2] * w[0] - u[0] * w[2],
    u[0] * w[1] - u[1] * w[0],
  ])
}

// Ease the morph so it settles into each shape. A linear morph never looks like
// it ARRIVES anywhere -- it slides through the solid on its way to the next.
const smooth = (t) => t * t * (3 - 2 * t)

// Spin tracks load per core: idle drifts, a saturated box whirls. Clamped both
// ends -- below the floor it looks frozen and reads as a hang, above the ceiling
// the facets alias into strobing.
function spinFactor(load1, cores) {
  const ratio = cores > 0 ? load1 / cores : 0
  return Math.max(0.35, Math.min(3.2, 0.35 + ratio * 3.4))
}

// --- surface points ----------------------------------------------------------
// Hosts pinned to the solid like cities on a globe: they sit ON the surface, so
// they ride the rotation and vanish round the back rather than floating in
// front of it.
//
// The direction is HASHED FROM THE LABEL rather than drawn from Math.random, so
// a host keeps its spot for the life of the process and across restarts. A
// random position re-rolled per frame would shimmer; re-rolled per run would
// mean the thing you learned to look for moves every time you glance at it.
//
// The radius is recomputed per point per frame instead of coming from the
// precomputed RADII table, because that table only covers the mesh's own 162
// vertices and a point may sit anywhere between them. Eight points against 320
// faces is nothing.
function hashDirection(label) {
  // FNV-1a, then two independent draws from it for a uniform sphere point.
  // Uniform matters: the naive (random angle, random z) picks cluster at the
  // poles, and a globe with everything at the top reads as a bug.
  let h = 2166136261
  for (let i = 0; i < label.length; i++) {
    h ^= label.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  const a = ((h >>> 0) % 100000) / 100000
  h = Math.imul(h ^ (h >>> 13), 16777619)
  const b = ((h >>> 0) % 100000) / 100000
  const z = 2 * a - 1
  const r = Math.sqrt(Math.max(0, 1 - z * z))
  const theta = 2 * Math.PI * b
  return [r * Math.cos(theta), r * Math.sin(theta), z]
}

// How hard the solid breathes, from the number of agents actually working.
//
// Zero busy returns zero on both counts, so an idle box shows a solid of a
// FIXED size rather than a slow throb -- "nothing is happening" has to look
// like nothing happening, or the animation stops carrying information.
//
// Capped at six. Past that the period drops under a second and the thing
// strobes, which is unpleasant to sit next to and no more informative than
// "lots".
function pulseFor(busy) {
  const n = Math.min(Math.max(busy | 0, 0), 6)
  if (!n) return { rate: 0, depth: 0 }
  return { rate: 0.06 + 0.045 * (n - 1), depth: 0.035 + 0.012 * (n - 1) }
}

// --- renderer ---------------------------------------------------------------
const HOLD = 240                   // frames resting on a shape
const BLEND = 140                  // frames morphing to the next

function render({ grid, rows, cols, frame, theme, fg, dim, spin = 1, right = 0, bottom = 0,
  top: reserved = 0, points = [], pulse = { rate: 0, depth: 0 } }) {
  const cycle = HOLD + BLEND
  const idx = Math.floor(frame / cycle) % SHAPES.length
  const nxt = (idx + 1) % SHAPES.length
  const phase = frame % cycle
  const t = phase < HOLD ? 0 : smooth((phase - HOLD) / BLEND)
  const ra = RADII[idx], rb = RADII[nxt]

  // Angles ACCUMULATE through spin rather than being multiplied by it. A
  // multiplied angle would teleport whenever load changed, because the same
  // frame number would suddenly mean a different rotation.
  render.a = render.a || [0, 0, 0]
  render.a[0] += spin * 0.019
  render.a[1] += spin * 0.012
  render.a[2] += spin * 0.006
  const [rx, ry, rz] = render.a

  // The solid centres in what is LEFT of the pane: the panel takes the right
  // columns and the CPU graph the bottom band. With the floating HUD gone there
  // is no longer a reason to keep clearance at the top.
  const usableW = Math.max(10, cols - right)
  // `reserved` is the alert banner, the one thing that overlays the middle.
  const top = Math.max(1, reserved)
  const floor = rows - bottom - 1
  const usable = Math.max(6, floor - top)
  // The breath PHASE accumulates, for the same reason the rotation angles do:
  // frame * rate would teleport the size the moment an agent started or
  // finished, because the same frame number would suddenly mean a different
  // point in the cycle.
  render.breath = (render.breath || 0) + pulse.rate
  // Normalised so the PEAK equals the un-pulsed size rather than exceeding it.
  // Without this the solid grows past the room reserved for it at the top of
  // the swing and the rasteriser clips it against the pane edge, which reads
  // as the shape being cut off rather than as breathing.
  const breathe = pulse.depth
    ? (1 + pulse.depth * Math.sin(render.breath)) / (1 + pulse.depth)
    : 1
  const scale = Math.min(usable * 0.52, (usableW / ASPECT) * 0.46) * breathe
  const cx = usableW / 2
  const cy = top + usable / 2
  const DIST = 4.2

  // Morph first, then rotate. The other order would rotate the two shapes
  // independently and tween between different orientations.
  const world = MESH.v.map((d, i) => {
    const r = ra[i] + (rb[i] - ra[i]) * t
    return rotate([d[0] * r, d[1] * r, d[2] * r], rx, ry, rz)
  })

  const zbuf = new Float64Array(rows * cols).fill(-Infinity)
  const LIGHT = norm([-0.5, 0.7, 1])

  for (const [ia, ib, ic] of MESH.f) {
    const a = world[ia], b = world[ib], c = world[ic]
    const n = faceNormal(a, b, c)
    if (n[2] <= 0) continue                       // backface

    const lum = Math.max(0, n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2])
    // Ambient, and never RAMP[0]: that is a SPACE, so a face turned away from
    // the light would render as a HOLE in the solid rather than a dark facet.
    const shaded = 0.12 + 0.88 * lum
    const ch = RAMP[Math.max(1, Math.min(RAMP.length - 1,
      Math.floor(shaded * (RAMP.length - 1) + 0.5)))]

    const pts = [a, b, c].map(([x, y, z]) => {
      const f = 1 / (DIST - z)
      return [cx + x * scale * ASPECT * f * DIST, cy - y * scale * f * DIST, z]
    })
    const [p0, p1, p2] = pts
    const area = (p1[0] - p0[0]) * (p2[1] - p0[1]) - (p2[0] - p0[0]) * (p1[1] - p0[1])
    if (Math.abs(area) < 1e-9) continue

    const minX = Math.max(0, Math.floor(Math.min(p0[0], p1[0], p2[0])))
    const maxX = Math.min(usableW - 1, Math.ceil(Math.max(p0[0], p1[0], p2[0])))
    const minY = Math.max(top, Math.floor(Math.min(p0[1], p1[1], p2[1])))
    const maxY = Math.min(floor, Math.ceil(Math.max(p0[1], p1[1], p2[1])))

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const px = x + 0.5, py = y + 0.5
        const w0 = ((p1[0] - px) * (p2[1] - py) - (p2[0] - px) * (p1[1] - py)) / area
        const w1 = ((p2[0] - px) * (p0[1] - py) - (p0[0] - px) * (p2[1] - py)) / area
        const w2 = 1 - w0 - w1
        if (w0 < 0 || w1 < 0 || w2 < 0) continue

        const z = w0 * p0[2] + w1 * p1[2] + w2 * p2[2]
        const i = y * cols + x
        if (z <= zbuf[i]) continue
        zbuf[i] = z

        // Colour carries depth where the ten-step ramp cannot: without it near
        // facets flatten into far ones.
        const depth = 0.35 + 0.65 * ((z + 1) / 2)
        grid[y][x] = dim(theme.accent,
          Math.max(0.15, Math.min(1, depth * (0.4 + 0.6 * lum)))) + ch
      }
    }
  }

  // --- the surface points, after the faces so they sit on top of the shading --
  //
  // Visibility is decided by the point's own outward direction, not by the
  // depth buffer: on a convex solid a surface point faces the camera exactly
  // when its normal does, and that gives the clean terminator a globe needs.
  // A z-buffer test would flicker points along the silhouette, where the point
  // and the face it sits on round to the same depth.
  for (const pt of points) {
    if (!pt || !pt.label) continue
    const d = pt.dir || (pt.dir = hashDirection(pt.label))
    const r = radiusOf(SHAPES[idx], d) * (1 - t) + radiusOf(SHAPES[nxt], d) * t
    const [x, y, z] = rotate([d[0] * r, d[1] * r, d[2] * r], rx, ry, rz)
    const n = rotate(d, rx, ry, rz)
    if (n[2] <= 0.12) continue                    // round the back, or edge-on

    const f = 1 / (DIST - z)
    const px = Math.round(cx + x * scale * ASPECT * f * DIST)
    const py = Math.round(cy - y * scale * f * DIST)
    if (py < top || py > floor || px < 0 || px >= usableW) continue

    // Fade with the terminator so points do not pop in and out at the edge.
    const near = Math.max(0.35, Math.min(1, n[2]))
    const colour = pt.colour ? dim(pt.colour, near) : dim(theme.fg, near)
    grid[py][px] = colour + '\u25c9'

    // Label only the points that are well round the front. Near the terminator
    // a label is half off the shape and reads as noise, and with eight hosts
    // there would be a ring of text round the silhouette at all times -- so
    // those keep their dot and lose their name, the way a globe does.
    if (n[2] < 0.45) continue

    // The label trails to the right. Truncated rather than wrapped: a label on
    // the next row would not be next to its point any more, which is the only
    // thing making it a label.
    const room = usableW - px - 3
    const label = pt.label.slice(0, Math.max(0, Math.min(pt.label.length, room)))
    if (label.length < 3) continue

    // A blank between the marker and the name, so the solid's own texture does
    // not run into the first digit and read as part of the address.
    grid[py][px + 1] = ' '
    const ink = dim(pt.colour || theme.fg, near * 0.85)
    for (let i = 0; i < label.length; i++) {
      const gx = px + 2 + i
      if (gx >= 0 && gx < usableW) grid[py][gx] = ink + label[i]
    }
  }

  return t > 0 ? `${SHAPES[idx].name}->${SHAPES[nxt].name}` : SHAPES[idx].name
}

module.exports = { render, SHAPES, MESH, RAMP, spinFactor, pulseFor, radiusOf, hashDirection }
