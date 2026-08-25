# tmarchy — an Omarchy-flavored look and feel for tmux

**Date:** 2026-08-25
**Status:** design approved, not yet implemented
**Branch:** `tmarchy`

## Context

The tmux setup in this repo has accumulated the right ingredients without the coherence
that makes Omarchy feel designed: nerd-font glyphs in the powerline theme, a which-key
menu on `prefix + ?`, scout-state color coding on tabs, a window sidebar. What is missing
is a single visual vocabulary. Color is defined independently in `.tmux.conf`, in
`.config/tmux-powerline/themes/chrismetcalf.sh`, and in nvim's `spaceduck`, and the three
drift.

There is a second, harder motivation. The status bar is currently rendered by
tmux-powerline, which drives every element through shell callouts. On 2026-08-21 that
architecture produced ~1,180 forks and ~88k context switches per second on a machine that
was 73% idle — the box felt wedged from scheduler churn rather than load. The emergency
fix (`ba1aa74`) baked the window-tab format string in natively and cut forks to ~536/sec.
tmarchy finishes that job: after this work, **nothing forks on a status redraw**.

## Goals

1. A flat, spaced, icon-led status bar in the waybar idiom, built from tmux's own format
   strings.
2. A theme layer covering Omarchy's eight curated themes plus a port of the current
   palette, switchable at runtime and persistent across restarts.
3. A restructured which-key menu that surfaces the theme switcher and reads like
   Omarchy's nested action menu.
4. A visible indicator when a window is a nested session on a remote host.
5. Zero shell execution per status redraw.

## Non-goals (each gets its own spec)

| Deferred | Why separate |
| --- | --- |
| Project/session launcher, incl. SSH connection management | Own subsystem: connection lifecycle, prefix passthrough, ControlMaster reuse, reconnect-after-drop. Only the *display* half of SSH is in scope here. |
| Layout presets | Independent keymap work. |
| Agent-aware navigation (cycle waiting agents, dashboard) | Independent; builds on scout. |
| Keybinding overhaul | Deliberately last — it re-labels everything the other pieces add, and the menu should be regenerated from the final scheme rather than edited twice. |
| Moving nvim off `spaceduck` | Real scope (colorscheme plugin, lualine theme, indent-blankline colors). Until it happens, nvim will clash with a Tokyo Night bar. Accepted knowingly. |

## Decisions

| # | Decision | Rationale |
| --- | --- | --- |
| 1 | Replace tmux-powerline entirely with native formats | Only option where nothing runs per redraw. |
| 2 | Tokyo Night is the default theme | Most recognizably Omarchy. |
| 3 | Ship all 8 Omarchy themes + `jewel` (current palette, ported) | `jewel` makes "I miss my old colors" a theme switch rather than a rollback. |
| 4 | Presentation lives only in `bar.conf`; themes are color tables only | A theme must never contain logic, or adding one stops being copy-paste. |
| 5 | Dynamic values come from one ticker, invoked by a single `#()` | One fork per 5s, versus 1,180/sec before. A fork-free daemon was rejected: it buys 0.2 forks/sec for lifecycle management on a box with 139-day uptime. |
| 6 | Segments are drop-in `segments.d/*.js` modules | Required as modules, not spawned, so extensibility costs no forks. Host differences resolve inside each module. |
| 7 | Self-contained `tmarchy/` directory, loaded by explicit `run-shell` after tpm | Three incidents in this repo have come from tpm load ordering. This stays outside it while keeping a publishable structure. |
| 8 | Retire powerline by non-reference, never deletion | Makes rollback a two-line edit. |
| 9 | Built on the `tmarchy` branch | Rollback during the trial is `git checkout master`. |

## Architecture

Four layers, each with one job:

1. **Theme files** — `themes/*.conf`. Each sets `@theme-*` options and nothing else.
2. **Bar definition** — `bar.conf`. Every format and style, as `#{}` expressions
   referencing `@theme-*` and `@bar-*`. Never runs a shell. It also owns
   `status-interval`, since after powerline is gone nothing else contends for it.
3. **Ticker** — `bin/tmarchy-tick`. Writes the values tmux cannot compute itself into
   user options. Prints nothing.
4. **Switcher** — `bin/tmarchy-theme`. Reads and writes the persisted theme.

