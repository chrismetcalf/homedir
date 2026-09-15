// tmarchy-saver's reachability sampler: round-trip times to the resolvers this
// box actually uses, to chrismetcalf.net, and to the hosts you last ssh'd to.
//
// NOTHING HERE MAY BLOCK. The saver runs a 20fps frame loop, so every ping is
// an async child and the renderer only ever reads a cache. A round that is
// still in flight simply leaves the previous numbers standing -- one interval
// stale, never a stalled frame. That is the same bargain tmarchy's status bar
// makes with its tick.
//
// Three things here are less obvious than they look:
//
//   1. resolv.conf often does not name a real resolver. systemd-resolved puts
//      a loopback STUB there (127.0.0.53) and keeps the actual upstreams to
//      itself, so pinging what resolv.conf says measures the loopback and
//      reports ~0.05ms forever. When every nameserver is loopback we ask
//      `resolvectl dns` for the real ones and fall back to the stub only if
//      that fails too -- a wrong-but-honest 0.05ms is still better than a row
//      that says nothing.
//
//   2. `-W` means different things on different pings. On Linux (iputils) it
//      is a timeout in SECONDS; on macOS it is a per-packet wait in
//      MILLISECONDS, where `-W 1` means one millisecond and every host on
//      earth times out. macOS spells the overall deadline `-t`. Same flag
//      letter, three orders of magnitude apart, and the failure looks like a
//      dead network rather than a bad flag.
//
//   3. A hostname is validated before it reaches argv even though execFile
//      takes an array and never invokes a shell. The risk is not injection,
//      it is a host named `-f`, which ping reads as flood mode. These names
//      come out of shell history and an ssh config, so they are not ours to
//      trust.
'use strict'

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFile } = require('node:child_process')
const { mixHex } = require(path.join(__dirname, '..', 'tmarchy', 'lib', 'colour'))

const SITE = 'chrismetcalf.net'    // the one fixed target
// How many ssh hosts to TRACK. The panel shows far fewer -- that is a row
// budget, not a data limit -- but the screensaver pins every target to the
// solid, and a globe wants more than a handful of cities. 40 unique hosts are
// available from the history, so this invents nothing.
const SSH_LIMIT = 13
const INTERVAL = 15000             // ms between rounds
const PER_PING_TIMEOUT = 3000      // < INTERVAL, so rounds cannot overlap
const TAIL_BYTES = 65536           // per history file; history appends, so the
                                   // newest ssh is always near the end
const RETARGET_EVERY = 20          // rounds between re-reading the host sources

// --- pure helpers -----------------------------------------------------------

// Rejects anything that could be read as a flag, plus every character that has
// no business in a hostname or an IP (v6 included, hence the colon).
function isSafeHost(h) {
  return typeof h === 'string' && h.length > 0 && h.length <= 255 &&
    /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(h)
}

// ping prints `time=12.3 ms`; busybox prints `time=12.3ms`. Both here.
function parseRtt(stdout) {
  const m = /time[=<]\s*([\d.]+)\s*ms/i.exec(stdout || '')
  if (!m) return null
  const ms = Number(m[1])
  return Number.isFinite(ms) ? ms : null
}

// `PING chrismetcalf.net (185.199.108.153) 56(84) bytes of data.` -- the
// address the name actually resolved to. Worth keeping: a hostname tells you
// what you asked for, the address tells you what answered, and on a screen
// showing network topology the second is the interesting one.
function parseIp(stdout) {
  const m = /^PING\s+\S+\s+\(([0-9a-fA-F.:]+)\)/m.exec(stdout || '')
  return m && isSafeHost(m[1]) ? m[1] : null
}

function isLoopback(ip) {
  return /^127\./.test(ip) || ip === '::1'
}

function dnsFromResolvConf(text) {
  const out = []
  for (const line of (text || '').split('\n')) {
    const m = /^\s*nameserver\s+(\S+)/.exec(line)
    if (m && isSafeHost(m[1])) out.push(m[1])
  }
  return out
}

// `resolvectl dns` prints a "Global:" line then one per link, each possibly
// listing several servers. Links with no servers print nothing after the colon.
function dnsFromResolvectl(text) {
  const out = []
  for (const line of (text || '').split('\n')) {
    const m = /^(?:Global|Link\s+\d+\s+\([^)]*\)):\s*(.*)$/.exec(line)
    if (!m) continue
    for (const ip of m[1].trim().split(/\s+/)) {
      if (isSafeHost(ip) && !isLoopback(ip) && !out.includes(ip)) out.push(ip)
    }
  }
  return out
}

// ssh flags that consume the following argument. Without this list `ssh -p 22
// host` reports its host as "22".
const SSH_VALUE_FLAGS = new Set(
  'bcDEeFIiJLlmOoPpQRSWw'.split(''))

