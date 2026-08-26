# tmux-gen — a toolless command generator in a tmux popup

**Date:** 2026-08-26
**Status:** design approved, not yet implemented
**Branch:** `tmux-gen` (cut from `tmarchy`, which is live and unmerged)

## Context

Otto is reachable from Slack, email, voice and the dashboard, but not from a terminal — which is where the day is spent. The original request was one Claude-powered prompt that could both answer questions and generate CLI commands.

It split into two commands with different backends, because the two halves want opposite things:

| | `prefix + g` — **this spec** | `prefix + Enter` — Otto |
| --- | --- | --- |
| Backend | `claude -p`, Sonnet, **no tools** | Otto HTTP endpoint |
| Knows about your system | Only what is passed in the prompt | Vault, skills, MCP |
| Can act | Never | By design |
| Status | Unblocked, specced here | Blocked — endpoint does not exist |

The Otto half is captured separately as the pipeline doc **[[Otto Ask API]]** (`status: idea`). It is blocked because `~/.claude/settings.json` denies `Edit(/opt/otto/scripts/**)`, where `otto-server.js` lives.

## Goals

1. `prefix + g` opens a popup, takes a natural-language request, and returns either a shell command or a short answer.
2. A generated command is **inserted into the pane without a newline** — never executed.
3. The query has **no filesystem access**: no reading files, no running commands, no network tools.
4. It knows the pane's working directory and git branch, so answers are specific rather than generic.
5. Round-trip in single-digit seconds.

## Non-goals

- Conversation follow-ups. Each invocation is independent.
- History of past queries.
- Anything Otto-flavoured — vault, skills, calendar. That is the other command.
- Streaming output. One call, one answer.

## Decisions

| # | Decision | Rationale |
| --- | --- | --- |
| 1 | Insert without executing | An LLM-generated `rm -rf` must never run because a popup was mis-typed into. You read it, you press Enter. |
| 2 | Backend is `claude -p --model sonnet` | No new secret. An `ANTHROPIC_API_KEY` exists in Otto's env and would be ~4× faster, but reading `/opt/otto/.env` is deny-listed and copying the key elsewhere widens its blast radius for a convenience feature. Revisit if 6s proves annoying. |
| 3 | Tools disabled explicitly | `--disallowed-tools Read Bash Glob Grep WebFetch WebSearch Edit Write Task NotebookEdit TodoWrite`. Verified: the model reports it has no filesystem access. |
| 4 | A tight system prompt is **load-bearing, not cosmetic** | Measured: without one, `claude -p` took **20–41s** and misread requests as instructions to *run* commands ("Bash is disabled, so I can't run `git status`"). With one: **5–6.5s** and a clean single line. |
| 5 | Context is cwd + branch only | Cheap and safe. Pane scrollback would enable "why did that fail?" but a pane may hold pasted keys or tokens — a real exfiltration surface for a convenience feature. |
| 6 | Model replies in JSON, parsed with `jq` | Distinguishing "command" from "answer" by prefix line degrades badly when the model adds a preamble. JSON either parses or visibly doesn't. `jq` is already a dependency of the deletion circuit breaker. |
| 7 | One script, not a library | The popup blocks until its command exits, so input, query, render and key handling share a process. Matches `tmux-askpass`. |
| 8 | `prefix + g`; `prefix + Enter` reserved for Otto | Both `a` and `o` are taken (`send-prefix`, `select-pane`). `Enter` is a large target on a phone keyboard, which matters for ShellFish. |

## Architecture

```
bin/tmux-gen        the whole tool
.tmux.conf          bind g display-popup -E -w 80% -h 60% "~/bin/tmux-gen #{pane_id}"
```

Four responsibilities, each independently testable:

| Piece | Does | Depends on |
| --- | --- | --- |
| `gather_context` | cwd + branch of the target pane | `tmux display-message -p -t`, `git -C` |
| `query` | one `claude -p` call: tools off, system prompt, 30s cap | `claude` binary |
| `parse_reply` | model reply → kind + payload | nothing — pure, fixture-testable |
| `render_and_act` | draw the result, handle `Enter` / `y` / `q` | `tmux send-keys -l`, `tmux set-buffer -w` |

The script receives the originating pane id as `$1`, so it can act on that pane directly rather than marshalling state back through a FIFO the way `tmux-askpass` does.

### Two mechanics that are easy to get quietly wrong

**`send-keys` must use `-l` (literal).** Without it, tmux interprets tokens as key names: a command containing `Enter`, `Space` or `;` becomes keystrokes rather than text, and `;` is tmux's own command separator. This is the difference between inserting `find . -name '*.log' ; rm` as text and it meaning something else entirely.

