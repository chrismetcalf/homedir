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

// Optional: the panel still renders without it, falling back to the four
// discrete bands, so a checkout missing the ping module is plainer rather than
// broken.
let latencyHex = null
try { ({ latencyHex } = require('./tmarchy-ping.js')) } catch { /* bands it is */ }

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

// os.cpus(), not /proc/stat. Node reads the same file on Linux and the
// equivalent host_statistics on macOS, so ONE code path serves both -- and a
// second path that only ever runs on the platform nobody tests is exactly the
// drift this repo keeps getting bitten by.
//
// The definitions are not quite identical: node exposes user/nice/sys/idle/irq
// and drops iowait, softirq and steal, so a busy-waiting-on-disk box reads
// slightly busier here than `/proc/stat` would say. Measured on this host
// before switching -- cumulative iowait is 0.07% of cumulative idle and the two
// readings agreed to within one point even under synthetic disk load. Excluding
// steal is arguably the better answer on a VM anyway: what is left is the time
// the guest actually got.
function cpuTicks() {
  const t = { user: 0, nice: 0, sys: 0, idle: 0, irq: 0 }
  const cpus = os.cpus()
  if (!cpus || !cpus.length) return null
  for (const c of cpus) for (const k in t) t[k] += (c.times && c.times[k]) || 0
  return { idle: t.idle, total: t.user + t.nice + t.sys + t.idle + t.irq }
}

