// tmarchy-saver's right-hand telemetry column.
//
// The sci-fi console panel: bars, readouts and blinking indicators. Every light
// is driven by something real -- the NET lamp flickers because bytes actually
// moved, the CPU bar is /proc/stat deltas, the agent lamps are the same
// sessionState() the bar and the pickers use. Decorative blinking would be
// easier and would also be a lie, and this panel sits next to numbers you might
// actually act on.
//
// Sampling is stateful: CPU and network are RATES, so they need two readings.
// read() keeps the previous sample and returns deltas, which is why the caller
// must call it on a timer rather than per frame -- per frame the deltas would be
// noise divided by 50ms.
'use strict'

const fs = require('node:fs')
const os = require('node:os')

const WIDTH = 30                  // panel columns, border included
const MIN_COLS = 74               // below this the pane belongs to the solid

// --- sampling ---------------------------------------------------------------
function readFile(p) {
  try { return fs.readFileSync(p, 'utf8') } catch { return '' }
}

// CPU is sampled on its OWN cadence, faster than the panel's data tick, because
// it feeds the timeline graph as well as the gauge: at one sample per data tick
// a 120-column graph would take eight minutes to fill. One sampler serves both,
// so the gauge and the right-hand end of the graph cannot disagree -- two
// samplers sharing /proc/stat would each steal the other's delta.
let prevCpu = null
let lastCpu = null
// Long enough for the widest pane; the graph takes the newest `cols` samples,
// so a narrow pane shows less history rather than a squashed version of all of
// it.
const HISTORY_MAX = 400
const history = []

function sampleCpu() {
  const line = readFile('/proc/stat').split('\n')[0]
  const n = line.trim().split(/\s+/).slice(1).map(Number)
  if (n.length < 4) return null
  const idle = n[3] + (n[4] || 0)
  const total = n.reduce((a, b) => a + b, 0)
  const prev = prevCpu
  prevCpu = { idle, total }
  if (!prev) return null
  const dt = total - prev.total
  if (dt <= 0) return null
  const pct = Math.max(0, Math.min(100, Math.round(100 * (1 - (idle - prev.idle) / dt))))
  lastCpu = pct
  history.push(pct)
  if (history.length > HISTORY_MAX) history.shift()
  return pct
}

function memPercent() {
  const m = readFile('/proc/meminfo')
  const grab = (k) => {
    const r = new RegExp('^' + k + ':\\s+(\\d+)', 'm').exec(m)
    return r ? Number(r[1]) : null
  }
  const total = grab('MemTotal')
  const avail = grab('MemAvailable')
  if (!total || avail === null) return null
  return { pct: Math.round(100 * (1 - avail / total)), usedGb: (total - avail) / 1048576 }
}

// Physical interfaces only. lo is not traffic, and a box running containers has
// a dozen veth/docker/br- devices whose counters double-count the real NIC.
function isPhysical(name) {
  return !/^(lo|docker|veth|br-|virbr|tun|tap)/.test(name)
}

let prevNet = null
function netRate() {
  let rx = 0, tx = 0
  for (const line of readFile('/proc/net/dev').split('\n').slice(2)) {
    const m = /^\s*([^:]+):\s*(.*)$/.exec(line)
    if (!m || !isPhysical(m[1].trim())) continue
    const f = m[2].trim().split(/\s+/).map(Number)
    rx += f[0] || 0
    tx += f[8] || 0
  }
  const now = Date.now()
  const prev = prevNet
  prevNet = { rx, tx, now }
  if (!prev) return null
  const secs = (now - prev.now) / 1000
  if (secs <= 0) return null
  return { rx: Math.max(0, (rx - prev.rx) / secs), tx: Math.max(0, (tx - prev.tx) / secs) }
}

function diskPercent() {
  try {
    const s = fs.statfsSync('/')
    const used = s.blocks - s.bfree
    return Math.round(100 * (used / s.blocks))
  } catch { return null }
}

function temperature() {
  const raw = readFile('/sys/class/thermal/thermal_zone0/temp').trim()
  if (!raw) return null
  const t = Number(raw)
  return Number.isFinite(t) ? Math.round(t / 1000) : null
}

