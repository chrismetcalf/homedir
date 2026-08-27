# tmarchy

tmarchy is the native tmux status bar for this repo. It replaced
tmux-powerline on 2026-08-25 (design doc:
`docs/superpowers/specs/2026-08-25-tmarchy-design.md`; implementation plan:
`docs/superpowers/plans/2026-08-25-tmarchy.md`). It draws the same kind of
information tmux-powerline did — session, remote host, agent/load/branch/
battery segments, per-window tint for tmux-scout state — but as tmux format
strings plus one rate-limited callout, instead of a shell script forked per
segment per window per redraw.

Ideas not yet built live in [BACKLOG.md](BACKLOG.md); the items scoped out at
the start are in the design doc's "Deferred" table.

## The governing invariant

**Node runs at most once per status-interval.** Under tmux-powerline, with a
dozen agent-worktree windows open, status-bar forks ran at 7.7/sec; under
tmarchy the same session runs 0.5/sec. That number is the whole point of this
rewrite, and every design choice below exists to protect it.

Note the precise claim: *node* runs at most once per interval, not *nothing
forks a shell*. tmux does fork a shell for the `#()` callout on every
invocation — that shell is `tmarchy-tick-guard`, and it's cheap because it
exits on bash builtins alone without ever starting node.

What drives how often that callout runs is not redraws from busy panes. It's
`status-interval` × the number of attached clients, plus one more for every
explicit `refresh-client -S`. Measured: `status-interval 5` idle and
`status-interval 5` with a pane in a tight echo loop both sit at 0.20/sec —
pane output does not move the number at all. `status-interval 1` with 1, 2,
and 3 attached clients measures 1.00/sec, 1.90/sec, and 3.00/sec. And
`status-interval 5` with something calling `refresh-client -S` at 10 Hz
measures 9.60/sec. The 2.0 node spawns/sec that originally motivated this
guard was 2 attached clients on tmux-powerline's `status-interval 1` — not a
redraw storm from a dozen busy panes.

The guard is still worth keeping: a low interval, several attached clients
(tmux over multiple terminals/ShellFish connections, say), or anything
polling with `refresh-client -S` can drive the callout often enough that an
*unguarded* ticker would burn real CPU on node startup alone (~58 MB and
~0.15s per spawn). `status-interval` bounds how fresh the data is; without
the guard, attached-client count and any `refresh-client -S` caller would
still bound how often node actually runs. Only a guard that runs *before* any
expensive process starts can bound that unconditionally.

## The four layers