**Copy uses `tmux set-buffer -w`**, which routes through OSC 52 to the host terminal's clipboard — the same path `@override_copy_command` already uses, so `y` works from ShellFish on a phone.

## Data flow

1. `prefix + g` → `display-popup -E` runs `tmux-gen <pane_id>`.
2. Read cwd (`tmux display-message -p -t "$PANE" '#{pane_current_path}'`) and branch (`git -C "$cwd" rev-parse --abbrev-ref HEAD`, empty outside a repo).
3. Prompt for input. Empty input exits 0 immediately, calling nothing.
4. Display "thinking…", then one `claude -p` call with the context header and the request, capped at 30s.
5. `parse_reply`: strip markdown fences, parse JSON.
6. Render. `Enter` inserts (command only), `y` copies, `q` / Esc closes.

Expected reply shape:

```json
{"kind": "command", "command": "git reset --soft HEAD~1", "note": "keeps changes staged"}
{"kind": "answer",  "note": "-F sets the input field separator."}
```

## Failure behaviour

One rule governs all of it: **the tool may only put text on the prompt line, and only when it positively identified a command.**

| Failure | Behaviour |
| --- | --- |
| `claude` missing, or non-zero exit | show stderr, insert nothing, exit 1 |
| 30s timeout | "timed out", insert nothing |
| Reply is not parseable JSON | display raw text **as an answer** — `Enter` is not offered |
| `kind` is `command` but the command is empty or missing | treat it as an answer — `Enter` is not offered |
| The command contains ANY control character | treat it as an answer — see below |
| Popup killed mid-query | nothing inserted; no partial state |

**A command containing any control character is not insertable.** `send-keys -l` sends a literal
newline byte, and a terminal in canonical mode flushes a line to the shell on any
newline byte — not only on the Enter key. So `{"command":"echo hi\nrm -rf /"}` would
execute `echo hi` the moment it was inserted, with no keypress from the user. The
guarantee "we never append Enter" is about the call site; it says nothing about a
newline carried inside the payload. A newline is not the only byte that does this, and blacklisting it alone is not enough:

- **CR (0x0D)** submits the line exactly like LF — it is what the Enter key physically sends.
- **ESC (0x1B)** reaches readline's dispatcher; `ESC` then `C-e` is `shell-expand-line`, which
  performs command substitution. `echo $(touch /tmp/x)\x1b\x05` was demonstrated creating the
  file with no keypress, leaving only `bash-5.2$ echo` visible afterwards.
- **C-o (0x0F)** executes the line in bash; **C-u (0x15)** and **BS/DEL** silently discard the
  benign-looking prefix the user just read, so they approve one thing and run another.

So the rule is a whitelist violation, not a blacklist: any `[[:cntrl:]]` byte disqualifies.
Enforced in `parse_reply` (the gate) and asserted again at the `send-keys` call site, because this is the property the whole tool exists
to provide.

The third row is the load-bearing one. When we cannot tell whether the model produced a command, the failure mode is "you read some text", never "something plausible-looking landed on your prompt". No code path appends a newline.

## Testing

**No test may call the real Claude** — it would cost money on every run and go flaky with the network. `TMUX_GEN_CLAUDE` overrides the binary path; tests point it at a stub echoing fixtures.

- `parse_reply` fixtures: clean JSON, fence-wrapped JSON, JSON behind a prose preamble, garbage, empty.
- `gather_context`: pane in a repo, pane outside one, pane in a git worktree (this repo uses worktrees for agent builds).
- **The safety test.** On a throwaway server (`-L <unique>` **and** `-f /dev/null` — without the latter it sources the real config, pulls in tpm, and leaks an orphaned autoreload watcher): create `/tmp/tmux-gen-canary`, stub the reply to `rm -rf /tmp/tmux-gen-canary`, drive the flow, press Enter, then assert **both** that the text is on the prompt line **and that the canary still exists**. If this tool ever gains the ability to execute, this test fails loudly.
- Every test asserts a behaviour that can fail. This repo has repeatedly produced assertions that passed whether or not the code under them worked; each new test must be verified by breaking the thing it guards.

## Open follow-ups

- If ~6s proves annoying in daily use, revisit Decision 2 (direct API, ~1–2s) — that is a deliberate decision about key handling, not a silent optimisation.
- `prefix + Enter` (Otto) depends on **[[Otto Ask API]]** shipping first.