The load-bearing mechanism is that tmux expands user options *inside* style specs:
`#[fg=#{@theme-fg}]` renders as SGR `38;5;203`. This was verified on tmux 3.5a by
capturing a live client's status line (see Testing). It is what makes a theme switch a
one-shot option sweep with no re-render cost.

### File layout

```
~/.homedir/tmarchy/
  tmarchy.tmux              entry point: sources bar.conf, restores persisted theme
  bar.conf                  all formats and styles
  themes/
    tokyo-night.conf        default
    catppuccin.conf  everforest.conf  gruvbox.conf  kanagawa.conf
    nord.conf  rose-pine.conf  matte-black.conf
    jewel.conf              current palette, ported
  segments.d/
    load.js  agents.js  branch.js  remote.js  battery.js
  bin/
    tmarchy-tick  tmarchy-theme  tmarchy-selftest
  README.md
```

`.tmux.conf`, after the tpm line, gains exactly one guarded load:

```tmux
if-shell '[ -f ~/.homedir/tmarchy/tmarchy.tmux ]' 'run-shell ~/.homedir/tmarchy/tmarchy.tmux'
```

Three things in `.tmux.conf` must be **removed** at the same time, or they will fight
`bar.conf` for the same options:

1. The two baked-in `window-status-format` / `window-status-current-format` lines from
   `ba1aa74`. They were the emergency de-forking fix; `bar.conf` supersedes them, and
   leaving both means whichever loads last silently wins.
2. The post-tpm `set -g status-interval 5` re-assertion. It exists only because
   powerline's `main.tmux` reset the value; with powerline unloaded there is nothing to
   re-assert against, and `bar.conf` owns the option.
3. The `window-status-style` / `window-status-current-style` colour-235 lines, which
   hardcode the old background.

The `@plugin 'erikw/tmux-powerline'` line is commented rather than deleted — see Rollback.

`bin/tmarchy-theme` is symlinked into `bin/` so it is on `$PATH` for CLI use. The tick is
not: it is only ever invoked by absolute path from `bar.conf`.

### Component contracts

| Component | Does | Interface | Depends on |
| --- | --- | --- | --- |
| `themes/*.conf` | Defines one palette | `set -g @theme-<name> <color>` | nothing |
| `bar.conf` | All presentation | sourced by `tmarchy.tmux` | `@theme-*`, `@bar-*` |
| `tmarchy-tick` | Sets per-window and global options from live data | invoked as `#(…/tmarchy-tick)`; prints nothing | `segments.d/`, scout's `status.json` |
| `segments.d/*.js` | One value each | `{ name, enabled(), render() }` | node |
| `tmarchy-theme` | `list` \| `current` \| `set <name>` | CLI + menu | `themes/`, state file |
| `tmarchy-selftest` | Asserts options and rendered SGR codes | CLI, exit code | throwaway tmux server |

## Theme vocabulary

Every theme file defines exactly these, and nothing else:

| Option | Meaning |
| --- | --- |
| `@theme-bg` | Bar and tab background |
| `@theme-fg` | Primary foreground |
| `@theme-dim` | Inactive tabs, separators, low-emphasis text |
| `@theme-accent` | Session name, primary highlight |
| `@theme-accent-alt` | Secondary highlight (branch, host) |
| `@theme-border` | Pane borders |
| `@theme-wait` | Scout state: agent awaiting input |
| `@theme-busy` | Scout state: agent working |
| `@theme-done` | Scout state: agent finished |
| `@theme-remote` | Nested/remote session indicator |

Scout's three state colors keep their existing *meaning* (wait/busy/done) but take new
values per theme. This is the one piece of relearning the redesign imposes, and it is
deliberate: the states must stay legible against each theme's background.

## Bar contents

```
│  main   argabuthon   1 ● claude  2  relay  3 vault    2 busy   master  6.2  16:42 │
   └ session  └ remote  └ tabs: index, scout dot, 14-char name   └ right segments
```

- **Left:** session name; remote host when the *current* window is a nested SSH session.
- **Center:** window tabs. Index, a scout-state dot, and the window name truncated to 14
  characters (`#{=/14/…:window_name}` — preserved from today). Tab text tints by
  `@scout-state`, as it does now.
- **Right:** agent summary, branch, load, battery (host-gated), clock. Each renders
  through `#{?@bar-x,…,}` so an unavailable segment vanishes rather than leaving an
  orphaned icon.
