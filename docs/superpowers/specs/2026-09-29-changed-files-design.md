# Changed-files sidebar + `@file` picker

**Date:** 2026-09-29
**Status:** designed
**Depends on:** `bin/tmux-window-sidebar`, `bin/lib/tmux-theme.sh`, `bin/lib/tmux-frecency.sh`

## Context

Two gaps, both about files, both hit constantly while driving agents from tmux.

**Seeing what changed.** An agent working in a worktree window edits files you do not see until you look. The tab tints (`@scout-state`) say *an agent is doing something*; nothing says *what it touched*. `git status` in a spare pane answers it once, not continuously, and not ordered by recency — which is the part that matters when you want to know what the agent just did rather than everything it has done.

**Referencing a file in a prompt.** Typing `@path/to/thing.sh` means either remembering the path or breaking out to a shell to find it. Claude Code's own `@` completion works from the prompt but only from the cwd it was started in, and it does not know about the six fzf pickers this repo already has for everything else.

The sidebar (`prefix + W`) is already the place per-window context lives, and it is already the one surface in this repo that ignores the tmarchy palette — it hardcodes 256-colour indices from the powerline era. Adding a section is the moment to fix that.

## Goals

1. A `CHANGED` section in the `prefix + W` sidebar: files changed in the active pane's repo, newest first, with how long ago.
2. `prefix + f` opens an fzf picker over files and inserts `@<path>` at the prompt without running it.
3. The sidebar follows the active tmarchy theme, like every other surface here.
4. Neither costs meaningfully more than the sidebar costs today.

## Non-goals

- **Claude-vs-you attribution.** A `PostToolUse` hook could say which edits were the agent's, at the cost of a producer, a drop file, a TTL and a decay rule — the discipline `agents.d` needed. git already knows what changed; that is enough for v1.
- **Per-file edit history.** A file edited five times shows one row with its last touch.
- **Click-a-row-to-insert.** The sidebar's click handler exists (`tmux-sidebar-click`) but currently means "switch window". A second meaning on a second section is a separate interaction question.
- **Opening files in an editor.** The picker inserts text. `prefix + e` (yazi) is the file browser.
- **Replacing `prefix + F`.** tmux-fzf keeps its nine modes.

## Decisions

| # | Decision | Rationale |
| --- | --- | --- |
| 1 | Data is `git status` + mtime, not a hook | No producer, no TTL, no decay. Costs attribution (see non-goals); buys an entire class of staleness bug this repo has already paid for once. |
| 2 | **`--ignore-submodules` is mandatory** | Measured here: `git status --porcelain` is **305 ms**, `--ignore-submodules` is **32 ms**. Nine submodules. At a 1 s redraw the first number is a third of a core per window, which is the 2026-08-21 fork-storm shape. Pinned by a test, because nothing else would catch its removal. |
| 3 | Refresh is decoupled from render | Render every 1 s from cache (builtins only); refresh every 3 s and **only when the window is active**. Same split as `bar.conf` vs `tmarchy-tick`, for the same reason. |
| 4 | The cache is shell variables, not a file | The sidebar is a long-running process per window, so the process *is* the cache. No state file to go stale, no reader/writer race, nothing to clean up when the window closes. |
| 5 | One `stat` for all paths, never one per file | A fork per changed file is the cost this design exists to avoid. `stat -f '%m %N'` (BSD) / `-c '%Y %n'` (GNU), one call, branch on `uname`. |
| 6 | Repo is the **active pane's** toplevel, sidebar excluded | Not sticky. Move to a pane in another repo and the list follows — right for a per-window panel, where the question is "what is happening here". The sidebar pane is skipped when picking that pane (it is marked `@sidebar-pane`), or focusing the sidebar itself would re-root the list to wherever it happened to start. Not in a repo → no section at all. |
| 7 | Colour = recency, glyph = git state | Recency is the headline, and colour is the more salient channel. Glyph carries `●` modified, `+` added, `○` untracked, `−` deleted. Two facts, two channels, no overloading. |
| 8 | **`@theme-wait` is off limits**, deletions included | Red means "an agent needs you" on every other surface here. A deleted file is not that. |
| 9 | Paths truncate from the **left** | `…/lib/tmux-theme.sh`. The opposite of the window list, because for a file the basename is what identifies it and for a window the prefix is. |
| 10 | `prefix + f`, taking `find-window` | `f` is a tmux default this repo has not claimed, and `prefix + u` (`tmux-goto`) already lists every window with fuzzy matching, a scout tint and frecency order. Precedent for overriding a default: `prefix + p`, `prefix + D`, `prefix + b`. |
| 11 | Picker re-roots from inside fzf | `^g` git root, `^h` home, `^u` parent, via `reload()`. Header shows the live root. One key, any scope, no mode chosen up front — the `tmux-goto` lesson. |
| 12 | Home root is depth-capped | `rg --files ~` is gitignore-aware, but `~` has no gitignore and `~/Library` is unbounded on macOS. Depth 4, stated in the header rather than silently applied. |
| 13 | Sidebar moves to `bin/lib/tmux-theme.sh` | It is the last surface on hardcoded 203/214/78/245. The shared library is already cached (one `tmux show -g`), so this costs nothing and makes the sidebar follow a theme switch like everything else. |

## Architecture

```
bin/tmux-window-sidebar     modified: two sections, themed, git cache
bin/tmux-files              new: the picker
bin/tmux-files-selftest     new: fixture-driven tests
.tmux.conf                  bind f display-popup -E -d '#{pane_current_path}' "~/bin/tmux-files"
```

