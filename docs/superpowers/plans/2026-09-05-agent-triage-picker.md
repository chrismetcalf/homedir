# Agent Triage Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `prefix + A` lists every live agent, waiting first, sorted by how long each has been in its state, and Enter jumps to it.

**Architecture:** One classifier (`sessionState()` in `tmarchy/lib/scout.js`) shared by three consumers, replacing two byte-identical copies of the wait predicate. A node row emitter turns `~/.tmux-scout/status.json` into TSV; a bash picker renders it through fzf like the other five pickers.

**Tech Stack:** node (no dependencies, `JSON.parse` only), bash 3.2, fzf, tmux 3.5a.

**Spec:** `docs/superpowers/specs/2026-09-05-agent-dashboard-design.md` (commit `8ee4ddf`)

## Global Constraints

- **bash 3.2** for all shell (repo deploys to macOS). No associative arrays, no `mapfile`, no `${var,,}`.
- **Nothing is unbound.** No `unbind` anywhere.
- **Navigation only.** Enter jumps. No kill, no send-input, and Ctrl-V is deliberately not bound — an agent already lives in a pane, so there is nothing to open a second copy of.
- **Row shape is `TARGET<TAB>KIND<TAB>DISPLAY`** with fzf on `--with-nth=3..`, so the pane id is never recovered from display text. Same as `tmux-goto`, `tmux-ssh`, `tmux-cmd`, `tmux-theme-pick`.
- **`--tiebreak=index`** on every fzf call, or fzf re-sorts equal-scoring matches by row width and undoes the duration sort.
- **Per-state clock, not one clock:** `wait` measures from `lastHookAt`, `busy` from `turnStartedAt`, `idle` from `turnEndedAt || lastUpdated`. A single clock is wrong — a busy agent updates constantly, so `lastUpdated` is ≈0s for exactly the rows where duration matters.
- **Stale is checked two ways:** `staleReason`/`endedAt` **and** the pane's absence from `tmux list-panes`. Scout's own flag lags; that is how 36 dead entries accumulated.
- **Colours come from `bin/lib/tmux-theme.sh`** (`@theme-wait` / `busy` / `done`), so state reads identically here, on the bar, and in `tmux-goto`. jewel's `colourNNN` must go through `fzf_colour`; one unparseable value makes fzf reject the entire `--color` argument.
- **Every new assertion must be sabotage-proved, with the failing assertion NAMED.** Aggregate counts are not proof — the previous feature shipped three assertions that could not fail, and an aggregate is what let one hide.

---

### Task 1: One classifier, three consumers

The wait predicate exists twice, byte-identical including its comment. `CLAUDE.md` claims the criteria are shared; they are shared by parallel implementation, not by code. Extract it before adding a third consumer.

**Files:**
- Modify: `tmarchy/lib/scout.js` (add `sessionState`, rewire `paneStates`, extend `module.exports`)
- Modify: `bin/tmux-scout-next-wait` (delete its copy, call the shared one)
- Test: `tmarchy/test/scout.test.js`

**Interfaces:**
- Produces: `sessionState(session)` → `'wait' | 'busy' | 'done' | 'idle' | null`. A **pure function of one session object** — no tmux calls, no file reads. `null` means "do not tint / do not list" (crashed, interrupted, unknown). Exported from `tmarchy/lib/scout.js`.

- [ ] **Step 1: Write the failing test**

Append to `tmarchy/test/scout.test.js`:

```js
const { sessionState } = require('../lib/scout')

test('sessionState: each of the four wait signals', () => {
  assert.equal(sessionState({ needsAttention: true }), 'wait')
  assert.equal(sessionState({ pendingInteraction: {} }), 'wait')
  assert.equal(sessionState({ phase: 'waitingForApproval' }), 'wait')
  assert.equal(sessionState({ phase: 'waitingForAnswer' }), 'wait')
})

test('sessionState: phase beats status when both are present', () => {
  // status can lag behind phase; phase is authoritative.
  assert.equal(sessionState({ phase: 'running', status: 'idle' }), 'busy')
  assert.equal(sessionState({ phase: 'idle', status: 'working' }), 'idle')
})

test('sessionState: falls back to status when phase is absent', () => {
  assert.equal(sessionState({ status: 'working' }), 'busy')
  assert.equal(sessionState({ status: 'completed' }), 'done')
  assert.equal(sessionState({ status: 'idle' }), 'idle')
})

test('sessionState: unknown phase is null, not a guess', () => {
  assert.equal(sessionState({ phase: 'crashed' }), null)
  assert.equal(sessionState({ phase: 'interrupted' }), null)
  assert.equal(sessionState({}), null)
})

test('sessionState: wait wins over any phase', () => {
  assert.equal(sessionState({ needsAttention: true, phase: 'running' }), 'wait')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tmarchy/test/scout.test.js`