// One shell-history command -> the host it ssh'd to, or null.
function sshHostFromCommand(cmd) {
  const words = String(cmd || '').trim().split(/\s+/)
  if (words[0] !== 'ssh') return null
  for (let i = 1; i < words.length; i++) {
    const w = words[i]
    if (w === '--') continue
    if (w.startsWith('-')) {
      // Bundled short flags: only the LAST letter can take a value (-4vp 22).
      const last = w[w.length - 1]
      if (w.length > 1 && SSH_VALUE_FLAGS.has(last)) i++
      continue
    }
    const host = w.includes('@') ? w.slice(w.lastIndexOf('@') + 1) : w
    return isSafeHost(host) ? host : null
  }
  return null
}

// zsh EXTENDED_HISTORY lines are `: <epoch>:<elapsed>;<command>`. A plain
// history has no prefix at all, so those get epoch 0 and sort last -- present,
// but never displacing an entry whose age is actually known.
function sshHostsFromHistory(text) {
  const seen = new Map()
  for (const line of (text || '').split('\n')) {
    const ext = /^:\s*(\d+):\d+;(.*)$/.exec(line)
    const when = ext ? Number(ext[1]) : 0
    const host = sshHostFromCommand(ext ? ext[2] : line)
    if (!host) continue
    if (!seen.has(host) || seen.get(host) < when) seen.set(host, when)
  }
  return seen
}

// tmux-ssh's frecency file: host<TAB>count<TAB>last-used.
function sshHostsFromFrecency(text) {
  const seen = new Map()
  for (const line of (text || '').split('\n')) {
    const f = line.split('\t')
    if (f.length < 3) continue
    const when = Number(f[2])
    if (!isSafeHost(f[0]) || !Number.isFinite(when)) continue
    if (!seen.has(f[0]) || seen.get(f[0]) < when) seen.set(f[0], when)
  }
  return seen
}

// Merge the two sources on the NEWEST timestamp per host. They answer slightly
// different questions -- the frecency file knows what you picked in prefix + S,
// the history knows what you typed -- and a host reached both ways should be
// dated by whichever was more recent, not by whichever source we read first.
function mergeSshHosts(maps, limit = SSH_LIMIT) {
  const all = new Map()
  for (const m of maps) {
    for (const [host, when] of m) {
      if (!all.has(host) || all.get(host) < when) all.set(host, when)
    }
  }
  return [...all.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([host]) => host)
}

// macOS spells the deadline -t and reads -W as milliseconds; see the header.
function pingArgs(platform, host) {
  return platform === 'darwin'
    ? ['-n', '-c', '1', '-t', '2', host]
    : ['-n', '-c', '1', '-W', '2', host]
}

// A CONTINUOUS colour for a round-trip time, as opposed to latencyState's four
// discrete bands. The bands still drive the lamp glyph, which has to stay
// scannable; the colour carries the detail, so two hosts that are both "fast"
// no longer look identical when one is a hundred times closer than the other.
//
// LOG scale, because latency is: the interesting range runs from 0.15ms on the
// LAN to 150ms across the Atlantic, and a linear ramp would paint everything
// under 50ms the same green. The stops land at roughly 2ms and 46ms, so a LAN
// host is green, a nearby server teal, a busy resolver amber and anything past
// a few hundred milliseconds red.
//
// Returns a HEX STRING rather than an escape sequence so both consumers can use
// it: the panel turns it into a foreground colour, and the screensaver's globe
// points hand it to dim() to fade with the terminator.
const LATENCY_LO = 0.1
const LATENCY_HI = 1000

// Where a round-trip time sits on the scale, 0 (fastest) to 1 (slowest).
// Separated out because it is the only part with a testable ORDER: "slower is
// further along" is a property of this number, not of any colour channel. The
// palette runs green -> teal -> amber -> red, and green to teal LOWERS the red
// channel, so no single channel is monotone across the gradient -- an assertion
// on one of them looked obvious and was simply false.
function latencyPosition(ms) {
  if (ms === null || ms === undefined) return null
  const span = Math.log10(LATENCY_HI / LATENCY_LO)
  return Math.max(0, Math.min(1, Math.log10(Math.max(ms, LATENCY_LO) / LATENCY_LO) / span))
}

function latencyHex(theme, ms, state) {
  if (!theme) return null
  if (state === 'pending' || state === 'down' || ms === null || ms === undefined) return theme.dim
  const stops = [theme.done, theme.info, theme.busy, theme.wait]
  const t = latencyPosition(ms)
  const seg = t * (stops.length - 1)
  const i = Math.min(stops.length - 2, Math.floor(seg))
  return mixHex(stops[i], stops[i + 1], seg - i)
}

function latencyState(ms) {
  if (ms === null || ms === undefined) return 'down'
  if (ms < 50) return 'fast'
  if (ms < 200) return 'ok'
  return 'slow'
}

