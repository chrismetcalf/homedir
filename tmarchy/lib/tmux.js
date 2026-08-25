// Batched tmux invocation. Every extra tmux call is a fork, and avoiding forks
// is the entire point of tmarchy, so callers accumulate and flush once.
//
// Window-scoped options are NOT `set -g -t`: tmux needs `set-option -wt`, and
// getting this wrong fails silently — the option simply never lands and every
// tab renders untinted.
const { execFileSync } = require('node:child_process')

function tmux(args) {
  try {
    return execFileSync('tmux', args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
  } catch {
    return ''
  }
}

// ops: [{ scope: 'global' | 'window', target?: '@3', name: '@x', value: 'v' }]
// A null value unsets the option, which is how an idle window loses its tint.
function buildArgv(ops) {
  const argv = []
  for (const op of ops) {
    if (argv.length) argv.push(';')
    if (op.scope === 'window') {
      if (op.value === null) argv.push('set-option', '-uwt', op.target, op.name)
      else argv.push('set-option', '-wt', op.target, op.name, String(op.value))
    } else if (op.value === null) {
      argv.push('set-option', '-gu', op.name)
    } else {
      argv.push('set-option', '-g', op.name, String(op.value))
    }
  }
  return argv
}

function setOptions(ops) {
  if (ops.length) tmux(buildArgv(ops))
}

module.exports = { tmux, buildArgv, setOptions }