Expected: FAIL — `sessionState is not a function`.

- [ ] **Step 3: Add the function to `tmarchy/lib/scout.js`**

Insert after `paneIsPrompting`, before `paneStates`:

```js
// The single definition of what an agent session's state IS. Three consumers
// call it: paneStates() below, bin/tmux-scout-next-wait, and bin/tmux-agents-rows.
//
// It lived in two places before -- here and in next-wait -- byte-identical,
// comment included, and stayed in sync by luck. Drift would be invisible in the
// worst way: the bar tints a window red while the picker calls it idle.
//
// Deliberately NOT a pendingToolUse-age heuristic. That painted merely-busy
// panes red: a long-running tool is not the user being asked something.
//
// Pure function of one session object -- no tmux calls, no file reads -- so a
// consumer needs only JSON.parse, not scout's own sync/render modules.
function sessionState(s) {
  const phase = s.phase || ''
  if (s.needsAttention || s.pendingInteraction
    || phase === 'waitingForApproval' || phase === 'waitingForAnswer') return 'wait'
  if (phase) {
    // phase is authoritative when present (status can lag behind it)
    if (phase === 'running') return 'busy'
    if (phase === 'completed') return 'done'
    if (phase === 'idle') return 'idle'
    return null // crashed/stale/interrupted — not an answer
  }
  if (s.status === 'working') return 'busy'
  if (s.status === 'completed') return 'done'
  if (s.status === 'idle') return 'idle'
  return null
}
```

Add `sessionState,` to `module.exports`.

- [ ] **Step 4: Rewire `paneStates` to use it**

Replace the inline block in `paneStates` — from `const phase = s.phase || ''` through the `else continue` — with:

```js
    const state = sessionState(s)
    if (!state) continue
```

Leave the `PRIO` comparison and the pane-content fallback below it untouched.

- [ ] **Step 5: Rewire `bin/tmux-scout-next-wait`**

Replace its predicate loop with a call to the shared function. Add near the other requires:

```js
const { sessionState } = require(path.join(__dirname, '..', 'tmarchy', 'lib', 'scout'))
```

and replace the `waitPanes` loop body's condition with:

```js
for (const s of active) {
  if (!s.tmuxPane) continue
  if (sessionState(s) === 'wait') waitPanes.add(s.tmuxPane)
}
```

Delete the now-duplicated comment block above it; the explanation lives in `sessionState` now.

- [ ] **Step 6: Run the tests**

Run: `node --test tmarchy/test/scout.test.js`
Expected: PASS.
Run: `tmarchy/bin/tmarchy-selftest 2>&1 | grep -c '^  FAIL'`
Expected: `0` — the tick still classifies identically.

- [ ] **Step 7: Pin the consolidation**

Append to `bin/tmarchy-theme-selftest`... no — add to `tmarchy/test/scout.test.js`:

```js
test('next-wait does not carry its own copy of the predicate', () => {
  // The predicate lived in two places and stayed in sync by luck. If someone
  // re-inlines it, CLAUDE.md's "same criteria" claim silently goes false again.
  const fs = require('node:fs')
  const path = require('node:path')
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'bin', 'tmux-scout-next-wait'), 'utf8')
  assert.equal(/needsAttention\s*\|\|/.test(src), false,
    'bin/tmux-scout-next-wait inlines the wait predicate again; call sessionState() instead')
})
```

- [ ] **Step 8: Prove the tests are not vacuous**

Break `sessionState` so it always returns `'idle'`; run `node --test tmarchy/test/scout.test.js` and confirm the wait/busy/done tests FAIL **by name**. Restore. Then re-inline `needsAttention ||` into `bin/tmux-scout-next-wait` and confirm the consolidation test FAILS by name. Restore. Paste both sets of named failures into your report.

- [ ] **Step 9: Commit**

```bash
git add tmarchy/lib/scout.js bin/tmux-scout-next-wait tmarchy/test/scout.test.js
git commit -m "scout: one definition of agent state, not two"
```