// --- ssh aliases -------------------------------------------------------------
//
// A name out of the shell history may be an ssh ALIAS rather than a hostname:
// `Host pipad-lan / HostName 192.168.1.21` pings as a DNS failure and shows the
// host as unreachable when it is perfectly fine. Four of thirteen tracked hosts
// here were aliases, one of them with no DNS record at all.
//
// `ssh -G <host>` is asked rather than the config file parsed, because it is
// the same resolution ssh itself will do -- Include, wildcard Host patterns and
// Match blocks included. tmux-ssh parses the file directly and has the comments
// to prove how much that costs; there is no reason to repeat it here.
//
// ASYNC, and cached. The lookup is ~10ms and there may be a dozen, which is a
// visible hitch if it happens on the frame loop -- so an unresolved name is
// pinged as-is for one round and corrected on the next, rather than holding
// everything up. Numeric literals skip the lookup entirely: an address is
// already the answer.
const sshAlias = new Map()          // name -> what to actually ping
const sshAliasPending = new Set()
let targetsDirty = false

function looksNumeric(host) {
  return /^[0-9.]+$/.test(host) || host.includes(':')
}

// `ssh -G` echoes the full effective config; the line we want is `hostname X`.
function hostnameFromSshConfig(stdout) {
  const m = /^hostname\s+(\S+)\s*$/mi.exec(stdout || '')
  return m && isSafeHost(m[1]) ? m[1] : null
}

function resolveSshAlias(host) {
  if (looksNumeric(host) || sshAlias.has(host) || sshAliasPending.has(host)) return
  if (!isSafeHost(host)) return
  sshAliasPending.add(host)
  execFile('ssh', ['-G', host], { timeout: 3000, encoding: 'utf8' }, (err, stdout) => {
    sshAliasPending.delete(host)
    // On any failure the name stands as its own answer -- caching that is what
    // stops a box with no ssh binary re-forking one per host every round.
    const real = (!err && hostnameFromSshConfig(stdout)) || host
    sshAlias.set(host, real)
    if (real !== host) targetsDirty = true
  })
}

// --- target discovery -------------------------------------------------------
function readTail(file, bytes) {
  let fd = null
  try {
    fd = fs.openSync(file, 'r')
    const size = fs.fstatSync(fd).size
    const len = Math.min(size, bytes)
    const buf = Buffer.alloc(len)
    fs.readSync(fd, buf, 0, len, size - len)
    return buf.toString('utf8')
  } catch { return '' } finally { if (fd !== null) try { fs.closeSync(fd) } catch {} }
}

function readAll(file) {
  try { return fs.readFileSync(file, 'utf8') } catch { return '' }
}

// Which two addresses to ping, given what resolv.conf says and what
// systemd-resolved said when last asked. Pure, so the precedence is testable
// without an /etc or a resolvectl: real nameservers win, the upstreams behind a
// stub come second, and the stub itself is the last resort -- a row reading
// 0.05ms forever is wrong, but it is better than an empty section that leaves
// you wondering whether DNS is broken or the panel is.
function chooseResolvers(conf, upstreams) {
  const real = conf.filter((ip) => !isLoopback(ip))
  if (real.length) return real.slice(0, 2)
  if (upstreams && upstreams.length) return upstreams.slice(0, 2)
  return conf.slice(0, 2)
}

// systemd-resolved's real upstreams, fetched ASYNCHRONOUSLY. An execFileSync
// here would be a 2-second stall on the frame loop's own thread every time the
// targets were re-read -- the exact thing this file's header forbids, and the
// shape it was in when first written.
let upstreams = null
let upstreamsInFlight = false
let upstreamsUnavailable = false

function refreshUpstreams(onChange) {
  if (upstreamsInFlight || upstreamsUnavailable) return
  upstreamsInFlight = true
  execFile('resolvectl', ['dns'], { timeout: 2000, encoding: 'utf8' }, (err, stdout) => {
    upstreamsInFlight = false
    // ENOENT means there is no resolvectl on this box at all -- a machine
    // running dnsmasq on 127.0.0.1, or any non-systemd host -- and round()
    // would otherwise keep asking every fifteen seconds for the life of the
    // process. Give up permanently, the same way a missing `ping` does. Only
    // ENOENT: a non-zero exit is resolvectl saying something, and might not
    // say it next time.
    if (err && err.code === 'ENOENT') { upstreamsUnavailable = true; return }
    const found = err ? [] : dnsFromResolvectl(stdout)
    const changed = !upstreams || upstreams.join() !== found.join()
    upstreams = found
    if (changed && found.length && onChange) onChange()
  })
}

function confNameservers() {
  return dnsFromResolvConf(readAll('/etc/resolv.conf'))
}