1. **`tmarchy.tmux`** — the entry point. Loaded by an explicit `run-shell`
   in `.tmux.conf` *after* `tpm`'s `run` line, not registered as a tpm
   `@plugin` — three separate incidents in this repo have come from tpm load
   ordering (tpm resourcing `.tmux.conf` fragments in an order this repo
   doesn't control), and tmarchy owns the top-level entry point instead of
   trusting it. On every load it restores the persisted theme from
   `~/.local/state/tmarchy/theme` (`$XDG_STATE_HOME` if set), falling back to
   `tokyo-night` if that file is missing or names a theme that no longer
   exists on disk, then sources `bar.conf`. Idempotent — safe to run on every
   `prefix + r`.

2. **`bar.conf`** — the bar itself. `status-left`, `status-right`, and both
   window-status formats, entirely as tmux format strings (`#{...}`) reading
   `@theme-*` (colours) and `@bar-*` (segment values) options. Values are one
   `status-interval` stale by design — a value written during a render is
   picked up by the *next* one — which is invisible at the 5s interval this
   repo runs. The **only** shell-out anywhere in this file is the single
   guarded `#()` described next; everything else is pure tmux format
   evaluation, which cannot fork.

3. **`bin/tmarchy-tick-guard` + `bin/tmarchy-tick`** — the ticker,
   split in two specifically so the expensive half never starts unless it's
   going to do work. `tmarchy-tick-guard` is bash, builtins only — no
   `date`, no `cat`, no test binary on the common path — because the cost
   this guard exists to avoid *is* process startup, so the guard itself
   can't pay it. It stamps a per-user file with the last time it let a tick
   through and skips (forking nothing at all) if less than
   `TMARCHY_TICK_MIN_INTERVAL` (default 5s, matching `status-interval`) has
   elapsed. Only a call that survives the guard execs `tmarchy-tick`, a node
   script that queries tmux once, computes everything, and writes the
   results as tmux options (`@scout-state` / `@remote-host` per window,
   `@bar-load` / `@bar-agents` / `@bar-branch` / `@bar-remote` /
   `@bar-battery` globally) for `bar.conf` to render on the next redraw.
   `tmarchy-tick` itself prints nothing — it exists purely for that side
   effect — and is written so a failed tmux query, a failed segment, or an
   uncaught exception all leave the previous option values standing rather
   than blanking or erroring the bar. `tmarchy-tick` is directly runnable on
   its own (that's what `time tmarchy/bin/tmarchy-tick` in
   `CLAUDE.md`'s troubleshooting section does); `tmarchy-tick-guard` is what
   `bar.conf` actually invokes.

4. **`lib/` + `segments.d/`** — the engine `tmarchy-tick` calls into:
   - `lib/tmux.js` — the only place that shells out to `tmux` itself
     (`execFileSync`, batched: every caller accumulates `set-option` ops and
     flushes once rather than one tmux invocation per option).
   - `lib/context.js` — one `tmux display-message` call that returns the
     current pane's path/command/pid as the basis for every segment,
     tab-separated (not space-separated — user paths contain spaces) and
     parsed from the right so a tab embedded in a path can't shift the
     other fields.
   - `lib/scout.js` — per-window tmux-scout state (wait/busy/done/idle),
     moved verbatim from the old `bin/tmux-scout-window-tint` behaviour,
     including the pane-content fallback for hosts where the
     `PermissionRequest` hook hasn't fired yet.
   - `lib/segments.js` — loads every `*.js` file in `segments.d/`, and
     renders each in its own `try`/`catch` so one broken segment can never
     take another, or the bar, down with it.
   - `segments.d/*.js` — the segments themselves: `agents`, `battery`,
     `branch`, `load`, `remote`.

## How to add a theme

Copy an existing file in `themes/` (e.g. `cp themes/tokyo-night.conf
themes/my-theme.conf`) and set its ten `@theme-*` options to your palette:

```
@theme-bg @theme-fg @theme-dim @theme-accent @theme-accent-alt
@theme-border @theme-wait @theme-busy @theme-done @theme-remote
```

Nothing else references a theme file by name except `bin/tmarchy-theme`
(which lists `themes/*.conf` by globbing the directory) and the `+Theme`
which-key submenu (`.config/tmux/plugins/tmux-which-key/config.yaml`), which
needs one new `command: run-shell -b "~/.homedir/tmarchy/bin/tmarchy-theme
set my-theme"` entry if you want it reachable from `prefix + ?`. Run
`tmarchy/bin/tmarchy-selftest` afterward — it asserts every theme file
defines every required colour and that the theme count matches what's on
disk.

## The quota segment is not like the others

`segments.d/quota.js` is the one segment whose data does not come from the
machine it runs on. It reports how close the account is to its Claude plan
limits, from `GET /api/oauth/usage` — the endpoint `/usage` itself uses,
authenticated with the OAuth token in `~/.claude/.credentials.json`.

Three things about it differ from every other segment, and all three are
deliberate:

- **The network call never happens in the tick.** `bin/tmarchy-usage` is spawned
  *detached* when the cache goes stale and writes
  `~/.local/state/tmarchy/claude-usage.json`; the segment only ever reads that
  file. An HTTP call inside `tmarchy-tick` would stall every redraw whenever the
  network is slow. There is no cron or systemd timer to install — the tick
  spawns it — so a fresh checkout needs no extra setup step.
- **It renders nothing below 80%.** Like `agents.js`, `summarise()` returns a
  string or null, and `bar.conf` hides the whole slot for an unset option. The
  normal state is invisible.
- **The endpoint is undocumented.** It was found by strings-ing the CLI binary,
  so it may change or vanish. Every failure path writes a cache record with
  `ok: false` and renders nothing rather than breaking the bar. Ask it directly
  with `bin/tmarchy-usage --doctor`, which prints the last fetch time, HTTP
  status and parsed buckets — below the threshold a healthy quota and a broken
  refresher look identical, so that flag is the only way to tell them apart.

## How to add a segment

Add one file to `segments.d/` exporting:

```js
module.exports = {
  name: 'mysegment',        // becomes @bar-mysegment
  enabled: (ctx) => true,   // optional; skip the segment entirely when false
  render: (ctx) => 'value', // return null/undefined/'' to suppress this tick
}
```

`ctx` is the object from `lib/context.js` (`panePath`, `paneCommand`,
`panePid`, `hasContext`). `lib/segments.js` picks the file up automatically
— no registration step — and wraps the call in its own `try`/`catch`, so a
throwing segment degrades to "absent" rather than breaking the tick. To
actually render, add a clause to `bar.conf`'s `status-right` following the
existing `#{?#{@bar-<name>},...,}` pattern for the other segments.

## Running the tests

Two independent suites:

```bash
node --test tmarchy/test/*.test.js   # unit tests for lib/ and segments.d/
tmarchy/bin/tmarchy-selftest         # end-to-end: real (throwaway) tmux server + render
```

**Use the explicit `*.test.js` glob, not the directory.** On this node
build, `node --test tmarchy/test/` does not glob-search the directory — it
silently reports a bogus `1 test, 1 fail` instead of running the suite.
`node --test tmarchy/test/*.test.js` is the form that actually works.

`tmarchy-selftest` spins up its own throwaway tmux server and
`XDG_STATE_HOME` (never touches a live session or your real persisted
theme), asserts tmarchy loads without error, that theme options and
restore-from-persisted-state both work, that rendering produces the right
SGR codes, that the tick guard actually rate-limits and recovers from a
corrupt stamp file, that the theme switcher lists/sets/rejects themes
correctly, and that every shipped theme defines every required colour.

## Rollback

```
git checkout 2d92d6b^ -- .tmux.conf     # 2d92d6b^ == 85d4fd3
tmux source-file ~/.tmux.conf           # or prefix + r, to apply it live
```

That is the whole rollback. `2d92d6b` (the commit that stood tmarchy up and
retired powerline) touched **`.tmux.conf` and nothing else**, so restoring
that one file to its pre-tmarchy revision restores the pre-tmarchy tmux
config exactly. Verified: exit 0, and the resulting `.tmux.conf` is
byte-identical to the pre-tmarchy one. The `tmarchy/` tree stays on disk but
nothing sources it, so rolling *forward* again is a `git checkout` away too.

Do not revert Task 7 (`9cddda7`) — it updated
`.config/tmux-powerline/segments/tmux_scout.sh` to the renamed ticker path in
its own commit, so powerline's scout segment keeps working either way, and
reverting it isn't needed and isn't harmless.

### Why not `git revert`

**`git revert 2d92d6b` does not apply.** It was the documented instruction
twice, and it has been wrong both times. `f2bbe0c` ("correct the rollback
instruction") rewrote the very comment block `2d92d6b` introduced, so
reverting the earlier commit alone conflicts in `.tmux.conf` — in the
emergency procedure, during the emergency, on a config that lives on three
machines.

`git revert --no-commit f2bbe0c 2d92d6b` *does* apply cleanly today (exit 0,
`.tmux.conf` byte-identical). It is still the wrong thing to document,
because it is a chain that has to be extended by hand every time anything
edits `.tmux.conf` — which is precisely how this instruction broke the first
time. The checkout above has no such coupling: it names a fixed pre-tmarchy
revision of one file and cannot conflict with anything committed after it.

### Why not just uncomment the plugin line

Do **not** "roll back" by uncommenting the `# set -g @plugin
'erikw/tmux-powerline'` line in `.tmux.conf` and leaving the rest alone. That
was the original plan for this rollback and it is wrong — actively dangerous,
not just incomplete. `2d92d6b` didn't only add tmarchy: it also deleted the
native window-status formats and the post-tpm `status-interval 5`
reassertion that were holding tmux-powerline in check. Uncommenting the
plugin line without restoring the rest of the file hands tmux-powerline back
its per-window `#()` callout at `status-interval` 1 — which is the 2026-08-21
fork storm, verbatim (12 windows × 1 Hz × a forked shell, 1,180 forks/sec
measured at 73% idle CPU). This was verified by running exactly that
combination on a throwaway server. `.tmux.conf` documents this at the
commented plugin line; this section exists so the same warning is findable
from here too.

## Things that cost real debugging time here

- **A running tmux server does not un-apply a deleted `set` line.**
  `source-file` only applies what it currently reads; an option set by a
  line that existed in an *earlier* `.tmux.conf` stays set on an
  already-running server until something explicitly unsets it
  (`set -gu <option>`). `.tmux.conf` does this deliberately for the
  hardcoded colour block tmux-powerline used to own (`status-bg`,
  `status-fg`, etc.) — see the `set -gu` block right before the `tpm` run
  line.
- **`status-bg` / `status-fg` are deprecated aliases that win over
  `status-style`.** If both are set, tmux draws with the alias, not the
  style — a live server that still has `status-bg` set from a pre-tmarchy
  session will visibly ignore `bar.conf`'s `status-style` until `status-bg`
  is explicitly unset (`set -gu status-bg`), which is what `.tmux.conf` does.
- **A `#()` callout re-runs roughly once per `status-interval` *per attached
  client*, plus once per explicit `refresh-client -S` — not once per
  `status-interval` total, and not driven by pane output at all.** This is
  the reason `tmarchy-tick-guard` exists: a ticker that assumes it's called
  once per interval, full stop, is wrong the moment a second client attaches
  (tmux over two terminals, say) or something starts polling with
  `refresh-client -S`. Measured rates are in the README's "governing
  invariant" section above; a dozen busy agent panes producing terminal
  output did not move the callout rate at all.
- **`node --test <directory>` does not glob-search on this node build.**
  It reports a bogus `1 test, 1 fail` instead of an error or a real
  collection failure, which reads exactly like "the suite has one test and
  it's broken" — it isn't. Always pass an explicit glob:
  `node --test tmarchy/test/*.test.js`.
