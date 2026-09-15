// The screensaver's reachability sampler.
//
// Everything asserted here is pure: no ping is spawned, no /etc is read, no
// network is touched. The parsing and the trimming are where the bugs live --
// an actual round trip only proves the network was up when the suite ran.
//
// Every assertion is sabotage-proved in the comment above it.
'use strict'

const test = require('node:test')
const assert = require('node:assert')
const path = require('node:path')

const ping = require(path.join(__dirname, '..', '..', 'bin', 'tmarchy-ping.js'))
const panel = require(path.join(__dirname, '..', '..', 'bin', 'tmarchy-panel.js'))

// --- host extraction --------------------------------------------------------

// `ssh -p 22 host` must not report its host as "22". Sabotage: in
// bin/tmarchy-ping.js replace the SSH_VALUE_FLAGS contents with `''.split('')`
// -- every flag's argument then looks like a hostname and this fails.
test('a flag that takes a value does not become the host', () => {
  assert.strictEqual(ping.sshHostFromCommand('ssh -p 22 bastion'), 'bastion')
  assert.strictEqual(ping.sshHostFromCommand('ssh -o StrictHostKeyChecking=no arcturus'),
    'arcturus')
  assert.strictEqual(ping.sshHostFromCommand('ssh -i ~/.ssh/id_ed25519 truenas'), 'truenas')
  // A bundled group: only the LAST letter can take a value.
  assert.strictEqual(ping.sshHostFromCommand('ssh -4vp 2222 octoprint'), 'octoprint')
  assert.strictEqual(ping.sshHostFromCommand('ssh -4v freenas'), 'freenas')
})

// user@host, and only ssh. Sabotage: replace
// `const host = w.includes('@') ? w.slice(w.lastIndexOf('@') + 1) : w` with
// `const host = w` -- the user survives into the hostname and this fails.
test('the user is stripped and non-ssh commands are ignored', () => {
  assert.strictEqual(ping.sshHostFromCommand('ssh krezel@192.168.1.2'), '192.168.1.2')
  assert.strictEqual(ping.sshHostFromCommand('ssh-add -l'), null)
  assert.strictEqual(ping.sshHostFromCommand('scp a b'), null)
  assert.strictEqual(ping.sshHostFromCommand('ssh'), null)
})

// zsh EXTENDED_HISTORY carries the timestamp we sort by. Sabotage: in
// sshHostsFromHistory replace `const when = ext ? Number(ext[1]) : 0` with
// `const when = 0` -- every host dates to the epoch and this fails.
test('history timestamps are read from the extended-history prefix', () => {
  const m = ping.sshHostsFromHistory([
    ': 1689209014:0;ssh old-box',
    ': 1701449762:0;ssh new-box',
    'ssh unstamped-box',
  ].join('\n'))
  assert.strictEqual(m.get('old-box'), 1689209014)
  assert.strictEqual(m.get('new-box'), 1701449762)
  assert.strictEqual(m.get('unstamped-box'), 0)
})

// Newest first, and a host seen in two sources takes its NEWER date. Sabotage:
// in mergeSshHosts replace `.sort((a, b) => b[1] - a[1])` with
// `.sort((a, b) => a[1] - b[1])` -- the list reverses and this fails.
test('hosts are ordered newest-first across both sources', () => {
  const history = new Map([['alpha', 100], ['beta', 300]])
  const frecency = new Map([['gamma', 200], ['delta', 50]])
  assert.deepStrictEqual(ping.mergeSshHosts([history, frecency]),
    ['beta', 'gamma', 'alpha', 'delta'])
})

// Sabotage: in mergeSshHosts replace `if (!all.has(host) || all.get(host) < when)`
// with `if (!all.has(host))` -- the first source read wins regardless of date
// and this fails.
test('a host in both sources is dated by the more recent one', () => {
  const stale = new Map([['shared', 100], ['other', 250]])
  const fresh = new Map([['shared', 400]])
  assert.deepStrictEqual(ping.mergeSshHosts([stale, fresh]), ['shared', 'other'])
})