---

### Task 2: The row emitter

Pure data, and the part where stale filtering and sorting can silently go wrong — so it is a separate file, testable with no tmux and no fzf.

**Files:**
- Create: `bin/tmux-agents-rows`
- Create: `bin/tmux-agents-selftest`
- Create: `bin/fixtures/agents-status.json`

**Interfaces:**
- Consumes: `sessionState(session)` from Task 1.
- Produces: `bin/tmux-agents-rows` printing zero or more lines of `paneId \t agent \t DISPLAY`. Honours three env overrides so it is testable with no tmux: `TMUX_AGENTS_STATUS` (status file path), `TMUX_AGENTS_PANES` (space-separated live pane ids), `TMUX_AGENTS_CURRENT` (the current pane id to exclude). Exit 0 with no output when there are no live agents.

- [ ] **Step 1: Write the fixture**

Create `bin/fixtures/agents-status.json`. `NOW` below is a placeholder you must replace with a fixed epoch-ms value — use `1788672000000` everywhere it appears, and the test computes expected durations against that same constant.

```json
{
  "version": 1,
  "lastUpdated": 1788672000000,
  "sessions": {
    "s-wait-old":  { "tmuxPane": "%10", "workingDirectory": "/home/k/otto",
                     "needsAttention": true, "activeTool": "Bash",
                     "lastHookAt": 1788671400000, "turnStartedAt": 1788671000000 },
    "s-wait-new":  { "tmuxPane": "%11", "workingDirectory": "/home/k/pack338",
                     "phase": "waitingForApproval", "activeTool": "Edit",
                     "lastHookAt": 1788671900000, "turnStartedAt": 1788671800000 },
    "s-busy":      { "tmuxPane": "%12", "workingDirectory": "/home/k/family-logistics",
                     "phase": "running", "activeTool": "Read",
                     "lastHookAt": 1788671990000, "turnStartedAt": 1788671100000 },
    "s-idle":      { "tmuxPane": "%13", "workingDirectory": "/home/k/DD_Vids",
                     "phase": "idle", "turnEndedAt": 1788668400000 },
    "s-idle-noclock": { "tmuxPane": "%14", "workingDirectory": "/home/k/config",
                     "phase": "idle", "lastUpdated": 1788665000000 },
    "s-stale-flag":{ "tmuxPane": "%15", "workingDirectory": "/home/k/gone",
                     "phase": "running", "staleReason": "pane %15 no longer exists" },
    "s-ended":     { "tmuxPane": "%16", "workingDirectory": "/home/k/done",
                     "phase": "idle", "endedAt": 1788660000000 },
    "s-flagged-but-alive": { "tmuxPane": "%17", "workingDirectory": "/home/k/zombie",
                     "phase": "running", "staleReason": "stale flag lagging",
                     "turnStartedAt": 1788671500000 },
    "s-alive-but-gone": { "tmuxPane": "%18", "workingDirectory": "/home/k/vanished",
                     "phase": "running", "turnStartedAt": 1788671500000 },
    "s-crashed":   { "tmuxPane": "%19", "workingDirectory": "/home/k/crashed",
                     "phase": "crashed" },
    "s-nopane":    { "workingDirectory": "/home/k/nopane", "phase": "running" },
    "s-current":   { "tmuxPane": "%99", "workingDirectory": "/home/k/self",
                     "phase": "running", "turnStartedAt": 1788671000000 }
  }
}
```

The two rows that matter most are `s-flagged-but-alive` (scout says stale, pane exists) and `s-alive-but-gone` (scout says fine, pane is gone). One-way filtering gets one of them wrong.

- [ ] **Step 2: Write the failing test**

Create `bin/tmux-agents-selftest`:

```bash
#!/usr/bin/env bash
# tmux-agents-selftest — fixture-driven tests for bin/tmux-agents-rows.
#
# Runs entirely without tmux, fzf, or any live agent: the emitter takes its
# status file, its live pane list and the current pane from the environment.
set -uo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FAILED=0
pass() { printf '  ok   %s\n' "$1"; }
fail() { printf '  FAIL %s\n       expected: %s\n       actual:   %s\n' "$1" "$2" "$3"; FAILED=1; }
assert_eq() { [ "$2" = "$3" ] && pass "$1" || fail "$1" "$2" "$3"; }
assert_contains() { case "$3" in *"$2"*) pass "$1" ;; *) fail "$1" "to contain: $2" "$3" ;; esac; }

export TMUX_AGENTS_STATUS="$DIR/fixtures/agents-status.json"
# %15 and %18 deliberately absent: one is flagged stale, one is not.
export TMUX_AGENTS_PANES="%10 %11 %12 %13 %14 %16 %17 %19 %99"
export TMUX_AGENTS_CURRENT="%99"

echo "tmux-agents-rows"
OUT="$(TMUX_AGENTS_NOW=1788672000000 "$DIR/tmux-agents-rows")"
PANES="$(printf '%s\n' "$OUT" | cut -f1 | tr '\n' ' ')"

assert_eq "row count" "5" "$(printf '%s\n' "$OUT" | grep -c .)"
assert_eq "order is wait-longest, wait, busy, then idle" "%10 %11 %12 %13 %14 " "$PANES"

echo "exclusions"
assert_eq "current pane excluded"            "0" "$(printf '%s\n' "$OUT" | grep -c '^%99')"
assert_eq "stale by flag excluded"           "0" "$(printf '%s\n' "$OUT" | grep -c '^%15')"
assert_eq "ended excluded"                   "0" "$(printf '%s\n' "$OUT" | grep -c '^%16')"
assert_eq "crashed (null state) excluded"    "0" "$(printf '%s\n' "$OUT" | grep -c '^%19')"
assert_eq "session with no pane excluded"    "0" "$(printf '%s\n' "$OUT" | grep -c 'nopane')"
# The two disagreement cases, which one-way filtering gets wrong:
assert_eq "flagged stale but pane alive: excluded" "0" "$(printf '%s\n' "$OUT" | grep -c '^%17.*zombie')"
assert_eq "not flagged but pane gone: excluded"    "0" "$(printf '%s\n' "$OUT" | grep -c '^%18')"

echo "clocks"
# wait uses lastHookAt: 1788672000000-1788671400000 = 600s = 10m
assert_contains "wait duration from lastHookAt" "10m" "$(printf '%s\n' "$OUT" | grep '^%10')"
# busy uses turnStartedAt: 900000ms = 15m
assert_contains "busy duration from turnStartedAt" "15m" "$(printf '%s\n' "$OUT" | grep '^%12')"
# idle uses turnEndedAt: 3600000ms = 1h
assert_contains "idle duration from turnEndedAt" "1h" "$(printf '%s\n' "$OUT" | grep '^%13')"
# idle with no turnEndedAt falls back to lastUpdated
assert_contains "idle falls back to lastUpdated" "1h" "$(printf '%s\n' "$OUT" | grep '^%14')"

echo "shape"
assert_eq "field 2 is the kind" "agent" "$(printf '%s\n' "$OUT" | head -1 | cut -f2)"
assert_contains "label is the directory basename" "otto" "$(printf '%s\n' "$OUT" | grep '^%10')"

echo "empty state"
assert_eq "no live agents yields no rows" "0" \
    "$(TMUX_AGENTS_PANES=" " "$DIR/tmux-agents-rows" | grep -c .)"

printf '\n'
[ "$FAILED" = 0 ] && { printf 'all passed\n'; exit 0; }
printf 'FAILURES\n'; exit 1
```

Then `chmod +x bin/tmux-agents-selftest`.

- [ ] **Step 3: Run to verify it fails**

Run: `bin/tmux-agents-selftest`
Expected: fails at the source line — `bin/tmux-agents-rows: No such file or directory`.

- [ ] **Step 4: Write the emitter**

Create `bin/tmux-agents-rows`:

