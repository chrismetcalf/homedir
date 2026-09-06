# tmux agent triage — one place that answers "who needs me"

Status: implemented.

## Context

The "dashboard" half of *"Agent-aware navigation (cycle waiting agents,
dashboard)"* in the tmarchy design doc's Deferred table
(`2026-08-25-tmarchy-design.md`, "Independent; builds on scout"). The cycling
half shipped as `prefix + ~` (`bin/tmux-scout-next-wait`).

Five surfaces already touch agent state, and none of them answers the question:

| Surface | Answers |
| --- | --- |
| `prefix + ~` | "take me to the next waiting agent" — one at a time, no overview |
| `@bar-agents` segment | *how many*, not *which* |
| per-window bar tint | which — but only for windows visible in the tab strip, which truncates at 14 chars and collapses to a glyph on the phone |
| `prefix + W` sidebar | window list, scout-state coloured |
| `prefix + u` (`tmux-goto`) | all windows; agent state is decoration, not the ordering |

Nothing says *"N waiting, M busy — here they are, longest-blocked first."*

Two measurements taken while designing this, both of which shaped it:

- **`~/.tmux-scout/status.json` is 86% dead.** 42 sessions, 6 live; 36 carry
  `staleReason` (e.g. "pane %2 no longer exists") or `endedAt`. That is most of
  the file's 587K.
- **The live list is small.** At the time of writing: 5 idle, 1 working, 0
  waiting, with the working session 907s into its turn. This is a handful of
  rows, not a board — which is why this is a picker and not a pane.

Scout also carries per-session data no surface shows: `turnStartedAt`,
`activeTool`, `currentActivity`, `activeSubagents`, `workingDirectory`.

## Goals

- One keypress answers "is anything blocked on me, and what has been stuck longest".
- Agent state means exactly one thing across the bar, `prefix + ~`, and this.
- Never an empty popup without an explanation.

## Non-goals

- **No acting on agents** — no kill, no send-input. Enter jumps; that is all.
  Navigation only, the same boundary `CLAUDE.md` documents for `tmux-goto`.
- **No changes to `tmux-goto`.** Its Enter-is-alt-tab behaviour depends on
  frecency ordering, and this tool sorts by duration. Bolting a second sort onto
  the picker used 40+ times a week is not worth the reuse.
- **No stale-entry pruning.** The 86%-dead file is real but is scout's own
  concern; this tool filters, it does not clean.
- **No persistent pane.** Six rows does not warrant permanent screen space.

## Decisions

1. **Its own picker**, `bin/tmux-agents` on `prefix + A` (verified free).
2. **All live agents, waiting first** — never empty when agents exist, and the
   ordering still answers the triage question at a glance.
3. **One classifier, three consumers.** `sessionState()` is extracted into
   `tmarchy/lib/scout.js` and used by the tick, `next-wait`, and this.
4. **A different clock per state** (see below).
5. **Label is `workingDirectory`'s basename**, not `sessionTitle`.

## The duplication this fixes

The wait predicate exists **twice, identically**, comment included:

```js
// tmarchy/lib/scout.js:34  and  bin/tmux-scout-next-wait:55
s.needsAttention || s.pendingInteraction
  || phase === 'waitingForApproval' || phase === 'waitingForAnswer'
```

`CLAUDE.md` claims "Same criteria in `tmux-scout-next-wait`". That is true today
by parallel implementation, not by shared code — the copies have stayed in sync
by luck. A third consumer makes drift near-certain, and drift here is invisible
in the worst way: the bar tints a window red while the picker calls it idle.

`sessionState(session)` → `'wait' | 'busy' | 'done' | 'idle' | null` subsumes
both the predicate *and* the phase/status mapping `paneStates` already does, so
it is one function rather than a predicate plus a mapper. The paragraph
explaining why this is not a `pendingToolUse`-age heuristic moves to the
function, where one copy of it can be maintained.

It is a **pure function of a session object**. That matters beyond tidiness: the
row emitter then needs only `JSON.parse`, not scout's `scripts/picker/sync` and
`render` modules that `next-wait` requires, so the picker works on a host where
the tpm plugin is not installed yet.

## Architecture