// The limit is a limit -- asserted against SSH_LIMIT rather than a hardcoded
// five, since that number is a tuning decision (it went 5 -> 13 when the
// screensaver started pinning every tracked host to the solid) and a test that
// pins the value would fail for the wrong reason next time it moves. What must
// hold is that the cap applies and keeps the NEWEST. Sabotage: replace
// `.slice(0, limit)` with `.slice(0)` -- this fails.
test('only the most recent hosts survive, up to the limit', () => {
  const n = ping.SSH_LIMIT
  const m = new Map()
  for (let i = 0; i < n + 3; i++) m.set(`h${i}`, 1000 - i)   // h0 newest
  const got = ping.mergeSshHosts([m])
  assert.strictEqual(got.length, n, `expected ${n} hosts, got ${got.length}`)
  assert.strictEqual(got[0], 'h0', 'newest first')
  assert.strictEqual(got[n - 1], `h${n - 1}`, 'and cut at the limit')
  assert.ok(!got.includes(`h${n}`), 'the one past the limit is gone')
  // An explicit limit still overrides, which is what the panel's row budget uses.
  assert.deepStrictEqual(ping.mergeSshHosts([m], 2), ['h0', 'h1'])
})

// --- resolvers --------------------------------------------------------------

// systemd-resolved's upstreams, not its loopback stub. Sabotage: in
// dnsFromResolvectl remove `&& !isLoopback(ip)` -- the stub comes back as a
// resolver and this fails.
test('resolvectl output yields real upstreams, never the loopback stub', () => {
  const out = [
    'Global: 127.0.0.53',
    'Link 2 (enp2s0): 45.90.28.87 45.90.30.87',
    'Link 4 (br-9312e4c110cc):',
    'Link 5 (docker0):',
  ].join('\n')
  assert.deepStrictEqual(ping.dnsFromResolvectl(out), ['45.90.28.87', '45.90.30.87'])
})

// resolv.conf itself is parsed verbatim -- the loopback filter belongs to the
// caller, which needs to SEE the stub in order to know to look past it.
// Sabotage: in dnsFromResolvConf change the regex to `/^\s*server\s+(\S+)/` --
// nothing matches and this fails.
test('resolv.conf nameserver lines are parsed as written', () => {
  const conf = 'nameserver 127.0.0.53\noptions edns0 trust-ad\nsearch example.ts.net\n'
  assert.deepStrictEqual(ping.dnsFromResolvConf(conf), ['127.0.0.53'])
  assert.ok(ping.isLoopback('127.0.0.53'), '127.0.0.53 should read as loopback')
})

// Precedence, with no /etc and no resolvectl in sight. Sabotage: in
// chooseResolvers swap the first two clauses, i.e. put the
// `if (upstreams && upstreams.length)` line first -- a host with real
// nameservers in resolv.conf starts preferring systemd's copy and this fails.
test('a real nameserver outranks the upstreams behind a stub', () => {
  // Real resolvers present: use them, and never consult the upstreams.
  assert.deepStrictEqual(
    ping.chooseResolvers(['192.168.1.1', '9.9.9.9'], ['45.90.28.87']),
    ['192.168.1.1', '9.9.9.9'])
  // Only a stub: fall through to what resolvectl reported.
  assert.deepStrictEqual(
    ping.chooseResolvers(['127.0.0.53'], ['45.90.28.87', '45.90.30.87']),
    ['45.90.28.87', '45.90.30.87'])
  // A stub and nothing else known: ping the stub rather than showing nothing.
  assert.deepStrictEqual(ping.chooseResolvers(['127.0.0.53'], null), ['127.0.0.53'])
  assert.deepStrictEqual(ping.chooseResolvers([], null), [])
})

// Two rows, never more: the section has a fixed height so the ssh list below it
// has a predictable budget. Sabotage: drop every `.slice(0, 2)` from
// chooseResolvers -- a host with four nameservers returns four and this fails.
test('at most two resolvers are pinged', () => {
  assert.strictEqual(ping.chooseResolvers(['1.1.1.1', '8.8.8.8', '9.9.9.9'], null).length, 2)
  assert.strictEqual(
    ping.chooseResolvers(['127.0.0.53'], ['a.b', 'c.d', 'e.f']).length, 2)
})

// --- ping invocation --------------------------------------------------------

// macOS reads -W as MILLISECONDS, so `-W 2` there is a two-millisecond timeout
// and every host on earth appears down. Sabotage: in pingArgs make the darwin
// branch identical to the other -- this fails, and it is the only thing in the
// suite that can catch it, since the suite runs on Linux.
test('macOS gets -t, not the millisecond -W', () => {
  const linux = ping.pingArgs('linux', 'example.net')
  const mac = ping.pingArgs('darwin', 'example.net')
  assert.ok(linux.includes('-W'), 'linux should pass -W')
  assert.ok(!mac.includes('-W'), 'darwin must not pass -W')
  assert.ok(mac.includes('-t'), 'darwin should pass -t')
  assert.strictEqual(linux[linux.length - 1], 'example.net')
  assert.strictEqual(mac[mac.length - 1], 'example.net')
})