// The panel's slower tick. CPU is deliberately NOT read here -- sampleCpu owns
// it on its own cadence and read() simply reports what that sampler last saw,
// so the gauge always matches the newest column of the graph.
function read() {
  return {
    cpuHistory: history,
    cpu: lastCpu,
    mem: memPercent(),
    net: netRate(),
    disk: diskPercent(),
    temp: temperature(),
    cores: os.cpus().length,
    load: os.loadavg().map((l) => l.toFixed(2)),
  }
}

// --- drawing ----------------------------------------------------------------
function bar(pct, width) {
  if (pct === null || pct === undefined) return '·'.repeat(width)
  const filled = Math.round((pct / 100) * width)
  return '▓'.repeat(filled) + '░'.repeat(Math.max(0, width - filled))
}

function humanRate(bytes) {
  if (bytes === null || bytes === undefined) return '   --'
  if (bytes > 1048576) return (bytes / 1048576).toFixed(1) + 'M'
  if (bytes > 1024) return Math.round(bytes / 1024) + 'K'
  return Math.round(bytes) + 'B'
}

// A lamp's BRIGHTNESS is the signal and its blink is the decoration. Tying the
// blink phase to the value as well would make an idle lamp look broken rather
// than idle.
function lamp(active, frame, phase) {
  if (!active) return '○'
  return (Math.floor(frame / 4) + phase) % 3 === 0 ? '◉' : '●'
}

function render({ grid, rows, cols, frame, theme, fg, dim, stats, agents, quota, meta }) {
  if (cols < MIN_COLS || rows < 14) return 0

  const x0 = cols - WIDTH
  const put = (y, x, text, colour) => {
    if (y < 0 || y >= rows) return
    for (const ch of text) {
      if (x >= 0 && x < cols) grid[y][x] = colour + ch
      x++
    }
  }

  const dimC = fg(theme.dim)
  const accC = fg(theme.accent)
  const fgC = fg(theme.fg)
  const s = stats || {}

  // Heat is the one reading with a natural danger direction, so it is the one
  // that changes colour. Everything else stays in the theme's own palette --
  // a panel where five things can turn red is a panel you stop reading.
  const tempColour = s.temp === null || s.temp === undefined ? dimC
    : s.temp >= 80 ? fg(theme.wait) : s.temp >= 65 ? fg(theme.busy) : fg(theme.done)

  const netActive = s.net && (s.net.rx > 2048 || s.net.tx > 2048)
  const lines = []

  // Build every row from its CONTENT and pad to width here, rather than
  // hand-counting spaces in each template. The first version counted by hand
  // and every gauge row came out five columns short of its own border, which
  // looks like a box-drawing bug rather than an arithmetic one.
  const inner = WIDTH - 2
  const row = (content, colour) => {
    const text = content.length > inner ? content.slice(0, inner) : content.padEnd(inner)
    lines.push({ t: '\u2502' + text + '\u2502', c: colour })
  }
  const rule = (label, left, right_) => {
    const dashes = Math.max(0, inner - label.length - 1)
    lines.push({ t: left + '\u2500' + label + '\u2500'.repeat(dashes) + right_, c: dimC })
  }

  const m = meta || {}
  rule(` ${(m.theme || 'tmarchy').toUpperCase()} `, '\u250c', '\u2510')
  const up = m.uptimeHours === undefined ? '--'
    : m.uptimeHours >= 48 ? `${Math.floor(m.uptimeHours / 24)}d` : `${m.uptimeHours}h`
  row(` ${(m.host || '?').slice(0, 16).padEnd(16)} up ${up.padStart(5)}`, fgC)
  rule(' SYS ', '\u251c', '\u2524')
  row(` ${lamp(true, frame, 0)} CPU ${bar(s.cpu, 10)} ${String(s.cpu ?? '--').padStart(3)}%`, accC)
  row(` ${lamp(true, frame, 1)} MEM ${bar(s.mem && s.mem.pct, 10)} ${String((s.mem && s.mem.pct) ?? '--').padStart(3)}%`, accC)
  row(` ${lamp(true, frame, 2)} DSK ${bar(s.disk, 10)} ${String(s.disk ?? '--').padStart(3)}%`, accC)
  row(` ${lamp(netActive, frame, 0)} NET \u2193${humanRate(s.net && s.net.rx).padStart(5)} \u2191${humanRate(s.net && s.net.tx).padStart(5)}`, fgC)
  row(` ${lamp(true, frame, 1)} TMP ${String(s.temp ?? '--').padStart(3)}\u00b0C   ${s.cores ?? '--'} cores`, tempColour)
  row(`   LOAD ${(s.load || ['--', '--', '--']).join('  ')}`, dimC)

  rule(' AGENTS ', '\u251c', '\u2524')
  const list = (agents || []).slice(0, 5)
  if (!list.length) row('   no live agents', dimC)
  for (const a of list) {
    const g = a.state === 'wait' ? '\u25c9' : a.state === 'busy' ? '\u25cd' : '\u25ce'
    const c = a.state === 'wait' ? fg(theme.wait) : a.state === 'busy' ? fg(theme.busy) : fg(theme.done)
    row(` ${g} ${a.label.slice(0, 16).padEnd(16)} ${a.state.padEnd(4)}`, c)
  }

  rule(' LINK ', '\u251c', '\u2524')
  // Seeded by the frame rather than Math.random, so every client attached to
  // the same session flickers in step instead of each shimmering separately.
  const strip = Array.from({ length: 12 }, (_, i) =>
    ((frame * 7 + i * 31) % 11) < 4 ? '\u25aa' : '\u25ab').join('')
  const hex = ((frame * 2654435761) >>> 0).toString(16).toUpperCase().padStart(8, '0').slice(0, 6)
  row(` ${strip}  0x${hex}`, fg(theme.info))
  const q = quota === null || quota === undefined ? '--' : quota + '%'
  row(` QUOTA ${bar(quota, 10)} ${q.padStart(4)}`,
    quota !== null && quota !== undefined && quota >= 60 ? fg(theme.wait) : dimC)
  lines.push({ t: '\u2514' + '\u2500'.repeat(inner) + '\u2518', c: dimC })

  const y0 = Math.max(0, Math.floor((rows - lines.length) / 2))
  lines.forEach((line, i) => put(y0 + i, x0, line.t, line.c))
  return WIDTH
}

