# tmux-goto — one picker for sessions, windows and panes

**Date:** 2026-08-26
**Status:** design approved, not yet implemented
**Branch:** `tmux-goto` (cut from master, which has tmarchy and tmux-gen)

## Context

`tmux-fzf` is installed and bound to `prefix + F`, but it is **mode-first**: you choose a category — session, window, pane, command, keybinding, process, clipboard, copy-mode — and only then search within it. Choosing the category is the part that breaks the flow, because the thing you want to reach is usually "that pane", not "a pane, in the pane category".

This box routinely runs a dozen agent windows named after worktree branches, so window names are long, similar, and not what you actually recognise. The running command usually is.

## Goals

1. `prefix + u` opens one picker over **sessions, windows and panes together**, no category choice.
2. Rows are tagged by type so a query can be narrowed by typing `win`, `pane` or `sess`.
3. Pane rows show the running command; window rows show tmarchy's scout state, so agents waiting on input are visible in the list.
4. Selecting a row goes there.

## Non-goals

- **Pane content / scrollback search.** A different and larger feature; explicitly deferred.
- **Commands and keybindings.** ~300 tmux commands would bury a few dozen navigation targets. `prefix + F` already serves that intent well.
- **Replacing `prefix + F`.** It keeps all nine of its modes; this lives alongside on its own key.

## Decisions

| # | Decision | Rationale |
| --- | --- | --- |
| 1 | Navigation targets only | Keeps the list to a few dozen rows, which is what makes fuzzy matching feel sharp rather than approximate. "Go somewhere" and "do something" are different intents. |
| 2 | Lives alongside `prefix + F` | Nothing that works today breaks. If this covers 95% of use, `F` can be retired later on evidence rather than prediction. |
| 3 | `prefix + u` | Free. `g` is tmux-gen, `Enter` is reserved for the Otto sibling, `a`/`o` are taken by `send-prefix` and `select-pane`. |
| 4 | Target id is field 1, hidden from display | fzf shows `--with-nth=2..` so the row reads cleanly while the action still has an unambiguous `%3` / `@7` / session name to act on. Parsing a target back out of display text would break on window names containing spaces. |
| 5 | Scout state comes from `@scout-state` | tmarchy's ticker already maintains it per window. Reading an option is free; recomputing it would duplicate the interpreter that tmarchy took a review round to consolidate. |
| 6 | Runs in `display-popup` | Matches tmux-gen and the which-key menu, and inherits the themed `popup-style`. |

## Architecture

```
bin/tmux-goto            the picker
bin/tmux-goto-selftest   fixture-driven tests
.tmux.conf               bind u display-popup -E "~/bin/tmux-goto"
```

| Piece | Does | Depends on |
| --- | --- | --- |
| `rows_from_lists` | three `list-*` outputs → formatted rows | nothing — pure, fixture-testable |
| `collect_rows` | runs the three `tmux list-*` calls, delegates | tmux |
| `act_on` | a chosen row → the tmux commands that go there | tmux |
| `main` | popup body: collect, fzf, act | fzf |

Row shape is `TARGET \t TAG DETAIL`, tab-separated, with fzf configured `--delimiter=$'\t' --with-nth=2..`.

## Failure behaviour

- No fzf installed → say so and exit non-zero; do not fall back to a raw list the user cannot act on.
- Empty selection (user pressed Esc) → exit 0 silently, change nothing.
- A target that vanished between listing and selection (window closed meanwhile) → tmux errors; report it rather than failing silently.
- `@scout-state` unset → the row renders without a state marker, not with an empty bracket.

## Testing

- `rows_from_lists` against fixture `list-*` output: a session, several windows, panes with and without scout state, names containing spaces.
- `act_on` against each row type, asserting the tmux command it would issue (dry-run via a `tmux` shim, not a live server).
- End-to-end on a throwaway server (`-L <unique>` **and** `-f /dev/null` — without the latter it sources the real config and leaks an autoreload watcher): create two windows, select one, assert the active window changed.
- Every test must be verified to fail when the behaviour it names is broken.