// A host called `-f` is flood mode, and these names come out of shell history.
// Sabotage: in isSafeHost change the leading class to `/^[A-Za-z0-9-]...` --
// `-f` passes validation and this fails.
test('a hostname cannot begin with a dash', () => {
  assert.strictEqual(ping.isSafeHost('-f'), false)
  assert.strictEqual(ping.isSafeHost('--flood'), false)
  assert.strictEqual(ping.isSafeHost(''), false)
  assert.strictEqual(ping.isSafeHost('host;rm -rf /'), false)
  assert.strictEqual(ping.isSafeHost('192.168.1.2'), true)
  assert.strictEqual(ping.isSafeHost('fe80::1'), true)
  assert.strictEqual(ping.isSafeHost('chrismetcalf.net'), true)
})

// Sabotage: in parseRtt drop the `\s*` before `ms` -- busybox's `time=12.3ms`
// stops parsing and this fails.
test('round-trip times parse from both ping spellings', () => {
  assert.strictEqual(ping.parseRtt('64 bytes from h: seq=0 ttl=57 time=12.3 ms'), 12.3)
  assert.strictEqual(ping.parseRtt('64 bytes from h: seq=0 ttl=57 time=12.3ms'), 12.3)
  assert.strictEqual(ping.parseRtt('Destination Host Unreachable'), null)
  assert.strictEqual(ping.parseRtt(''), null)
})

// Sabotage: in latencyState replace `if (ms < 50)` with `if (ms < 5000)` --
// everything reads fast and this fails.
test('latency states are banded, and an unmeasured host is down', () => {
  assert.strictEqual(ping.latencyState(0.2), 'fast')
  assert.strictEqual(ping.latencyState(149), 'ok')
  assert.strictEqual(ping.latencyState(400), 'slow')
  assert.strictEqual(ping.latencyState(null), 'down')
})

// --- rendering --------------------------------------------------------------

function textOf(grid) {
  // Cells hold `<colour escape><char>`; the char is always the last of them.
  return grid.map((r) => r.map((c) => (c === null ? ' ' : [...c].pop())).join('')).join('\n')
}

function drawPanel(rows, pingData, agents = AGENTS, claude = CLAUDE) {
  const cols = 100
  const grid = Array.from({ length: rows }, () => new Array(cols).fill(null))
  panel.render({
    grid, rows, cols, frame: 0,
    theme: { dim: '#565f89', accent: '#7aa2f7', fg: '#c0caf5', done: '#9ece6a',
      busy: '#e0af68', wait: '#f7768e', info: '#73daca' },
    fg: () => '', dim: () => '',
    stats: { cpu: 9, mem: { pct: 20 }, disk: 62, net: { rx: 1, tx: 1 }, temp: 28,
      cores: 20, load: ['1.00', '1.00', '1.00'] },
    agents, claude, meta: { theme: 'tokyo-night', host: 'h', uptimeHours: 5 },
    ping: pingData,
  })
  return textOf(grid)
}

// Five agents, because that is the panel's real shape: the agent list is capped
// at five and a host running agents is the case where space is actually tight.
const AGENTS = ['one', 'two', 'three', 'four', 'five'].map((l) => ({ label: l, state: 'idle' }))

const CLAUDE = [
  { label: '5h', utilization: 45, resets: '2h', over: false },
  { label: 'week', utilization: 65, resets: '3d', over: false },
]

const FULL = {
  net: [
    { label: '45.90.28.87', ms: 3.4, state: 'fast' },
    { label: '45.90.30.87', ms: 149, state: 'ok' },
    { label: 'chrismetcalf.net', ms: 5.7, state: 'fast' },
  ],
  ssh: ['a', 'b', 'c', 'd', 'e'].map((l) => ({ label: l, ms: 1, state: 'fast' })),
}

// Sabotage: in render replace `if (!entries || !entries.length || budget < 2)
// return` with `if (!entries || !entries.length) return` -- on the short pane
// the extra rows push the closing border past the bottom and this fails.
test('the variable sections are trimmed to fit rather than clipped off', () => {
  const tall = drawPanel(40, FULL)
  for (const s of ['CLAUDE', 'PING', 'SSH', 'LINK']) {
    assert.ok(tall.includes(s), `a tall pane should show the ${s} section`)
  }
  assert.ok(tall.includes('\u2514'), 'a tall pane should still close its border')

  // Enough room for CLAUDE and PING but not for SSH: the whole SSH section
  // goes, header included, rather than leaving a rule with nothing under it.
  const short = drawPanel(24, FULL)
  assert.ok(short.includes('CLAUDE'), 'CLAUDE has the highest priority')
  assert.ok(short.includes('PING'), 'PING outranks SSH')
  assert.ok(!short.includes('SSH'), 'SSH is trimmed first')
  assert.ok(short.includes('\u2514'), 'the closing border must never be pushed off')

  // Squeezed harder: CLAUDE alone survives, and the border still closes.
  const tiny = drawPanel(20, FULL)
  assert.ok(tiny.includes('CLAUDE'), 'CLAUDE is the last section standing')
  assert.ok(!tiny.includes('PING'), 'PING goes before CLAUDE does')
  assert.ok(tiny.includes('\u2514'), 'the closing border must never be pushed off')
})