function sampleCpu() {
  const now = cpuTicks()
  if (!now) return null
  const { idle, total } = now
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

// /proc/meminfo where it exists, os.freemem() where it does not.
//
// NOT the other way round, and not one path for both: freemem() reports
// MemFree, which counts the page cache as used, so on Linux it reads a healthy
// box at 90%+ and the gauge becomes decoration. MemAvailable is the number that
// answers "how much could a program actually get". So Linux keeps the accurate
// source and everyone else gets the portable approximation -- with the
// approximation clearly the fallback rather than the default.
function memPercent() {
  const m = readFile('/proc/meminfo')
  const grab = (k) => {
    const r = new RegExp('^' + k + ':\\s+(\\d+)', 'm').exec(m)
    return r ? Number(r[1]) : null
  }
  const total = grab('MemTotal')
  const avail = grab('MemAvailable')
  if (total && avail !== null) {
    return { pct: Math.round(100 * (1 - avail / total)), usedGb: (total - avail) / 1048576 }
  }
  const bytes = os.totalmem()
  const free = os.freemem()
  if (!bytes || !Number.isFinite(free)) return null
  return { pct: Math.round(100 * (1 - free / bytes)), usedGb: (bytes - free) / 1073741824 }
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

function render({ grid, rows, cols, frame, theme, fg, dim, stats, agents, claude, meta, ping }) {
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

  // --- the variable-height sections ------------------------------------------
  // Added LAST, and only into the rows actually left over, because the panel is
  // vertically centred and anything past the bottom is silently clipped -- on a
  // 24-row pane these would push the closing border off screen with nothing to
  // say it had gone. They are added in priority order and each one that cannot
  // fit is dropped WHOLE, header included: a rule with no rows under it is a
  // section that looks broken rather than one that looks absent.
  //
  // CLAUDE first because it is the only one of the three you might act on in
  // the next five minutes; SSH last because the resolvers are the same three
  // rows on every host while the ssh list is however long your week was.
  const TAIL_LINES = 3                        // LINK rule, strip row, border
  let budget = rows - lines.length - TAIL_LINES
  const section = (label, entries) => {
    if (!entries || !entries.length || budget < 2) return
    rule(label, '\u251c', '\u2524')
    budget--
    for (const e of entries.slice(0, budget)) {
      row(e.text, e.colour)
      budget--
    }
  }

  // Every bucket the endpoint returned, not just the worst one: the bar's job
  // is to interrupt you about the limit that matters, this panel's job is to
  // show you where all of them stand. A bucket past its OWN threshold is the
  // only thing here that turns @theme-wait -- same thresholds the bar warns on,
  // read from the same module, so the two cannot drift.
  const claudeRows = (claude || []).map((b) => ({
    text: ` ${b.label.slice(0, 6).padEnd(6)} ${bar(b.utilization, 10)} ` +
      `${(b.utilization + '%').padStart(4)} ${(b.resets || '--').padStart(3)} `,
    colour: b.over ? fg(theme.wait) : dimC,
  }))
  const reach = (list) => (list || []).map((e) => ({
    text: ` ${pingLamp(e.state)} ${e.label.slice(0, 16).padEnd(16)} ${formatRtt(e).padStart(7)} `,
    colour: pingColour(theme, fg, dim, e.state, e.ms),
  }))

  const pg = ping || {}
  section(' CLAUDE ', claudeRows)
  section(' PING ', reach(pg.net))
  section(' SSH ', reach(pg.ssh))

  rule(' LINK ', '\u251c', '\u2524')
  // Seeded by the frame rather than Math.random, so every client attached to
  // the same session flickers in step instead of each shimmering separately.
  const strip = Array.from({ length: 12 }, (_, i) =>
    ((frame * 7 + i * 31) % 11) < 4 ? '\u25aa' : '\u25ab').join('')
  const hex = ((frame * 2654435761) >>> 0).toString(16).toUpperCase().padStart(8, '0').slice(0, 6)
  row(` ${strip}  0x${hex}`, fg(theme.info))
  lines.push({ t: '\u2514' + '\u2500'.repeat(inner) + '\u2518', c: dimC })

  const y0 = Math.max(0, Math.floor((rows - lines.length) / 2))
  lines.forEach((line, i) => put(y0 + i, x0, line.t, line.c))
  return WIDTH
}


// --- reachability formatting ------------------------------------------------
// Latency has a natural direction, but it deliberately does NOT reach red: this
// panel keeps exactly one alarm colour (heat), and a host that is simply switched
// off is not an alarm. Unreachable and unmeasured go DIM, which is also what
// stops five rows going red the moment you close the laptop you last ssh'd to.
function pingLamp(state) {
  return state === 'fast' ? '\u25cf' : state === 'ok' ? '\u25c9'
    : state === 'slow' ? '\u25cd' : state === 'down' ? '\u25cb' : '\u25cc'
}

// The row's colour is now CONTINUOUS in the round-trip time rather than picked
// from the four bands -- see latencyHex in tmarchy-ping.js. The bands still
// choose the lamp glyph, which has to stay scannable at a glance; the colour
// carries the detail underneath it. The two cannot contradict each other
// because they read the same number.
//
// This does mean latency can now reach @theme-wait, which the panel otherwise
// reserves for heat. That is a deliberate relaxation: the top of the spectrum
// is several hundred milliseconds, which is worth noticing, and the gradient
// makes it obvious that the red end is one end of a scale rather than an alarm.
function pingColour(theme, fg, dim, state, ms) {
  const hex = latencyHex ? latencyHex(theme, ms, state) : null
  if (hex) return fg(hex)
  return state === 'fast' ? fg(theme.done) : state === 'ok' ? fg(theme.info)
    : state === 'slow' ? fg(theme.busy) : fg(theme.dim)
}

// Three significant figures in a seven-column field: 0.18ms reads differently
// from 180ms, and rounding both to "0ms"/"180ms" would throw away the only
// distinction a LAN row ever shows.
function formatRtt(e) {
  if (e.state === 'pending') return '\u00b7'
  if (e.ms === null || e.ms === undefined) return '\u00d7'
  if (e.ms >= 100) return `${Math.round(e.ms)}ms`
  if (e.ms >= 10) return `${e.ms.toFixed(1)}ms`
  return `${e.ms.toFixed(2)}ms`
}

// --- the CPU graph ----------------------------------------------------------
// Full width, time on X (newest at the right, the direction a timeline is read)
// and CPU on Y. Deliberately SPARSE: it is a backdrop the solid sits above, not
// a second focal point, so it plots ONE mark per column rather than filling the
// area beneath it. A filled bar chart at this width reads as a solid block of
// texture competing with the shape above it; a scatter of marks reads as an
// instrument trace.
//
// The marks are braille. A braille cell is a 2x4 dot matrix, so lighting both
// dots of one row gives a short horizontal segment at one of FOUR heights
// within a single character cell -- four sub-rows of resolution for free, which
// is what stops a six-row graph from quantising an idle machine and a busy one
// onto the same row. Bottom to top: dots 7+8, 3+6, 2+5, 1+4.
const LEVELS = ['\u28c0', '\u2824', '\u2812', '\u2809']   // bottom -> top
const AXIS_EVERY = 4               // columns between axis ticks

function renderGraph({ grid, rows, cols, theme, fg, dim, history, height }) {
  if (!history || history.length < 2 || height < 2) return 0

  const top = rows - height
  const SUB = LEVELS.length
  const trace = dim(theme.accent, 0.5)
  const head = fg(theme.accent)
  const axis = dim(theme.dim, 0.3)

  // A DOTTED axis, not a rule. A continuous line across the bottom of the pane
  // reads as a border -- something the screensaver is framed by rather than
  // something it is measuring against.
  for (let x = 0; x < cols; x += AXIS_EVERY) grid[rows - 1][x] = axis + '\u2840'

  // Newest sample at the right edge. A shorter history simply starts further
  // in rather than being stretched, so the time axis keeps a constant scale.
  const shown = history.slice(-cols)
  const x0 = cols - shown.length
  const steps = height * SUB - 1

  for (let i = 0; i < shown.length; i++) {
    const x = x0 + i
    if (x < 0 || x >= cols) continue
    const pct = Math.max(0, Math.min(100, shown[i]))
    const level = Math.round((pct / 100) * steps)     // sub-rows above the floor
    const y = rows - 1 - Math.floor(level / SUB)
    if (y < top || y >= rows) continue
    // The newest column is the bright one, the way the rain's head is: it says
    // which end of the trace is now without needing an axis label.
    const newest = i === shown.length - 1
    grid[y][x] = (newest ? head : trace) + LEVELS[level % SUB]
  }

  return height
}

module.exports = { read, sampleCpu, memPercent, render, renderGraph, WIDTH, MIN_COLS }
