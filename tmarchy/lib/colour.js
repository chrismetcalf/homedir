// Colour arithmetic, shared.
//
// Three files needed this and two of them already had their own copy: the ping
// module's latency spectrum, the screensaver's alert pulse, and now the solid's
// breath. The copies were identical, which in this repo is the shape that
// eventually drifts -- so they live here once.
//
// Everything here works on VALUES (a '#rrggbb' string, or tmux's 'colourNNN'),
// not on escape sequences. Callers turn the result into an escape with their
// own fg()/dim(), which is what lets the same blended colour be painted at full
// strength in one place and faded by a depth factor in another.
'use strict'

function rgb(value) {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(value || '')
  return m ? [1, 2, 3].map((i) => parseInt(m[i], 16)) : null
}

// Blend a toward b. A 256-colour value (jewel) has no arithmetic between
// palette indices, so those snap to the nearer end rather than producing
// '#NaNNaNNaN' -- a coarser answer, never a broken one.
function mixHex(a, b, t) {
  const ca = rgb(a)
  const cb = rgb(b)
  if (!ca || !cb) return t < 0.5 ? a : b
  const c = [0, 1, 2].map((i) => Math.round(ca[i] + (cb[i] - ca[i]) * t))
  return '#' + c.map((n) => n.toString(16).padStart(2, '0')).join('')
}

module.exports = { rgb, mixHex }