// Sabotage: in render replace `entries.slice(0, budget)` with `entries` -- the
// section stops respecting the budget it was given and this fails.
test('a section that half fits shows the rows that fit', () => {
  // Room for SSH, but not for all five of it: the section appears with as many
  // rows as fit, which is what proves the budget is per-row and not per-section.
  const between = drawPanel(29, FULL)
  const sshRows = between.split('\n')
    .filter((l) => /\u2502 [\u25cf\u25c9\u25cd\u25cb\u25cc] [a-e] /.test(l))
  assert.ok(sshRows.length > 0 && sshRows.length < 5,
    `expected a partial ssh list, got ${sshRows.length} rows`)
  assert.ok(between.includes('\u2514'), 'the closing border must never be pushed off')
})

// The CLAUDE section carries every bucket, its own reset countdown, and turns
// @theme-wait only for a bucket past its threshold. Sabotage: in render replace
// `colour: b.over ? fg(theme.wait) : dimC` with `colour: dimC` -- the over-limit
// row stops being distinguishable and this fails.
test('every quota bucket gets a row, and only an over-limit one is coloured', () => {
  const marks = []
  const text = (() => {
    const cols = 100, rows = 40
    const grid = Array.from({ length: rows }, () => new Array(cols).fill(null))
    panel.render({
      grid, rows, cols, frame: 0,
      theme: { dim: '#565f89', accent: '#7aa2f7', fg: '#c0caf5', done: '#9ece6a',
        busy: '#e0af68', wait: '#f7768e', info: '#73daca' },
      fg: (c) => { marks.push(c); return c === '#f7768e' ? '!' : '' }, dim: () => '',
      stats: {}, agents: [], ping: { net: [], ssh: [] },
      meta: { theme: 't', host: 'h', uptimeHours: 1 },
      claude: [
        { label: '5h', utilization: 45, resets: '2h', over: false },
        { label: 'week', utilization: 65, resets: '3d', over: false },
        { label: 'opus', utilization: 91, resets: '3d', over: true },
      ],
    })
    return textOf(grid)
  })()

  const lines = text.split('\n')
  assert.ok(lines.some((l) => l.includes('5h') && l.includes('45%') && l.includes('2h')),
    'the five-hour row should carry its percentage and its reset')
  assert.ok(lines.some((l) => l.includes('week') && l.includes('65%')), 'week row missing')
  assert.ok(lines.some((l) => l.includes('opus') && l.includes('91%')), 'opus row missing')
  // Only the over-limit row asked for the alarm colour.
  assert.strictEqual(marks.filter((c) => c === '#f7768e').length, 1,
    'exactly one row should paint in @theme-wait')
})

// Unmeasured and unreachable are DIFFERENT, and neither is a number. Sabotage:
// in formatRtt replace the `e.state === 'pending'` line with
// `if (e.state === 'pending') return '×'` -- a host that has not been
// measured yet claims to be down and this fails.
test('a pending host reads differently from a dead one', () => {
  const text = drawPanel(40, {
    net: [{ label: 'waiting', ms: null, state: 'pending' },
      { label: 'dead', ms: null, state: 'down' }],
    ssh: [],
  })
  const waiting = text.split('\n').find((l) => l.includes('waiting'))
  const dead = text.split('\n').find((l) => l.includes('dead'))
  assert.ok(waiting.includes('·'), 'a pending host should show a dot')
  assert.ok(!waiting.includes('×'), 'a pending host must not claim to be down')
  assert.ok(dead.includes('×'), 'an unreachable host should show a cross')
})

// Three significant figures: 0.18ms and 180ms are the whole story on a LAN row.
// Sabotage: in formatRtt return `${Math.round(e.ms)}ms` unconditionally -- the
// sub-millisecond row collapses to "0ms" and this fails.
test('sub-millisecond and three-digit times both survive the format', () => {
  const text = drawPanel(40, {
    net: [{ label: 'near', ms: 0.182, state: 'fast' },
      { label: 'far', ms: 149.3, state: 'ok' }],
    ssh: [],
  })
  assert.ok(text.includes('0.18ms'), 'a sub-millisecond time keeps two decimals')
  assert.ok(text.includes('149ms'), 'a three-digit time drops them')
})

