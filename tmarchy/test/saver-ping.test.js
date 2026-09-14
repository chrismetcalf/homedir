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

// The limit is a limit. Sabotage: replace `.slice(0, limit)` with `.slice(0)`
// -- all six come back and this fails.
test('only the five most recent hosts survive', () => {
  const m = new Map([['a', 6], ['b', 5], ['c', 4], ['d', 3], ['e', 2], ['f', 1]])
  assert.deepStrictEqual(ping.mergeSshHosts([m]), ['a', 'b', 'c', 'd', 'e'])
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

function drawPanel(rows, pingData, agents = AGENTS) {
  const cols = 100
  const grid = Array.from({ length: rows }, () => new Array(cols).fill(null))
  panel.render({
    grid, rows, cols, frame: 0,
    theme: { dim: '#565f89', accent: '#7aa2f7', fg: '#c0caf5', done: '#9ece6a',
      busy: '#e0af68', wait: '#f7768e', info: '#73daca' },
    fg: () => '', dim: () => '',
    stats: { cpu: 9, mem: { pct: 20 }, disk: 62, net: { rx: 1, tx: 1 }, temp: 28,
      cores: 20, load: ['1.00', '1.00', '1.00'] },
    agents, quota: 43, meta: { theme: 'tokyo-night', host: 'h', uptimeHours: 5 },
    ping: pingData,
  })
  return textOf(grid)
}

// Five agents, because that is the panel's real shape: the agent list is capped
// at five and a host running agents is the case where space is actually tight.
const AGENTS = ['one', 'two', 'three', 'four', 'five'].map((l) => ({ label: l, state: 'idle' }))

const FULL = {
  net: [
    { label: '45.90.28.87', ms: 3.4, state: 'fast' },
    { label: '45.90.30.87', ms: 149, state: 'ok' },
    { label: 'chrismetcalf.net', ms: 5.7, state: 'fast' },
  ],
  ssh: ['a', 'b', 'c', 'd', 'e'].map((l) => ({ label: l, ms: 1, state: 'fast' })),
}

// Sabotage: in render replace `if (!list || !list.length || budget < 2) return`
// with `if (!list || !list.length) return` -- on the short pane the eight extra
// rows push the closing border past the bottom, the quota gauge with it, and
// this fails.
test('the ping section is trimmed to fit rather than clipped off the bottom', () => {
  const tall = drawPanel(40, FULL)
  assert.ok(tall.includes('PING'), 'a tall pane should show the PING section')
  assert.ok(tall.includes('SSH'), 'a tall pane should show the SSH section')
  assert.ok(tall.includes('QUOTA'), 'a tall pane should still show the quota gauge')

  // Enough room for PING but not for SSH: the whole SSH section goes, header
  // included, rather than leaving a rule with nothing under it.
  const short = drawPanel(24, FULL)
  assert.ok(short.includes('PING'), 'PING survives the trim')
  assert.ok(!short.includes('SSH'), 'SSH is trimmed first')
  assert.ok(short.includes('QUOTA'), 'the quota gauge must never be pushed off')

  // Room for SSH, but not for all five of it: the section appears with as many
  // rows as fit, which is what proves the budget is per-row and not per-section.
  const between = drawPanel(28, FULL)
  const sshRows = between.split('\n').filter((l) => /\u2502 [\u25cf\u25c9\u25cd\u25cb\u25cc] [a-e] /.test(l))
  assert.strictEqual(sshRows.length, 4, 'four of the five ssh rows should fit')
  assert.ok(between.includes('QUOTA'), 'the quota gauge must never be pushed off')
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