```js
#!/usr/bin/env node
// tmux-agents-rows — classify live agent sessions and print picker rows.
//
// Pure data: bin/tmux-agents renders these through fzf. Kept separate because
// the stale filtering and the sort are where this can go silently wrong, and a
// separate file can be tested against a fixture with no tmux and no fzf.
//
// Reads ~/.tmux-scout/status.json with JSON.parse only -- NOT through scout's
// scripts/picker/sync + render the way bin/tmux-scout-next-wait does -- so it
// still works on a host where the tpm plugin has not been installed yet.
const fs = require('node:fs')
const path = require('node:path')
const { execSync } = require('node:child_process')
const { sessionState } = require(path.join(__dirname, '..', 'tmarchy', 'lib', 'scout'))

function tmux(args) {
  try {
    return execSync('tmux ' + args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  } catch (_) { return '' }
}

const STATUS = process.env.TMUX_AGENTS_STATUS
  || path.join(process.env.HOME || '', '.tmux-scout/status.json')
const NOW = Number(process.env.TMUX_AGENTS_NOW) || Date.now()

// Live panes and the current pane come from the environment when set, so the
// selftest needs no tmux server.
const livePanes = new Set(
  (process.env.TMUX_AGENTS_PANES !== undefined
    ? process.env.TMUX_AGENTS_PANES
    : tmux("list-panes -a -F '#{pane_id}'")
  ).split(/\s+/).filter(Boolean))
const current = (process.env.TMUX_AGENTS_CURRENT !== undefined
  ? process.env.TMUX_AGENTS_CURRENT
  : tmux("display-message -p '#{pane_id}'")).trim()

// Exit 3 on unreadable/unparseable, NOT 0. The picker distinguishes the two:
// "no live agents" and "your status file is corrupt" are different answers, and
// silently returning zero rows for the second would print the first.
let doc
try {
  doc = JSON.parse(fs.readFileSync(STATUS, 'utf8'))
} catch (e) {
  process.stderr.write('tmux-agents-rows: cannot read ' + STATUS + ': ' + e.message + '\n')
  process.exit(3)
}

// Duration is measured from a DIFFERENT field per state. One clock would be
// tidier and wrong: a busy agent updates constantly, so lastUpdated is ~0s for
// exactly the rows where the number matters most.
function since(s, state) {
  if (state === 'wait') return s.lastHookAt
  if (state === 'busy') return s.turnStartedAt
  return s.turnEndedAt || s.lastUpdated
}

function human(ms) {
  if (!ms || ms < 0) return '—'
  const sec = Math.floor(ms / 1000)
  if (sec < 60) return sec + 's'
  if (sec < 3600) return Math.floor(sec / 60) + 'm' + String(sec % 60).padStart(2, '0') + 's'
  if (sec < 86400) return Math.floor(sec / 3600) + 'h'
  return Math.floor(sec / 86400) + 'd'
}

const ORDER = { wait: 0, busy: 1, done: 2, idle: 3 }
const rows = []
for (const s of Object.values(doc.sessions || {})) {
  if (!s.tmuxPane || s.tmuxPane === current) continue
  // Stale two ways: scout's own flag, AND the pane actually being gone. The
  // flag lags -- that is how 36 dead entries accumulated in a 587K file.
  if (s.staleReason || s.endedAt) continue
  if (!livePanes.has(s.tmuxPane)) continue
  const state = sessionState(s)
  if (!state) continue
  const from = since(s, state)
  rows.push({
    pane: s.tmuxPane,
    state,
    ms: from ? NOW - from : -1,
    label: path.basename(s.workingDirectory || '') || '?',
    detail: s.activeTool || s.currentActivity || '',
  })
}

rows.sort((a, b) => (ORDER[a.state] - ORDER[b.state]) || (b.ms - a.ms))

const LABEL = { wait: 'WAIT', busy: 'WORK', done: 'DONE', idle: 'IDLE' }
for (const r of rows) {
  const disp = `${LABEL[r.state]} ${human(r.ms).padStart(7)}  ${r.label.padEnd(22).slice(0, 22)}  ${r.detail}`
  process.stdout.write(`${r.pane}\tagent\t${disp.replace(/\s+$/, '')}\n`)
}
```

Then `chmod +x bin/tmux-agents-rows`.

- [ ] **Step 5: Run to verify it passes**

Run: `bin/tmux-agents-selftest`
Expected: all `ok`. If the order assertion fails, read the actual value before changing the expectation — the sort is the thing under test.

- [ ] **Step 6: Prove the assertions are not vacuous**

Three sabotages, each with the failing assertion NAMED in your report:
1. Remove the `livePanes.has` check — `not flagged but pane gone: excluded` must FAIL.
2. Remove the `staleReason || endedAt` check — `flagged stale but pane alive: excluded` must FAIL.
3. Make `since()` always return `s.lastUpdated` — the busy and wait clock assertions must FAIL.

Restore after each and confirm the suite returns to green.

- [ ] **Step 7: Commit**

```bash
git add bin/tmux-agents-rows bin/tmux-agents-selftest bin/fixtures/agents-status.json
git commit -m "tmux-agents-rows: classify live agents into picker rows"
```

---

### Task 3: The picker