// --- a host without resolvectl ----------------------------------------------

// The stubbed callbacks land on nextTick, so a round's result is not visible
// until the queue drains. Every assertion about "how many rounds asked" has to
// wait here or it measures the in-flight guard instead.
const drain = () => new Promise((resolve) => setImmediate(resolve))

// Loads a FRESH copy of the sampler with child_process stubbed, so nothing is
// ever spawned and the module's own module-level flags start clean. It has to
// be patched BEFORE the require: tmarchy-ping destructures execFile at load
// time, so patching afterwards would be a no-op that silently let the real
// binaries run.
function pingWithStubbedExec(handler) {
  const cp = require('node:child_process')
  const fsMod = require('node:fs')
  const spec = require.resolve(path.join(__dirname, '..', '..', 'bin', 'tmarchy-ping.js'))
  const realExec = cp.execFile
  const realRead = fsMod.readFileSync
  cp.execFile = (file, args, opts, cb) => {
    process.nextTick(() => handler(file, cb, args))
    return {}
  }
  // A loopback-only resolv.conf is what makes round() reach for resolvectl.
  fsMod.readFileSync = (f, ...rest) =>
    (f === '/etc/resolv.conf' ? 'nameserver 127.0.0.1\n' : realRead(f, ...rest))
  delete require.cache[spec]
  const mod = require(spec)
  return {
    mod,
    restore() {
      cp.execFile = realExec
      fsMod.readFileSync = realRead
      delete require.cache[spec]
    },
  }
}

// Sabotage: in refreshUpstreams remove `upstreamsUnavailable` (both the guard in
// the first line and the assignment in the ENOENT branch) -- every round reaches
// for a binary that is not there and this fails. Nothing else in the suite
// notices, because this host HAS resolvectl.
test('a host with no resolvectl is asked once, not every round', async () => {
  let asked = 0
  const { mod, restore } = pingWithStubbedExec((file, cb) => {
    if (file === 'resolvectl') {
      asked++
      const e = new Error('ENOENT'); e.code = 'ENOENT'
      return cb(e, '', '')
    }
    return cb(null, '', '')            // a stubbed ping that answers nothing
  })
  try {
    // DRAIN between rounds. Without this the in-flight guard alone holds the
    // count at 1 and the assertion passes whether the give-up flag exists or
    // not -- which is how this test was first written, and its sibling below is
    // what exposed it.
    for (let i = 0; i < 6; i++) { mod.start(); mod.stop(); await drain() }
    assert.strictEqual(asked, 1, `resolvectl should be asked once, was asked ${asked}`)
  } finally { restore() }
})

// A non-zero EXIT is different from a missing binary: resolvectl said something,
// and might not say it next time. Sabotage: in refreshUpstreams widen the
// give-up branch to `if (err)` -- one transient failure silences the lookup for
// the life of the process and this fails.
test('a transient resolvectl failure does not silence it forever', async () => {
  let asked = 0
  const { mod, restore } = pingWithStubbedExec((file, cb) => {
    if (file === 'resolvectl') {
      asked++
      const e = new Error('exit 1'); e.code = 1     // ran, and failed
      return cb(e, '', '')
    }
    return cb(null, '', '')
  })
  try {
    for (let i = 0; i < 3; i++) { mod.start(); mod.stop(); await drain() }
    assert.strictEqual(asked, 3, `a transient failure should be retried, asked ${asked}`)
  } finally { restore() }
})

// --- the latency spectrum ---------------------------------------------------

// Continuous, not banded: two hosts that are both "fast" must not look
// identical when one is a hundred times closer. Sabotage: in latencyHex return
// `stops[i]` instead of `mixHex(stops[i], stops[i + 1], seg - i)` -- the scale
// collapses back to four discrete colours and this fails.
test('latency colour varies continuously, not in four steps', () => {
  const theme = { done: '#9ece6a', info: '#73daca', busy: '#e0af68', wait: '#f7768e', dim: '#565f89' }
  const seen = new Set()
  for (const ms of [0.15, 0.5, 2, 5.8, 15, 30, 60, 149, 400]) {
    seen.add(ping.latencyHex(theme, ms, 'fast'))
  }
  assert.ok(seen.size >= 8,
    `nine distinct latencies should give ~nine colours, got ${seen.size}`)
})