// --- the CPU graph ----------------------------------------------------------
// Full width, time on X (newest at the right, the direction a timeline is read)
// and CPU on Y. Deliberately SUBTLE: it is a backdrop the solid sits above, not
// a second focal point, so it is drawn in @theme-dim with only the crest in the
// accent -- enough to read the shape at a glance without competing.
//
// Eighth-blocks give eight sub-rows of resolution per character cell, so a
// six-row graph resolves ~48 levels rather than 6. Without them a busy machine
// and an idle one look like the same flat band.
const EIGHTHS = ['\u2581', '\u2582', '\u2583', '\u2584', '\u2585', '\u2586', '\u2587', '\u2588']

function renderGraph({ grid, rows, cols, theme, fg, dim, history, height }) {
  if (!history || history.length < 2 || height < 2) return 0

  const top = rows - height
  const body = dim(theme.dim, 0.85)
  const crest = fg(theme.accent)

  // Newest sample at the right edge. A shorter history simply starts further
  // in rather than being stretched, so the time axis keeps a constant scale.
  const shown = history.slice(-cols)
  const x0 = cols - shown.length

  for (let i = 0; i < shown.length; i++) {
    const x = x0 + i
    if (x < 0 || x >= cols) continue
    const pct = Math.max(0, Math.min(100, shown[i]))
    const units = Math.round((pct / 100) * height * 8)
    if (units <= 0) continue

    const full = Math.floor(units / 8)
    const part = units % 8

    for (let r = 0; r < full; r++) {
      const y = rows - 1 - r
      if (y >= top && y < rows) grid[y][x] = body + '\u2588'
    }
    if (part > 0) {
      const y = rows - 1 - full
      if (y >= top && y < rows) grid[y][x] = body + EIGHTHS[part - 1]
    }
    // The crest: the single cell at the top of each column, in the accent, which
    // is what makes the profile legible against its own fill.
    const cy = rows - 1 - (part > 0 ? full : Math.max(0, full - 1))
    if (cy >= top && cy < rows && grid[cy][x] !== null) {
      grid[cy][x] = crest + (part > 0 ? EIGHTHS[part - 1] : '\u2588')
    }
  }

  // A baseline, so an idle machine still shows an axis rather than nothing.
  for (let x = 0; x < cols; x++) {
    if (grid[rows - 1][x] === null) grid[rows - 1][x] = dim(theme.dim, 0.35) + '\u2581'
  }
  return height
}

module.exports = { read, sampleCpu, render, renderGraph, WIDTH, MIN_COLS }
