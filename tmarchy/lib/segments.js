// Segment loading and rendering. The governing rule from the spec is that a
// broken segment must never break the bar, so every call is individually
// guarded and failures degrade to "this value is absent".
const fs = require('node:fs')
const path = require('node:path')

function loadSegments(dir) {
  let entries
  try {
    entries = fs.readdirSync(dir)
  } catch {
    return []
  }
  const segments = []
  for (const file of entries.filter(f => f.endsWith('.js')).sort()) {
    let mod
    try {
      mod = require(path.join(dir, file))
    } catch {
      continue
    }
    if (mod && typeof mod.name === 'string' && typeof mod.render === 'function') {
      segments.push(mod)
    }
  }
  return segments
}

function renderSegments(segments, ctx) {
  const out = {}
  for (const segment of segments) {
    try {
      if (typeof segment.enabled === 'function' && !segment.enabled(ctx)) continue
      const value = segment.render(ctx)
      if (value === null || value === undefined) continue
      const text = String(value)
      if (text.length) out[segment.name] = text
    } catch {
      // Deliberately swallowed: one bad segment must not take the bar with it.
    }
  }
  return out
}

module.exports = { loadSegments, renderSegments }