**Files:**
- Create: `bin/tmux-agents`
- Modify: `bin/tmux-agents-selftest` (append picker-level assertions)

**Interfaces:**
- Consumes: `bin/tmux-agents-rows` (rows), `bin/lib/tmux-theme.sh` (`ansi_for`, `fzf_theme_opts`).
- Produces: `bin/tmux-agents` executable; `--doctor` prints status path, readability, total/live/stale counts and rows emitted.

- [ ] **Step 1: Write the picker**

Create `bin/tmux-agents`:

```bash
#!/usr/bin/env bash
# tmux-agents — fuzzy-pick a live agent, waiting first. prefix + A.
#
# The sixth picker, built like the others: rows are "TARGET<TAB>KIND<TAB>DISPLAY"
# with fzf on --with-nth=3.., so the pane id is never recovered from display text.
#
# Sorted by TIME IN STATE, not by frecency. That is why this is its own tool
# rather than a mode of tmux-goto: tmux-goto's Enter-is-alt-tab behaviour
# depends on frecency ordering, and it is used 40+ times a week.
#
# Navigation only. Enter jumps; Ctrl-V is deliberately unbound, because an agent
# already lives in a pane and there is nothing to open a second copy of.
set -uo pipefail

SELF="${BASH_SOURCE[0]}"
if command -v readlink >/dev/null 2>&1; then
    SELF="$(readlink -f "${BASH_SOURCE[0]}" 2>/dev/null || printf '%s' "${BASH_SOURCE[0]}")"
fi
DIR="$(dirname "$SELF")"
# shellcheck source=lib/tmux-theme.sh
[ -r "$DIR/lib/tmux-theme.sh" ] && . "$DIR/lib/tmux-theme.sh"

ROWS_BIN="$DIR/tmux-agents-rows"
STATUS="${TMUX_AGENTS_STATUS:-$HOME/.tmux-scout/status.json}"

# Tint each row by its state, using the same @theme-* values as the bar and
# tmux-goto -- agent state should read identically everywhere.
colourise() {
    local wait busy done_c reset line state
    wait=$(ansi_for "$(tmux show -gv @theme-wait 2>/dev/null)" 2>/dev/null)
    busy=$(ansi_for "$(tmux show -gv @theme-busy 2>/dev/null)" 2>/dev/null)
    done_c=$(ansi_for "$(tmux show -gv @theme-done 2>/dev/null)" 2>/dev/null)
    [ -n "$wait$busy$done_c" ] && reset=$'\033[0m' || reset=""
    while IFS= read -r line; do
        [ -n "$line" ] || continue
        state=${line#*$'\t'}; state=${state#*$'\t'}; state=${state%% *}
        case "$state" in
            WAIT) printf '%s%s%s\n' "$wait" "$line" "$reset" ;;
            WORK) printf '%s%s%s\n' "$busy" "$line" "$reset" ;;
            *)    printf '%s\n' "$line" ;;
        esac
    done
}

doctor() {
    printf 'tmux-agents doctor\n\n'
    printf '  status file    %s\n' "$STATUS"
    printf '  readable       %s\n' "$([ -r "$STATUS" ] && echo yes || echo NO)"
    printf '  node           %s\n' "$(command -v node || echo MISSING)"
    printf '  lib dir        %s\n' "$DIR/lib"
    printf '  ansi_for       %s\n' "$(type -t ansi_for 2>/dev/null || echo MISSING)"
    if [ -r "$STATUS" ] && command -v python3 >/dev/null 2>&1; then
        python3 - "$STATUS" <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))
s = d.get("sessions", {})
stale = sum(1 for x in s.values() if x.get("staleReason") or x.get("endedAt"))
print("  sessions       %d total, %d live-flagged, %d stale/ended" % (len(s), len(s) - stale, stale))
PY
    fi
    printf '  rows emitted   %s\n' "$("$ROWS_BIN" 2>/dev/null | grep -c .)"
}

main() {
    TMUX_AGENTS_MAIN_RAN=1
    if ! command -v node >/dev/null 2>&1; then
        printf '\ntmux-agents: node is not installed, and the row emitter needs it.\n\n'
        printf 'Press ENTER to close'; read -r _; exit 1
    fi
    if [ ! -r "$STATUS" ]; then
        printf '\ntmux-agents: no scout status file at\n  %s\n\n' "$STATUS"
        printf '  tmux-scout writes it; install it with prefix + I\n\n'
        printf 'Press ENTER to close'; read -r _; exit 1
    fi
    local rows choice pane rc
    rows="$("$ROWS_BIN")"; rc=$?
    if [ "$rc" = 3 ]; then
        printf '\ntmux-agents: the scout status file could not be parsed.\n  %s\n\n' "$STATUS"
        printf '  It exists but is not valid JSON -- scout may have been interrupted mid-write.\n\n'
        printf 'Press ENTER to close'; read -r _; exit 1
    fi
    if [ -z "$rows" ]; then
        printf '\ntmux-agents: no live agents.\n\n'
        printf '  %s parsed fine; every session in it is stale, ended, or has no pane.\n\n' "$STATUS"
        printf 'Press ENTER to close'; read -r _; exit 0
    fi
    # --tiebreak=index so equal-scoring matches keep the duration order above;
    # fzf's default of `length` would re-sort them by row width.
    # shellcheck disable=SC2046  # one token or nothing; see tmux-cmd
    choice=$(printf '%s\n' "$rows" | colourise | fzf --ansi --tiebreak=index $(fzf_theme_opts) \
        --delimiter=$'\t' --with-nth=3.. \
        --prompt='agent > ' --height=100% --reverse --no-multi) || exit 0
    pane=${choice%%$'\t'*}
    [ -n "$pane" ] || exit 0
    # A pane id may live in another session, so switch-client first: a bare
    # select-pane only works within the current session and would silently do
    # nothing from a different one. Same sequence bin/tmux-scout-next-wait uses.
    local sess win
    sess=$(tmux display-message -p -t "$pane" '#{session_name}' 2>/dev/null)
    win=$(tmux display-message -p -t "$pane" '#{window_id}' 2>/dev/null)
    [ -n "$sess" ] && tmux switch-client -t "$sess"
    [ -n "$win" ] && tmux select-window -t "$win"
    tmux select-pane -t "$pane"
}

case "${1:-}" in
    --doctor) [ "${TMUX_AGENTS_LIB:-}" = "1" ] || { doctor; exit 0; } ;;
esac

[ "${TMUX_AGENTS_LIB:-}" = "1" ] || main "$@"
```

