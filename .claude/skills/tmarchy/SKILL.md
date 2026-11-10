---
name: tmarchy
description: Inspect and prompt the other coding agents running in this tmux server, via bin/tmarchy-agent — list them with state and how long they have been in it, read a pane's output, jump focus, or type a prompt into another agent's pane. Use ONLY when the user explicitly asks about tmarchy, about the agents or panes in their tmux server, or to talk to another agent. Do NOT use it merely because a task could be parallelised or would benefit from a second agent.
---

# tmarchy

`bin/tmarchy-agent` is the whole interface. Run `tmarchy-agent` with no
arguments for its usage; it is the authority, not this file.

Everything it reports comes from `tmux-agents-rows --json`, which is the same
classifier the status bar, `prefix + ~` and `prefix + A` use. So what you read
here cannot disagree with what the user sees on their own screen.

## Before anything else

Check you are actually in a tmux pane:

```bash
[ -n "${TMUX:-}" ] || echo "not in tmux; tmarchy-agent cannot see anything"
```

Outside tmux there is nothing to inspect. Say so and stop.

## Looking

```bash
tmarchy-agent list                 # JSON: every live agent
tmarchy-agent list --state wait    # just the ones blocked on a human
tmarchy-agent read %3 --lines 80   # that pane's recent output
tmarchy-agent focus %3             # go there (changes what the user sees)
```

`list` gives each agent its `pane`, `session`, `window`, `state`
(`wait`/`busy`/`done`/`idle`), `seconds` in that state, the `name` Claude Code
gave its own pane, and `self` — which marks the pane **you** are in. Read
identifiers out of that JSON rather than guessing them; a pane id is only
unique within one tmux server.

`state` means what it means everywhere else in this repo:

- `wait` — a human is being asked something. This is the one worth acting on.
- `busy` — working.
- `done` — finished its turn.
- `idle` — nothing in flight, or nothing has been heard from it.

## Prompting another agent

```bash
tmarchy-agent prompt %3 "rebase onto main and run the suite"
tmarchy-agent prompt %3 "..." --submit
tmarchy-agent prompt %3 "..." --submit --wait --until idle --timeout 180000
```

**Without `--submit` the text is typed and left sitting at the prompt,
unsent.** That is the default on purpose: the user sees what you proposed and
presses Enter themselves. Prefer it. Reach for `--submit` only when the user
has asked for the other agent to actually be driven.

`--wait` requires `--submit` (nothing submitted means nothing will change
state) and is always bounded — the timeout is capped at ten minutes whatever
you pass.

## What it refuses, and why not to work around it

Each of these is a deliberate refusal. If you hit one, report it to the user —
do not reach for `tmux send-keys` directly to get past it.

- **A control byte in the text.** CR submits a line exactly like Enter, and an
  ESC byte reaches readline's dispatcher, where `ESC` then `C-e` performs
  command substitution with no keypress and no visible trace. Rewrite the
  prompt as plain text on one line.
- **Your own pane.** An agent prompting itself inserts into its own input and,
  with `--submit`, drives itself in a loop.
- **A pane that is not a live agent.** A stale id would otherwise type into
  whatever shell is sitting there. `list` is how you get a current one.
- **Anything that is not a `%<digits>` pane id.** Nothing reaches a tmux
  command line unvalidated.

Every one of these is settled *before* anything is typed, so a refusal means
the target pane is untouched.

## What it will not do at all

There is no create, split, kill, or rename here. If the user wants layout
changed, say which tmux command would do it and let them run it.

## When something looks wrong

```bash
tmarchy-agent list              # if this is [] but agents are running
bin/tmux-agents --doctor        # the row emitter's own report
```

An empty `list` with agents clearly running usually means the scout status file
is missing or stale, which `tmux-agents --doctor` reports directly.
