// Remote host of the current pane, when that pane is an ssh session.
// tmux detects "this pane is ssh" natively; only the host name needs work.
// Linux-only: it walks /proc to find the ssh process under the pane's shell.
// Elsewhere the segment reports the bare fact rather than guessing a host.
const fs = require('node:fs')

function hostFromArgv(argv) {
  // Every value-taking flag from `man ssh` (checked systematically, not just
  // patched for the two the reviewer found: -B bind_interface, -P tag).
  const FLAGS_WITH_VALUES = new Set([
    '-p', '-l', '-i', '-o', '-F', '-b', '-c', '-D', '-E', '-e',
    '-I', '-J', '-L', '-m', '-O', '-Q', '-R', '-S', '-W', '-w',
    '-B', '-P',
  ])
  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i]
    if (FLAGS_WITH_VALUES.has(arg)) { i++; continue }
    if (arg.startsWith('-')) continue
    return arg.includes('@') ? arg.split('@').pop() : arg
  }
  return null
}

function descendants(pid, depth = 0) {
  if (depth > 4) return []
  let kids = []
  try {
    const tasks = fs.readdirSync(`/proc/${pid}/task`)
    for (const task of tasks) {
      const raw = fs.readFileSync(`/proc/${pid}/task/${task}/children`, 'utf8')
      kids.push(...raw.split(/\s+/).filter(Boolean))
    }
  } catch {
    return []
  }
  return kids.concat(...kids.map(k => descendants(k, depth + 1)))
}

function sshHostUnder(pid) {
  for (const child of [String(pid), ...descendants(pid)]) {
    let argv
    try {
      argv = fs.readFileSync(`/proc/${child}/cmdline`, 'utf8').split('\0').filter(Boolean)
    } catch {
      continue
    }
    if (argv.length && /(^|\/)ssh$/.test(argv[0])) {
      const host = hostFromArgv(argv)
      if (host) return host
    }
  }
  return null
}

module.exports = {
  name: 'remote',
  hostFromArgv,
  sshHostUnder,
  enabled: () => fs.existsSync('/proc'),
  render: (ctx) => {
    if (ctx.paneCommand !== 'ssh') return null
    return sshHostUnder(ctx.panePid) || 'ssh'
  },
}
