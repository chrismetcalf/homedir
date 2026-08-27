# tmarchy backlog

Ideas not yet built. The original design doc's "Deferred" table
(`docs/superpowers/specs/2026-08-25-tmarchy-design.md`) holds the items that
were scoped out at the start — layout presets, agent-aware navigation, the
keybinding overhaul. This file is for what came up afterwards.

---

## Claude Code session usage in the bar

Show how much of the Claude Code session has been consumed, in the status bar,
so it is visible without switching to the pane running it.

**The data already arrives.** Claude Code's `statusLine` command is handed a
JSON blob on stdin every render, and `.claude/statusline-command.sh` is already
wired up (`settings.json` → `statusLine`) and already parses one field of it:

```json
"context_window": {
  "total_input_tokens": 15500,
  "total_output_tokens": 1200,
  "context_window_size": 200000,
  "used_percentage": 8,
  "remaining_percentage": 92
},
"cost": {
  "total_cost_usd": 0.01234,
  "total_duration_ms": 45000,
  "total_api_duration_ms": 2300
}
```

So the number is free; the work is entirely in getting it from there to the bar.

**What "budget" can and cannot mean here.** The statusLine payload exposes the
**context window** (percentage and absolute tokens) and the **session cost in
USD**. It does *not* expose the plan/subscription quota — there is no weekly-
limit or remaining-allowance field. If the goal is "how close am I to my plan
limit", this source cannot answer it and something else is needed. If the goal
is "how full is this session's context" or "what has this session cost", both
are one field away.

### Design constraints

**Do not let the statusline shell out to tmux.** The statusline command runs on
every render — far more often than once per `status-interval`. A `tmux set -g`
from inside it would be a fork per render, which is precisely the cost tmarchy
exists to remove (see the governing invariant in `README.md`). The statusline
should write a small state file instead — no fork — and `tmarchy-tick` should
read it once per interval like every other segment.

**Key the state by pane.** Several Claude sessions run at once here, one per
agent window. A single global value would show whichever session happened to
write last, which is worse than showing nothing. The statusline knows its own
pane through `$TMUX_PANE`, so it can write
`~/.local/state/tmarchy/claude/<pane-id>` and the segment can resolve the
current pane — or, for the global bar slot, aggregate (the max, or the pane you
are looking at).

**Expire stale files.** A session that ends stops writing but leaves its last
value behind. Without an age check the bar would report a long-dead session's
usage as current — the same trap `lib/scout.js` handles by filtering on
`endedAt`. Treat a file older than a few minutes as absent.

**Decide what a full bar means.** `used_percentage` is the obvious choice, and
tinting it through `@theme-busy` / `@theme-wait` past thresholds would match how
`@scout-state` already colours the tabs. Absolute tokens are the honest number
but read as noise at a glance; cost in USD is a third option and arguably the
one that actually matters.

### Shape

- `tmarchy/segments.d/claude.js`, following the existing segment contract
  (`name` / `enabled()` / `render(ctx)`) — see `README.md`, "How to add a
  segment".
- A `@bar-claude` global written by `tmarchy-tick`, rendered by `bar.conf`.
- A few lines added to `.claude/statusline-command.sh` to write the state file.
  That script is versioned here, so the change travels with the rest.

### Open question

Per-window or global? The tab already carries `@scout-state`, so a per-window
usage marker would sit naturally beside it and answer "which of my agents is
about to run out of context" — which is more useful than one number in the
footer, and is the version worth building if only one gets built.