- The **agent summary** (`agents.js`) is the successor to powerline's `tmux_scout`
  segment. It is deliberately redundant with the per-tab dots: the dots answer "which
  window", the summary answers "is anything waiting on me" without reading the tab strip.
- **Remote windows** are marked in the tab strip with `@theme-remote`, so prefix-key
  ambiguity in a nested session is visible rather than discovered by pressing a key.

Detection of a remote pane is native (`pane_current_command` matching ssh); resolving the
*host name* needs the tick, which parses the ssh invocation.

## Menu changes

`config.yaml` for tmux-which-key gains a `+Theme` submenu listing all nine themes, each
calling `tmarchy-theme set <name>`. The existing `+Agents` / `+Tools` / `+Windows` /
`+Panes` structure is retained; only the theme entries are added. Deeper restructuring
toward Omarchy's action-menu shape waits for the keybinding overhaul, which will
regenerate this file anyway.

## Data flow

Once per `status-interval`, tmux expands `status-right`, which begins with a single
`#(…/tmarchy-tick)`. The tick prints nothing and runs for its side effects:

1. Reads `~/.tmux-scout/status.json` through scout's own libs.
2. Per window, computes scout state, the git branch of the active pane's path, and the
   remote host where applicable — written in **one batched `tmux set-option -w`** call.
3. Requires `segments.d/*.js`, calls `render()` on each that reports `enabled()`, and sets
   `@bar-<name>` globally.

Everything visible is then pure `#{}` expansion. **Accepted trade-off:** values are one
interval stale, because options set during a render are consumed by the next one. At 5s
this is invisible for load, branch, and agent counts.

## Failure behavior

The governing rule: *a broken segment must never break the bar.*

- Each `render()` is individually wrapped. A throwing segment leaves its `@bar-*`
  untouched and does not affect the others.
- Optional segments render through `#{?@bar-x,…,}` — an empty value disappears rather
  than leaving empty brackets or a stray icon.
- If the tick fails entirely, options keep their previous values: the bar shows
  five-second-stale data instead of breaking.
- Missing or corrupt theme state falls back to `tokyo-night`.
- Without node, or with scout not installed, the native parts still render and
  scout-dependent segments self-disable via `enabled()`.
- The load is `if-shell`-guarded, so a fresh checkout before install does not throw.

## Testing

- `node --check` and `bash -n` gates on every script.
- `segments.d/*.js` `render()` functions are unit-tested directly in node.
- **`tmarchy-selftest`** spins a throwaway server (`tmux -L tmarchy-test -f /dev/null`),
  sources `tmarchy.tmux`, asserts the expected options exist, then attaches a real client
  inside a second throwaway server and uses `capture-pane -p -e` to assert the correct SGR
  codes appear in the rendered status line. This technique was validated during design:
  `#[fg=#{@theme-fg}]` with `@theme-fg=colour203` captured as `^[[38;5;203m`. It gives all
  nine themes an automated check rather than a visual one.
- Manual pass: nine themes, plus one nested SSH window to confirm the remote indicator.

## Rollback

Powerline is retired by non-reference:

- The `@plugin 'erikw/tmux-powerline'` line is **commented, not removed**; tpm leaves the
  plugin directory in place.
- `.config/tmux-powerline/` — `config.sh`, `segments/`, `chrismetcalf.sh` — stays tracked
  and untouched.
- The `tmux-scout-window-tint` → `tmarchy-tick` rename is a `git mv` **plus** an update to
  `.config/tmux-powerline/segments/tmux_scout.sh`, which calls the old name at line 6, in
  the same commit — so the pair reverts as a unit and powerline's scout segment still
  works on rollback.

Reverting is then: uncomment the plugin line, comment the tmarchy load, `prefix + r`.
During the trial it is simply `git checkout master`.

**Known caveat:** running tpm's *clean* command while the plugin line is commented will
delete the powerline directory. Recovery is `prefix + I`, since it is a git clone, but it
is a step.

## Documentation impact

The rename invalidates three places that name `tmux-scout-window-tint`: `CLAUDE.md` (two
entries), `bin/tmux-scout-next-wait`, and the saved `rsnapshot`-adjacent tmux memory. The
implementation plan must update all three, or the name will lie about what the script
does. `CLAUDE.md` also needs a tmarchy section describing the theme vocabulary and the
"nothing forks on redraw" invariant, since that invariant is the whole point and is
otherwise invisible to a future reader.
