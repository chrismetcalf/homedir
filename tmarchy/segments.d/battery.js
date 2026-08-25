// Battery, for the hosts that have one. This repo is deployed to a headless
// server, a Mac, and a Pi with a PiSugar; enabled() keeps the other two hosts
// from paying for a check that can never succeed.
const os = require('node:os')
const fs = require('node:fs')
const { execFileSync } = require('node:child_process')

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

function hasPiSugar() {
  try {
    return fs.existsSync('/usr/bin/pisugar-server') || fs.existsSync('/usr/local/bin/pisugar-server')
  } catch {
    return false
  }
}

function read() {
  if (os.platform() === 'darwin') {
    const out = execFileSync('pmset', ['-g', 'batt'], { encoding: 'utf8' })
    return parsePmset(out)
  }
  if (hasPiSugar()) {
    const out = execFileSync('sh', ['-c', 'echo "get battery" | nc -q0 127.0.0.1 8423'], { encoding: 'utf8' })
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