// Slower is further along the scale. Asserted on latencyPosition, NOT on a
// colour channel: the palette goes green -> teal -> amber -> red, and green to
// teal lowers the red channel, so no channel is monotone across the gradient.
// The first version of this test asserted one anyway and failed against correct
// code. Sabotage: in latencyPosition drop the Math.log10 wrapper and use the
// raw ratio -- everything under a hundred milliseconds collapses to ~0 and the
// strict increases fail.
test('slower latency sits further along the scale', () => {
  const ladder = [0.15, 1, 5, 20, 80, 300, 1500].map((ms) => ping.latencyPosition(ms))
  for (let i = 1; i < ladder.length; i++) {
    assert.ok(ladder[i] > ladder[i - 1],
      `position must strictly increase: ${ladder.map((n) => n.toFixed(3)).join(' ')}`)
  }
  assert.strictEqual(ping.latencyPosition(0.001), 0, 'clamped at the fast end')
  assert.strictEqual(ping.latencyPosition(99999), 1, 'clamped at the slow end')
})

// The ends of the gradient are the palette's own colours, not something mixed.
// Sabotage: in latencyHex replace `stops[i + 1]` with `stops[i]` -- the top of
// the scale never reaches wait and this fails.
test('the scale ends on the theme colours it claims to', () => {
  const theme = { done: '#9ece6a', info: '#73daca', busy: '#e0af68', wait: '#f7768e', dim: '#565f89' }
  assert.strictEqual(ping.latencyHex(theme, 5000, 'slow'), theme.wait, 'the top is wait')
  assert.strictEqual(ping.latencyHex(theme, 0.01, 'fast'), theme.done, 'the bottom is done')
})

// Unreachable is NOT the slow end of the scale -- it is off the scale, and
// painting it red would make a switched-off laptop look like a network
// emergency. Sabotage: in latencyHex delete the `state === 'down'` clause --
// a down host takes the fast colour (ms is null, clamped to the floor) and
// this fails.
test('down and pending are dim, not part of the spectrum', () => {
  const theme = { done: '#9ece6a', info: '#73daca', busy: '#e0af68', wait: '#f7768e', dim: '#565f89' }
  assert.strictEqual(ping.latencyHex(theme, null, 'down'), theme.dim)
  assert.strictEqual(ping.latencyHex(theme, null, 'pending'), theme.dim)
})

// jewel is 256-colour and has no arithmetic between palette indices. Sabotage:
// in mixHex remove the `if (!ca || !cb)` guard -- it returns '#NaNNaNNaN' and
// this fails.
test('a 256-colour theme degrades to the nearest stop, not a broken colour', () => {
  const jewel = { done: 'colour34', info: 'colour37', busy: 'colour214', wait: 'colour160', dim: 'colour240' }
  for (const ms of [0.2, 5, 50, 500]) {
    const c = ping.latencyHex(jewel, ms, 'fast')
    assert.match(c, /^colour\d+$/, `expected a palette index, got ${c}`)
  }
})

// --- the agent section is budgeted, not capped ------------------------------

// It used to render `agents.slice(0, 5)` regardless of how many were running,
// so a sixth and seventh agent vanished with nothing on screen to say so.
// Sabotage: in render replace `(agents || []).map(...)` with
// `(agents || []).slice(0, 5).map(...)` -- the old behaviour returns and this
// fails at every height.
test('every live agent gets a row, however many there are', () => {
  const many = ['one', 'two', 'three', 'four', 'five', 'six', 'seven']
    .map((label, i) => ({ label, state: i === 0 ? 'wait' : 'idle' }))
  for (const rows of [44, 36, 30, 24, 20]) {
    const text = drawPanel(rows, FULL, many)
    for (const a of many) {
      assert.ok(text.includes(a.label),
        `rows=${rows}: agent "${a.label}" is missing from the panel`)
    }
    assert.ok(text.includes('└'), `rows=${rows}: the border must still close`)
  }
})

// Agents outrank everything else that shares the row budget: they are the only
// section about work waiting on YOU. Sabotage: in render move the
// `section(' AGENTS ', agentRows)` call below `section(' SSH ', ...)` -- on a
// short pane the ssh list survives and the agents do not, and this fails.
test('when space runs out, agents are the last section standing', () => {
  const many = ['one', 'two', 'three', 'four', 'five', 'six', 'seven']
    .map((label) => ({ label, state: 'idle' }))
  const tiny = drawPanel(20, FULL, many)
  assert.ok(tiny.includes('AGENTS'), 'AGENTS must survive')
  assert.ok(!tiny.includes('SSH'), 'SSH should have gone first')
  assert.ok(!tiny.includes('PING'), 'PING should have gone too')
  assert.ok(tiny.includes('└'), 'the border must still close')
})