```
~/.tmux-scout/status.json
         │
         ▼
bin/tmux-agents-rows  (node)  ──uses──▶  tmarchy/lib/scout.js :: sessionState()
         │                                        ▲
         │  pane \t kind \t display                │ also used by
         ▼                                         ├─ tmarchy/bin/tmarchy-tick
bin/tmux-agents  (bash)  ──▶ fzf ──▶ switch-client └─ bin/tmux-scout-next-wait
```

Two files, one job each. The emitter is **pure data** — testable against a
fixture with no tmux and no fzf, which is where the stale filtering and the sort
can silently go wrong. The picker is presentation, and looks like the other five.

`bin/tmux-scout-next-wait` is already node in `bin/`, so a node sibling there is
precedent rather than a new pattern.

## Rows

Same `TARGET<TAB>KIND<TAB>DISPLAY` shape as every other picker, fzf on
`--with-nth=3..`, so the pane id is never recovered from display text.

```
%14  agent  󰀦 WAIT   9m12s  otto                permission: Bash
%31  agent  󰔟 WORK  15m07s  family-logistics    Edit
%7   agent  󰄬 IDLE      2h  DD_Vids
```

Colours come from `@theme-wait` / `busy` / `done` through
`bin/lib/tmux-theme.sh`, so state reads identically here, on the bar, and in
`tmux-goto`.

### The clock is per-state

Scout has no "waiting since" field, so duration is measured differently per
state. This is the design's one genuinely non-obvious decision:

| State | Measured from | Means |
| --- | --- | --- |
| `wait` | `lastHookAt` | how long blocked on you |
| `busy` | `turnStartedAt` | how long in this turn |
| `idle` | `turnEndedAt`, falling back to `lastUpdated` | how long quiet |

A single clock would look tidier and be wrong: a busy agent updates constantly,
so `lastUpdated` is ≈0s for exactly the rows where duration matters most.

### Sort

`wait` (longest first) → `busy` (longest first) → `idle` (most recent first).
Longest-blocked at the top is the point. Most-recently-idle nearest the bottom
edge mirrors `tmux-goto`'s instinct of keeping where-you-just-were within reach.

### Exclusions

- **The current pane.** You are looking at it; same reason `tmux-goto` omits it.
- **Stale entries** — checked *both* ways: `staleReason`/`endedAt`, **and** that
  the pane still appears in `tmux list-panes`. Scout's own flag lags, which is
  how 36 dead entries accumulated.

### The jump

Enter switches to the selected pane. The target is a pane id (`%14`) which may
live in another session, so the action is `switch-client` to its session,
`select-window`, then `select-pane` — not a bare `select-pane`, which only works
within the current session and would silently do nothing from a different one.
`bin/tmux-scout-next-wait` already does exactly this and is the reference.

Ctrl-V is deliberately NOT bound. `tmux-ssh` uses it to split, but an agent
already lives in a pane; there is nothing to open a second copy of.

## Failure behaviour

Every path that could produce an empty picker reports instead, following
`tmux-cmd`'s preflight and `tmux-ssh --doctor`:

- `status.json` missing, unreadable, or malformed — say which
- `node` missing — say so
- `bin/lib/` not linked — degrade to uncoloured rows, never to nothing
- zero live agents — "no live agents", not an empty list
- a session missing `turnStartedAt` — render `—`, never `NaN`

`bin/tmux-agents --doctor` reports: status file path and readability, total /
live / stale counts, and rows emitted.

## Testing

- **`tmux-agents-rows` against a fixture `status.json`** — no tmux, no fzf, no
  live agents. Covers stale filtering, all three clocks, sort order, missing
  timestamps, current-pane exclusion. The fixture carries the two disagreement
  cases that matter: an entry flagged `staleReason` whose pane still exists, and
  a live-looking entry whose pane does not.
- **`sessionState()` directly** — all four wait signals, busy, done, idle, and
  `null` for crashed/interrupted.
- **A grep assertion that `bin/tmux-scout-next-wait` no longer carries its own
  predicate.** This is what pins the consolidation; without it the logic gets
  re-inlined in a year and the doc's "same criteria" claim quietly goes false
  again — which is exactly what happened to produce this spec.
- **Every assertion sabotage-proved.** The previous feature shipped three
  assertions that could not fail; this is now a standing requirement, and the
  proof must name the failing assertions rather than report an aggregate count.

## Rollback

Two new files plus one refactor of a shared function. Reverting the picker
leaves the consolidation in place, which is independently worth having.
