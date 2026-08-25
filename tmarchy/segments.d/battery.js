// Battery, for the hosts that have one. This repo is deployed to a headless
// server, a Mac, and a Pi with a PiSugar; enabled() keeps the other two hosts
// from paying for a check that can never succeed.
const os = require('node:os')
const fs = require('node:fs')
const { execFileSync } = require('node:child_process')

// pmset and the PiSugar socket both normally reply in well under 100ms; 1s
// is generous headroom for pmset on a loaded Mac or a slow local TCP
// round-trip, but still leaves comfortable margin before the next 5s
// status-interval tick. Without a bound, a hung child never returns from
// execFileSync — renderSegments' try/catch can't help, because a stall
// isn't an exception — and tmux won't respawn a #() job while the previous
// one is still running, so the whole right-hand status bar would freeze at
// stale values instead of just this one segment going absent.
const EXEC_TIMEOUT_MS = 1000

function parsePmset(out) {
  const match = /(\d+)%/.exec(out)
  return match ? Number(match[1]) : null
}

function parsePiSugar(out) {
  const match = /battery:\s*([\d.]+)/i.exec(out)
  return match ? Math.floor(Number(match[1])) : null
}

function icon(percent) {
  if (percent >= 80) return '󰂁'
  if (percent >= 20) return '󰁽'
  return '󱃍'
}

// Proves the pisugar-server binary is installed, not that the daemon behind
// it is up and answering. A refused connection throws and read() degrades
// cleanly via the timeout below; a wedged daemon that accepts the
// connection and never replies would hang the same way a wedged pmset
// would (nc's -q0 only bounds the wait after stdin EOF, not the wait for a
// reply) — EXEC_TIMEOUT_MS is what makes that case survivable too.
function hasPiSugar() {
  try {
    return fs.existsSync('/usr/bin/pisugar-server') || fs.existsSync('/usr/local/bin/pisugar-server')
  } catch {
    return false
  }
}

function read() {
  if (os.platform() === 'darwin') {
    const out = execFileSync('pmset', ['-g', 'batt'], { encoding: 'utf8', timeout: EXEC_TIMEOUT_MS })
    return parsePmset(out)
  }
  if (hasPiSugar()) {
    const out = execFileSync('sh', ['-c', 'echo "get battery" | nc -q0 127.0.0.1 8423'], { encoding: 'utf8', timeout: EXEC_TIMEOUT_MS })
    return parsePiSugar(out)
  }
  return null
}

module.exports = {
  name: 'battery',
  parsePmset,
  parsePiSugar,
  icon,
  enabled: () => os.platform() === 'darwin' || hasPiSugar(),
  render: () => {
    const percent = read()
    return percent === null ? null : `${icon(percent)} ${percent}%`
  },
}