// A subagent count rides on its parent's row rather than getting a row of its
// own: a Task subagent is not somewhere you can navigate to, and listing it as
// a peer would imply it is. Sabotage: in render drop the
// `${a.subagents ? ' +' + ... : ''}` suffix -- this fails.
test('an agent running subagents says so on its own row', () => {
  const text = drawPanel(40, FULL, [
    { label: 'tmarchy', state: 'busy', subagents: 3 },
    { label: 'otto', state: 'idle', subagents: 0 },
  ])
  const busy = text.split('\n').find((l) => l.includes('tmarchy'))
  const idle = text.split('\n').find((l) => l.includes('otto'))
  assert.ok(busy.includes('+3'), `expected a subagent count: ${busy.trim()}`)
  assert.ok(!idle.includes('+'), `no subagents means no tag: ${idle.trim()}`)
})

// --- ssh aliases ------------------------------------------------------------
//
// A name out of the shell history may be an ssh ALIAS, not a hostname:
// `Host pipad-lan / HostName 192.168.1.21` has no DNS record, so pinging the
// literal name failed and the panel showed a perfectly healthy host as
// unreachable. Four of the thirteen hosts tracked here were aliases.

// `ssh -G` echoes the whole effective config; the wanted line is `hostname X`,
// and it is nowhere near the start. Sabotage: in hostnameFromSshConfig drop the
// `m` flag from the regex -- it then only matches at the very start of the
// output and this fails.
test('the real hostname is pulled out of ssh -G output', () => {
  const out = [
    'user krezel',
    'hostname 192.168.1.21',
    'port 22',
    'identityfile ~/.ssh/id_ed25519',
  ].join('\n')
  assert.strictEqual(ping.hostnameFromSshConfig(out), '192.168.1.21')
  assert.strictEqual(
    ping.hostnameFromSshConfig('hostname octoprint.pirate-sailfin.ts.net'),
    'octoprint.pirate-sailfin.ts.net')
})

// No hostname line, or one that could be read as a flag, yields nothing -- the
// caller then pings the name as given rather than something crafted. Sabotage:
// in hostnameFromSshConfig drop the `isSafeHost(m[1])` guard -- the `-f` case
// comes back and this fails.
test('a missing or unsafe hostname yields nothing', () => {
  assert.strictEqual(ping.hostnameFromSshConfig('user krezel\nport 22'), null)
  assert.strictEqual(ping.hostnameFromSshConfig(''), null)
  assert.strictEqual(ping.hostnameFromSshConfig('hostname -f'), null)
  assert.strictEqual(ping.hostnameFromSshConfig('hostname a;rm -rf /'), null)
})

// An address is already the answer, so it must not cost an ssh -G -- with a
// dozen hosts that is a dozen needless forks every time targets are re-read.
// Sabotage: in looksNumeric drop the `|| host.includes(':')` -- an IPv6
// literal starts getting looked up and this fails.
test('addresses are not looked up, names are', () => {
  for (const ip of ['192.168.1.21', '10.0.0.1', '100.105.221.98', 'fe80::1', '2606:50c0::153']) {
    assert.strictEqual(ping.looksNumeric(ip), true, `${ip} should be treated as an address`)
  }
  for (const name of ['pipad-lan', 'octoprint', 'chrismetcalf.net', 'print-server']) {
    assert.strictEqual(ping.looksNumeric(name), false, `${name} should be looked up`)
  }
})

// A name whose ssh -G has not come back yet must NOT be pinged. Pinging the
// alias is exactly what fails -- that is the whole bug -- and recording the
// failure reports a healthy host as down for something never properly tried.
// It stays `pending` until the lookup lands, which is an honest "not measured".
//
// Deterministic because the harness supplies the host list: the real one comes
// from ~/.zsh-history and would differ per machine.
function pingWithFakeHosts(handler, historyLine) {
  const cp = require('node:child_process')
  const fsMod = require('node:fs')
  const osMod = require('node:os')
  const spec = require.resolve(path.join(__dirname, '..', '..', 'bin', 'tmarchy-ping.js'))
  const realExec = cp.execFile
  const realRead = fsMod.readFileSync
  const realHome = osMod.homedir

  // A REAL temp home, not a stubbed readFileSync: recentSshHosts reads the
  // history with openSync/readSync (it takes a 64KB tail), so stubbing
  // readFileSync supplies nothing and the host list comes back empty -- which
  // is how the first version of this test failed against correct code.
  const home = fsMod.mkdtempSync(path.join(osMod.tmpdir(), 'tmarchy-ping-test-'))
  fsMod.mkdirSync(path.join(home, '.zsh-history'), { recursive: true })
  fsMod.mkdirSync(path.join(home, '.local', 'state', 'tmarchy'), { recursive: true })
  fsMod.writeFileSync(path.join(home, '.zsh-history', 'box'), historyLine)
  fsMod.writeFileSync(path.join(home, '.local', 'state', 'tmarchy', 'ssh-frecency'), '')

  osMod.homedir = () => home
  cp.execFile = (file, args, opts, cb) => { process.nextTick(() => handler(file, cb, args)); return {} }
  fsMod.readFileSync = (f, ...rest) =>
    (String(f) === '/etc/resolv.conf' ? 'nameserver 1.1.1.1\n' : realRead(f, ...rest))

  delete require.cache[spec]
  const mod = require(spec)
  return {
    mod,
    restore() {
      cp.execFile = realExec
      fsMod.readFileSync = realRead
      osMod.homedir = realHome
      fsMod.rmSync(home, { recursive: true, force: true })
      delete require.cache[spec]
    },
  }
}