Then `chmod +x bin/tmux-agents`.

- [ ] **Step 2: Append picker assertions to `bin/tmux-agents-selftest`**

```bash
echo "picker"
assert_eq "picker is executable" "yes" "$([ -x "$DIR/tmux-agents" ] && echo yes || echo no)"
# Enter must jump across sessions, not just within one.
assert_contains "jump switches client before selecting" "switch-client" "$(cat "$DIR/tmux-agents")"
assert_contains "jump selects the window too" "select-window" "$(cat "$DIR/tmux-agents")"
# Navigation only: no acting on agents from this tool.
assert_eq "no kill in the picker"    "0" "$(grep -c 'kill-pane\|kill-window\|kill-session' "$DIR/tmux-agents")"
assert_eq "ctrl-v is not bound"      "0" "$(grep -c 'expect=ctrl-v' "$DIR/tmux-agents")"
assert_contains "tiebreak=index is set" "--tiebreak=index" "$(cat "$DIR/tmux-agents")"
# Empty states must explain rather than open an empty picker.
assert_contains "absent status file is explained" "no scout status file" \
    "$(TMUX_AGENTS_STATUS=/definitely/absent bash "$DIR/tmux-agents" 2>&1 </dev/null || true)"
# A corrupt file and an empty one are different answers; saying "no live agents"
# for a truncated write would send you looking in the wrong place entirely.
printf 'not json' > "$DIR/fixtures/.corrupt.json"
assert_contains "corrupt status file is explained" "could not be parsed" \
    "$(TMUX_AGENTS_STATUS="$DIR/fixtures/.corrupt.json" bash "$DIR/tmux-agents" 2>&1 </dev/null || true)"
rm -f "$DIR/fixtures/.corrupt.json"
```

- [ ] **Step 3: Run the suite**

Run: `bin/tmux-agents-selftest`
Expected: all `ok`.
Run: `bin/tmux-agents --doctor`
Expected: real counts; `rows emitted` matching what you see live.

- [ ] **Step 4: Prove the picker assertions are not vacuous**

Remove `switch-client` from the jump; confirm `jump switches client before selecting` FAILS by name. Restore. Add `--expect=ctrl-v` to the fzf call; confirm `ctrl-v is not bound` FAILS by name. Restore. Report both named failures.

