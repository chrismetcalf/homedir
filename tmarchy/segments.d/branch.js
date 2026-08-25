// Branch of the current pane's directory, read straight from .git/HEAD.
// A file read rather than `git rev-parse`, because a fork per tick is exactly
// what tmarchy exists to avoid. Handles worktrees, which this repo uses heavily
// for agent builds — their .git is a file pointing at the real gitdir.
const fs = require('node:fs')
const path = require('node:path')

function headToBranch(head) {
  const text = head.trim()
  if (text.startsWith('ref: ')) return text.slice(5).replace(/^refs\/heads\//, '')
  return text.slice(0, 7)
}

function branchOf(dir) {
  let current
  try {
    current = path.resolve(dir)
  } catch {
    return null
  }
  for (;;) {
    const dotgit = path.join(current, '.git')
    try {
      const stat = fs.statSync(dotgit)
      if (stat.isDirectory()) {
        return headToBranch(fs.readFileSync(path.join(dotgit, 'HEAD'), 'utf8'))
      }
      if (stat.isFile()) {
        const pointer = fs.readFileSync(dotgit, 'utf8').trim()
        const raw = pointer.replace(/^gitdir:\s*/, '')
        // Worktree pointers are absolute; submodule pointers (e.g. this
        // repo's `.oh-my-zsh` -> `../.git/modules/.oh-my-zsh`) are relative
        // to the directory containing this .git file, not to cwd.
        const gitdir = path.isAbsolute(raw) ? raw : path.resolve(current, raw)
        return headToBranch(fs.readFileSync(path.join(gitdir, 'HEAD'), 'utf8'))
      }
    } catch {
      // Not a repo at this level, or HEAD unreadable — keep walking up.
    }
    const parent = path.dirname(current)
    if (parent === current) return null
    current = parent
  }
}

module.exports = {
  name: 'branch',
  branchOf,
  headToBranch,
  enabled: () => true,
  render: (ctx) => (ctx.panePath ? branchOf(ctx.panePath) : null),
}