// Deliberately SIDE-EFFECT FREE. An earlier version kicked off the resolvectl
// fetch from in here, which meant resolveTargets() -> resolvers() -> refresh ->
// resolveTargets() was a live cycle: not infinite (the call is async and the
// second answer matches the first), but a resolvectl spawn on every read of the
// target list for no gain. Deciding when to ask belongs to round(), which is
// the thing that has a clock.
function resolvers() {
  return chooseResolvers(confNameservers(), upstreams)
}

function recentSshHosts() {
  const dir = path.join(os.homedir(), '.zsh-history')
  let files = []
  try { files = fs.readdirSync(dir).map((f) => path.join(dir, f)) } catch {}
  const maps = files.map((f) => sshHostsFromHistory(readTail(f, TAIL_BYTES)))
  maps.push(sshHostsFromFrecency(
    readAll(path.join(os.homedir(), '.local', 'state', 'tmarchy', 'ssh-frecency'))))
  return mergeSshHosts(maps)
}

// The site leads, then the resolvers. Not just a reading order: the panel trims
// this section row by row when space is short, so whatever sits first is what
// survives -- and of the three, "can I reach my own site" is the one row worth
// keeping when only one fits. The resolvers answer a narrower question.
function resolveTargets() {
  const net = [{ label: SITE, host: SITE }]
  for (const ip of resolvers()) net.push({ label: ip, host: ip })
  // The LABEL stays the name you know it by; only what gets pinged is
  // rewritten. Seeing `pipad-lan` in the panel and `192.168.1.21` on the globe
  // is right -- the alias is how you refer to it, the address is what answered.
  const ssh = recentSshHosts().map((h) => {
    resolveSshAlias(h)
    return { label: h, host: sshAlias.get(h) || h }
  })
  return { net, ssh }
}

// --- the sampler ------------------------------------------------------------
let targets = { net: [], ssh: [] }
let results = new Map()            // host -> { ms, state }
let timer = null
let rounds = 0
let available = true               // flipped off if ping is not installed

function pingOnce(host) {
  if (!available || !isSafeHost(host)) return
  execFile('ping', pingArgs(process.platform, host),
    { timeout: PER_PING_TIMEOUT, encoding: 'utf8' }, (err, stdout) => {
      // ENOENT means no ping binary at all. Keep spawning eight doomed children
      // every fifteen seconds and the rows still say nothing, so stop instead.
      if (err && err.code === 'ENOENT') { available = false; return }
      const ms = parseRtt(stdout)
      // Keep the last address we saw: a failed round should not blank out the
      // one the name resolved to when it last answered.
      const prev = results.get(host)
      results.set(host, { ms, state: latencyState(ms), ip: parseIp(stdout) || (prev && prev.ip) || null })
    })
}

function round() {
  if (rounds % RETARGET_EVERY === 0 || targetsDirty) {
    targetsDirty = false
    targets = resolveTargets()
  }
  rounds++

  // Ask systemd-resolved only when resolv.conf has nothing real to offer, and
  // act on the answer the moment it lands rather than at the next retarget:
  // otherwise the first fifteen seconds of every session show a resolver row
  // reading 0.03ms, which is the loopback stub and looks like a working number.
  if (!confNameservers().filter((ip) => !isLoopback(ip)).length) {
    refreshUpstreams(() => {
      targets = resolveTargets()
      for (const t of targets.net) pingOnce(t.host)
    })
  }

  for (const t of [...targets.net, ...targets.ssh]) pingOnce(t.host)
}

function start() {
  if (timer) return
  round()
  timer = setInterval(round, INTERVAL)
  // Never hold the process open: a screensaver exits on a keypress, and a live
  // interval would keep node running after the frame loop is gone.
  if (timer.unref) timer.unref()
}

function stop() { if (timer) { clearInterval(timer); timer = null } }

// What the panel renders. Targets always appear, measured or not -- a row that
// vanishes while its host is unreachable is the row you most wanted to see.
function read() {
  const decorate = (list) => list.map((t) => {
    const r = results.get(t.host)
    return { label: t.label, ms: r ? r.ms : null, state: r ? r.state : 'pending',
      ip: (r && r.ip) || null }
  })
  return { net: decorate(targets.net), ssh: decorate(targets.ssh), available }
}

module.exports = {
  start, stop, read, resolveTargets, recentSshHosts, resolvers,
  isSafeHost, parseRtt, parseIp, hostnameFromSshConfig, looksNumeric, dnsFromResolvConf, dnsFromResolvectl, isLoopback,
  chooseResolvers,
  sshHostFromCommand, sshHostsFromHistory, sshHostsFromFrecency, mergeSshHosts,
  pingArgs, latencyState, latencyHex, latencyPosition, mixHex, SITE, SSH_LIMIT,
}
