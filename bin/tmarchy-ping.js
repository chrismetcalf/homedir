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

const SITE = 'chrismetcalf.net'    // the one fixed target
const SSH_LIMIT = 5
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

function latencyState(ms) {
  if (ms === null || ms === undefined) return 'down'
  if (ms < 50) return 'fast'
  if (ms < 200) return 'ok'
  return 'slow'
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
  return { net, ssh: recentSshHosts().map((h) => ({ label: h, host: h })) }
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
      results.set(host, { ms, state: latencyState(ms) })
    })
}

function round() {
  if (rounds % RETARGET_EVERY === 0) targets = resolveTargets()
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
    return { label: t.label, ms: r ? r.ms : null, state: r ? r.state : 'pending' }
  })
  return { net: decorate(targets.net), ssh: decorate(targets.ssh), available }
}

module.exports = {
  start, stop, read, resolveTargets, recentSshHosts, resolvers,
  isSafeHost, parseRtt, dnsFromResolvConf, dnsFromResolvectl, isLoopback,
  chooseResolvers,
  sshHostFromCommand, sshHostsFromHistory, sshHostsFromFrecency, mergeSshHosts,
  pingArgs, latencyState, SITE, SSH_LIMIT,
}