| Piece | Does | Depends on |
| --- | --- | --- |
| `git_refresh` | repo → `(path, state, mtime)` triples into parallel arrays | git, stat |
| `changed_rows` | triples + width + row budget → formatted rows | nothing — pure, fixture-testable |
| `window_rows` | existing window list → formatted rows | nothing — pure |
| `draw` | budget the two sections, paint | tmux |
| `file_rows` | root → candidate paths | rg (fallback `find`) |
| `to_ref` | absolute path + target cwd → `@`-reference text | nothing — pure |
| `insert` | chosen refs → the target pane's prompt | tmux |

**The target pane** is the one that was active when the popup opened, captured once at startup. Not "the active pane at insert time": a popup is an ordinary tmux client and the active pane can move underneath it, which is the hazard `tmux-dropdown` documents. Not the popup's own pane either — a `display-popup` pane is where fzf is drawing.

### Sidebar layout

Column 1 is a gutter in both sections. Metadata right-aligns in a shared column, so the two sections read as one grid rather than two stacked widgets. The active window's full-width highlight bar becomes a left rule — the bar costs two columns of name budget and the sidebar is 24 wide.

```
 WINDOWS
▌2 tmarchy    +3
 3 otto-goal
 4 home-assis

 CHANGED
●tmux-goto    12s
●…/theme.sh    1m
+tmux-files    4m
○scratch.md   31m
−old-thing      —
```

### Budget

`WINDOWS` takes as many rows as it has windows, up to a ceiling of half the pane height; under that ceiling it takes only what it needs. `CHANGED` gets everything left. Fewer than two rows of room and `CHANGED` is dropped **header and all** — the screensaver panel's rule, since a heading with nothing under it reads as broken rather than absent.

### Cost

Per refresh, on the active window only, every 3 s:

| Call | Cost |
| --- | --- |
| `git rev-parse --show-toplevel` | 12 ms — only when the active pane's cwd moves |
| `git status --porcelain --ignore-submodules` | 32 ms |
| `stat` (one call, all paths) | ~13 ms |

~45 ms per 3 s is a 1.5% duty cycle. Age uses bash's `SECONDS`; there is no `date` fork anywhere in the loop. The `window_active` test is free — `draw` already pays one `display-message -p` for `pane_width`/`window_panes`, so `#{window_active}` joins that format string.

### Reference form

The picker's output must be resolvable by Claude Code's `@`, which resolves against the session's cwd:

- Under the target pane's cwd → relative (`bin/tmux-goto`)
- Anywhere else → `~/`-prefixed when under `$HOME`, else absolute

Multi-select joins with spaces and ends with one trailing space, so the prompt is ready for prose.

## Failure behaviour

- **Not in a git repo** → no `CHANGED` section, no error, no empty header. `WINDOWS` gets the whole pane, exactly as today.
- **`git` missing or the repo unreadable** → same as above. The sidebar must not become an error display.
- **A refresh that fails or times out** → previous rows stand, one interval stale. Never a blank section, never a partial one.
- **A deleted file has no mtime** → `stat` fails on it; it keeps its status glyph, sorts last, and shows no age rather than `0s`.
- **`rg` missing** → fall back to `find -type f`; slower and not gitignore-aware, but the picker works.
- **`fzf` missing** → say so and exit non-zero. Do not fall back to a list the user cannot act on (the `tmux-goto` rule).
- **Empty selection** → exit 0, insert nothing, change nothing.
- **A filename containing a control byte** → refused, nothing inserted. See below.

## Safety

Filenames are not trusted input — they come off the filesystem, and this feature's whole job is putting them on a shell prompt.

Insertion reuses `tmux-gen`'s gate verbatim:

- Reject any `[[:cntrl:]]` byte, not just newline. CR submits a line exactly like Enter; an ESC byte reaches readline's dispatcher, where `ESC` then `C-e` performs command substitution with no keypress and no visible trace.
- `tmux send-keys -t <pane> -l -- "$text"`. Without `-l` tmux reads tokens as key names; without `--` a path starting with `-` parses as flags, and `-R` silently resets the pane's terminal.

The picker never runs the command it inserts.

## Testing

`bin/tmux-files-selftest`, plus cases for the pure sidebar functions. Repo convention: every assertion is verified non-vacuous by sabotaging the implementation and confirming *exactly* the intended assertion fails.

| Test | Guards |
| --- | --- |
| Age format at each boundary (`59s`/`1m`/`59m`/`1h`/`23h`/`1d`) | Off-by-one at the bucket edges |
| Left-truncation keeps the basename | The whole point of decision 9 |
| At a height where `CHANGED` cannot fit, the header is gone too | The saver's rule, which is easy to lose in a refactor |
| Path under cwd → relative; outside → `~/`; outside `$HOME` → absolute | The three branches of the reference form |
| A filename with a newline, a CR, and an ESC is each refused | The safety gate, one case per byte class |
| A filename starting with `-` does not become a `send-keys` flag | The `-R` trap |
| `--ignore-submodules` is present in the source | Decision 2 — a 10× perf regression nothing else would catch |
| A deleted path sorts last and renders no age | The `stat`-fails branch |

The last two are regression pins rather than behaviour tests, in the style of `tmarchy/test/scout.test.js`'s grep for a re-inlined `needsAttention`.

## Rollback

The picker is additive: delete `bin/tmux-files` and the `bind f` line, and `find-window` comes back.

The sidebar is a single-file change, so `git checkout <ref> -- bin/tmux-window-sidebar` restores the old one. The theme move is the only part that touches a shared surface, and it only *reads* `bin/lib/tmux-theme.sh`.
