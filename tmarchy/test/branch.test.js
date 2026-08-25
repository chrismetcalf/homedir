const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { branchOf } = require('../segments.d/branch')

// mkdtempSync fixtures MUST be rmSync'd — this box has a documented history
// of /tmp accumulation (segments.test.js has the details) and a bare
// mkdtemp-per-test-run leaks a tmarchy-git-*/tmarchy-wt-* dir every run.
function repo(headContents) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tmarchy-git-'))
  fs.mkdirSync(path.join(dir, '.git'))
  fs.writeFileSync(path.join(dir, '.git', 'HEAD'), headContents)
  return dir
}

function cleanup(...dirs) {
  for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true })
}

test('reads a branch name from .git/HEAD', () => {
  const dir = repo('ref: refs/heads/tmarchy\n')
  try {
    assert.strictEqual(branchOf(dir), 'tmarchy')
  } finally {
    cleanup(dir)
  }
})

test('reports a short sha when detached', () => {
  const dir = repo('a1b2c3d4e5f6a7b8c9d0\n')
  try {
    assert.strictEqual(branchOf(dir), 'a1b2c3d')
  } finally {
    cleanup(dir)
  }
})

test('finds the repo from a subdirectory', () => {
  const dir = repo('ref: refs/heads/master\n')
  try {
    const sub = path.join(dir, 'a', 'b')
    fs.mkdirSync(sub, { recursive: true })
    assert.strictEqual(branchOf(sub), 'master')
  } finally {
    cleanup(dir)
  }
})

test('resolves a worktree whose .git is a file', () => {
  const main = repo('ref: refs/heads/master\n')
  const wt = fs.mkdtempSync(path.join(os.tmpdir(), 'tmarchy-wt-'))
  try {
    const gitdir = path.join(main, '.git', 'worktrees', 'wt')
    fs.mkdirSync(gitdir, { recursive: true })
    fs.writeFileSync(path.join(gitdir, 'HEAD'), 'ref: refs/heads/feature\n')
    fs.writeFileSync(path.join(wt, '.git'), `gitdir: ${gitdir}\n`)
    assert.strictEqual(branchOf(wt), 'feature')
  } finally {
    cleanup(main, wt)
  }
})

test('returns null outside a repo', () => {
  assert.strictEqual(branchOf(os.tmpdir()), null)
})