- [ ] **Step 5: Commit**

```bash
git add bin/tmux-agents bin/tmux-agents-selftest
git commit -m "tmux-agents: a triage picker for live agents"
```

---

### Task 4: Wire it up

**Files:**
- Modify: `.tmux.conf` (near the other picker bindings, around line 211-224)
- Modify: `.config/tmux/plugins/tmux-which-key/config.yaml` (the `+Agents` submenu)

- [ ] **Step 1: Add the binding**

In `.tmux.conf`, beside `bind u` / `bind S` / `bind p`:

```
# prefix + A: live agents, waiting first, sorted by time in state. Navigation
# only -- Enter jumps. prefix + ~ remains the no-UI "next waiting" cycle.
bind A display-popup -E -w 70% -h 60% "~/bin/tmux-agents"
```

- [ ] **Step 2: Add the menu entry**

In `config.yaml`'s `+Agents` submenu, as the first entry (before the scout session picker):

```yaml
      - name: Agent triage (waiting first)
        key: A
        command: 'display-popup -E -w 70% -h 60% "~/bin/tmux-agents"'
```

Single-quoted: the command contains no `#{...}`, but the quoting convention in this file is what stops a future edit from silently truncating one.

- [ ] **Step 3: Verify both surfaces**

```bash
tmux source-file ~/.tmux.conf
tmux list-keys -T prefix | grep -c 'tmux-agents'
```
Expected: `1`.

```bash
bin/tmux-cmd --doctor | grep collect_rows
```
Expected: **89** rows — one more than the current 88, since the menu gained exactly one command and it is not a favourite, so nothing dedupes.

```bash
bin/tmux-menu-selftest 2>&1 | grep -c '^  FAIL'
```
Expected: `0`.

- [ ] **Step 4: Commit**

```bash
git add .tmux.conf .config/tmux/plugins/tmux-which-key/config.yaml
git commit -m "tmux: prefix + A opens agent triage"
```

---

### Task 5: Documentation

**Files:**
- Modify: `CLAUDE.md` (scripts list; the tmux keybindings list; the tmux-scout bullet)
- Modify: `docs/superpowers/specs/2026-08-25-tmarchy-design.md` (the Deferred table)

- [ ] **Step 1: Add `tmux-agents` to the scripts list in `CLAUDE.md`**

Record what is not obvious from the code: that it sorts by **time in state** rather than frecency, and that this is why it is its own tool rather than a mode of `tmux-goto` — whose Enter-is-alt-tab behaviour depends on frecency ordering. Record the **per-state clock** and why one clock would be wrong. Record that stale is checked **two ways** because scout's own flag lags, and give the number that motivated it: 36 of 42 entries dead, 587K.

- [ ] **Step 2: Update the tmux-scout bullet in `CLAUDE.md`**

It currently says "Same criteria in `tmux-scout-next-wait`". That was true by parallel implementation; it is now true by shared code. Say so, name `sessionState()` in `tmarchy/lib/scout.js` as the single definition, and note that a test asserts `next-wait` does not re-inline the predicate.

- [ ] **Step 3: Add the keybinding to the `prefix +` list in `CLAUDE.md`**

`prefix + A`: agent triage, waiting first. Note the relationship to `prefix + ~`, which stays the no-UI "jump to next waiting" cycle — the two are complements, not duplicates.

- [ ] **Step 4: Mark the Deferred row done**

In `docs/superpowers/specs/2026-08-25-tmarchy-design.md`, the row *"Agent-aware navigation (cycle waiting agents, dashboard)"* is now fully delivered — cycling by `prefix + ~`, triage by `prefix + A`. Note it as done with the two keys, the way the keybinding-overhaul row was handled.

- [ ] **Step 5: Verify and commit**

```bash
grep -c 'tmux-agents' CLAUDE.md    # expect >= 2
bin/homedir-doctor --quiet | tail -3
git add CLAUDE.md docs/superpowers/specs/2026-08-25-tmarchy-design.md
git commit -m "docs: prefix + A is agent triage, and scout has one classifier"
```

---

## Rollback

Task 1 is the only change to existing behaviour, and it is a pure refactor with tests on both sides; reverting it restores two copies of a predicate that were identical anyway. Tasks 2-4 are additive — new files plus one binding and one menu entry — so reverting the binding leaves dead but harmless scripts. Nothing is unbound at any point, so no rollback can strand a key you rely on.