// Sabotage: in round() replace
// `for (const t of targets.ssh) if (aliasReady(t.label)) pingOnce(t.host)`
// with an unconditional `pingOnce(t.host)` -- the alias is pinged before its
// lookup returns and this fails.
test('an unresolved alias is not pinged until ssh -G comes back', async () => {
  const pinged = []
  const { mod, restore } = pingWithFakeHosts((file, cb, args) => {
    if (file === 'ssh') return cb(null, 'user me\nhostname 192.168.1.21\nport 22\n', '')
    if (file === 'ping') { pinged.push(args[args.length - 1]); return cb(null, '', '') }
    return cb(null, '', '')
  }, ': 1700000000:0;ssh pipad-lan\n')
  try {
    mod.start()
    await drain()
    assert.ok(!pinged.includes('pipad-lan'),
      `the alias must not be pinged before it resolves: ${pinged.join(' ')}`)
    // Once the lookup lands, the REAL address is what gets pinged.
    await new Promise((r) => setTimeout(r, 400))
    assert.ok(pinged.includes('192.168.1.21'),
      `expected the resolved address to be pinged, got: ${pinged.join(' ')}`)
    mod.stop()
  } finally { restore() }
})

// Sabotage: in resolveSshAlias remove the `flushAliases()` call -- the rebuild
// then waits for the next fifteen-second round, which is the delay that made
// the row sit grey, and this fails.
test('a resolved alias is pinged within a moment, not a round later', async () => {
  const pinged = []
  const { mod, restore } = pingWithFakeHosts((file, cb, args) => {
    if (file === 'ssh') return cb(null, 'hostname 10.9.9.9\n', '')
    if (file === 'ping') { pinged.push(args[args.length - 1]); return cb(null, '', '') }
    return cb(null, '', '')
  }, ': 1700000000:0;ssh some-alias\n')
  try {
    mod.start()
    // Well under the 15s round interval -- if the flush is gone, nothing here.
    await new Promise((r) => setTimeout(r, 600))
    assert.ok(pinged.includes('10.9.9.9'),
      `expected a ping inside 600ms, got: ${pinged.join(' ') || '(nothing)'}`)
    mod.stop()
  } finally { restore() }
})

// Several aliases resolve within milliseconds of each other, and a rebuild per
// callback would ping the WHOLE ssh list once per alias. Sabotage: in
// flushAliases replace `if (aliasFlush) return` with `if (false) return` --
// three aliases then trigger three full sweeps and the count roughly triples,
// failing the bound below.
test('simultaneous alias lookups coalesce into one sweep', async () => {
  const pinged = []
  const { mod, restore } = pingWithFakeHosts((file, cb, args) => {
    if (file === 'ssh') {
      const host = args[args.length - 1]
      return cb(null, `hostname 10.0.0.${host.length}\n`, '')
    }
    if (file === 'ping') { pinged.push(args[args.length - 1]); return cb(null, '', '') }
    return cb(null, '', '')
  }, [': 1700000001:0;ssh alpha-box',
      ': 1700000002:0;ssh bravo-boxx',
      ': 1700000003:0;ssh charlie-boxxx'].join('\n') + '\n')
  try {
    mod.start()
    await new Promise((r) => setTimeout(r, 700))
    const ssh = pinged.filter((h) => h.startsWith('10.0.0.'))
    assert.ok(ssh.length >= 3, `all three should be pinged, got ${ssh.join(' ')}`)
    // One sweep of three, not one sweep per alias. Six allows for the round's
    // own pass; nine or more means it swept once per callback.
    assert.ok(ssh.length <= 6,
      `expected one coalesced sweep, got ${ssh.length} pings: ${ssh.join(' ')}`)
    mod.stop()
  } finally { restore() }
})
