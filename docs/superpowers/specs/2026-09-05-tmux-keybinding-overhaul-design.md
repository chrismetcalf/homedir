# tmux keybindings — a verb-first action menu

Status: designed, not yet implemented.

## Context

The last deferred item from the tmarchy design doc
(`2026-08-25-tmarchy-design.md`), which scoped it out as *"deliberately last —
it re-labels everything the other pieces add, and the menu should be
regenerated from the final scheme rather than edited twice"*, and separately
noted that *"deeper restructuring toward Omarchy's action-menu shape waits for
the keybinding overhaul, which will regenerate this file anyway."*

Everything it was waiting on now exists: the which-key menu, the `prefix + p`
palette, four fzf pickers, the `+Overlays` menu, and the theme system.

Today `.config/tmux/plugins/tmux-which-key/config.yaml` holds **110 leaf
commands across 22 top-level slots**, grouped by tmux *noun* — `+Panes` (28),
`+Windows` (19), `+Client` (14), `+Agents`, `+Tools`, `+Overlays`, `+Theme`,
`+Buffers`, `+Sessions`, `+Keys`. Two surfaces read that one file: the
which-key menu (`prefix + ?`, `prefix + m`) and `bin/tmux-cmd`'s palette
(`prefix + p`). `bin/tmux-keys` reads the live server instead and is unaffected
by anything here.

Two problems motivated the work.

**The menu teaches a vocabulary that is not the keymap.** Its top-level keys are
a separate namespace from the prefix keys, and they disagree at five of the
places you would most expect them to agree:

| In the menu | Direct binding for that key |
| --- | --- |
| `P` → Command palette | `prefix + p` is the palette |
| `c` → +Copy | `prefix + c` is new-window |
| `b` → +Buffers | `prefix + b` is break-pane |
| `s` → +Sessions | `prefix + s` is choose-tree |
| `t` → +Tools | `prefix + t` is the clock |

That works against the stated intent recorded in `CLAUDE.md`, that the palette
"shows its key so the keys get learned rather than replaced".

**Noun grouping does not answer the question you actually have.** You know you
want to *open* something before you know whether it is a pane, a window or a
tool, so `+Panes`/`+Windows`/`+Tools` makes you guess the object first.

## Goals

- Group the menu by **what you want to do**, not what it acts on.
- One taxonomy shared by the menu and the palette, declared once.
- Reduce the menu, not merely rearrange it.
- Move nothing that already has muscle memory.

## Non-goals

- **No rebinding of the ~52 direct keys.** Demoted bindings keep working; they
  stop being *advertised*. Nothing is unbound.
- **No plugin-key removal.** extrakto's `Tab`, tmux-yank's `y`, tmux-logging's
  `M-p`/`M-P`/`P` stay exactly as they are; an unbind would also have to survive
  `prefix + I` reinstalling the plugin.
- **No change to `bin/tmux-keys`.** It diffs the live server against a stock one
  and never reads `config.yaml`.
- **No new key chords.** `prefix + <verb> + <noun>` as a *binding* scheme was
  considered and rejected: it retrains every key, including the overlay work
  from the week before this.

## Decisions

1. **Verb-first, noun second.** Nine verbs at top level. Only the three that
   exceed ten entries get a noun tier inside them.
2. **The verb is the first path segment.** No new schema field — once the menu
   is verb-first, the top-level menu a command sits in *is* its verb, and
   `flatten_menu` already tracks the path.
3. **`class_for` is deleted.** The palette's glyph comes from the declared verb
   through a nine-entry lookup instead of pattern-matching command text. The
   heuristic survives only as a fallback for entries outside any verb.
4. **`+Agents` survives as a deliberate noun exception** at top level. It is the
   one grouping here that is a domain rather than a tmux object, and the agent
   workflow is central to this setup (scout state in the bar, worktree windows,
   `prefix + ~`). One documented break in the scheme is cheaper than pretending
   agents are just another tmux noun.
5. **A ten-key favourites row** stays at menu top level as a shortcut strip.
6. **`+Theme`'s nine entries collapse to one `Theme…`** opening a fifth fzf
   picker, consistent with the four that already exist.

## The verb set

`class_for` files `resizep`/`swapp`/`break`/`rotate` under *navigate*, which is
why a naive verb-first split appeared to put 36 entries under "Go". Rearranging
a pane is not going somewhere. Splitting those out balances the menu:

| Verb | Key | ~Entries | Holds | Noun tier |
| --- | --- | --- | --- | --- |
| Go | `g` | 20 | select/switch/choose/last/next/prev, next-agent | yes |
| Open | `o` | 18 | lazygit, yazi, btop, lazydocker, palette, goto, ssh, gen, sidebar, extrakto | yes |
| Move | `m` | 16 | resize, swap, break, rotate, join, layouts | yes |
| Set | `s` | 10 | Theme…, options, reload, plugins | no |
| Copy | `c` | 7 | copy-mode, buffers, paste, capture | no |
| New | `n` | 4 | window, session, splits | no |
| Ask | `a` | 4 | run, rename, vault session | no |
| Show | `i` | 4 | time, messages, keys | no |
| Kill | `k` | 2 | pane, window, session | no |

Plus `+Agents` as the noun exception.

### Reconciling the counts

The verb column above sums to 85, not 110, and the difference is not lost
commands:

| | |
| --- | --- |
| Leaf entries in `config.yaml` | 110 |
| less separators (blank `name`) | −13 |
| **Real commands** | **97** |
| less `+Theme`, collapsed to one `Theme…` | −9, +1 |
| **Target after restructure** | **89** |

97 is the same figure `CLAUDE.md` already quotes for the palette, which is the
independent check that the parse is right. The verb table's 85 plus `+Agents`
(~5) lands on that 89; the "~entries" figures are approximate only because a
handful of commands could defensibly sit under two verbs.

`prefix + m` must keep opening the menu —
the ShellFish snippet sends `^A m` — which it does; `m` for Move lives *inside*
the menu's own key table, a different namespace.

## Architecture

### What reads what

```
config.yaml  ──┬──>  tmux-which-key  ──>  init.tmux  ──>  prefix + ? / m
               └──>  bin/tmux-cmd    ──>  fzf         ──>  prefix + p

live server  ──────>  bin/tmux-keys   (unaffected)
```

### The glyph lookup

`class_for()`'s pattern list is replaced by a verb→glyph table:

```
Go → navigate   Open → tool       Move → navigate
Set → config    Copy → clipboard  New  → create
Ask → prompt    Show → info       Kill → destructive
```

The existing glyph constants are kept; only the way a row selects one changes.
This also fixes a live misclassification: resize and swap currently draw the
*navigate* glyph because of the heuristic, and will draw it because they are
declared under Move — right answer, honest reason.

### Favourites and dedupe

```
p  palette      G  lazygit      B  btop         W  sidebar
u  goto         e  yazi         D  lazydocker   ~  next agent
S  ssh          g  ask Claude
```

These appear twice in the file: once in the favourites row, once inside their
verb. Correct for the menu, wrong for the palette — 110 rows would become ~120
with duplicates. `flatten_menu` therefore dedupes by command string, preferring
the verb path so the glyph and section stay right.

Unadvertised but still bound: `|` `-` splits, `Space` last-window, `r` reload,
`Escape` dismiss-overlay, `b` break-pane, `s` choose-tree, `V` vault session,
`C-a`, and every plugin default. They appear inside their verb with no key
column.

### bin/tmux-theme-pick

A fifth member of the picker family, built like the four that exist:
`bin/lib/tmux-theme.sh` for fzf's own chrome, `bin/lib/tmux-frecency.sh` for
most-used-first ranking, `tmarchy-theme list` for rows, `tmarchy-theme set` on
Enter.

It adds one thing the others do not: a **preview pane showing the theme's
swatch** — `bg`/`fg`/`accent`/`wait`/`busy`/`done` as colour blocks — which is
the entire reason to pick a theme from a list rather than a menu. The swatch is
read from `tmarchy/themes/<name>.conf` directly, not from live tmux options, so
it works with no server running, exactly as `tmarchy-theme sync` does.

**Applies on Enter only, never on cursor-move.** Live preview on scroll would
repaint the bar nine times while browsing.

Jewel's `colourNNN` values must go through `fzf_colour`, not be emitted raw —
one unparseable value makes fzf reject the *entire* `--color` argument.

## Failure behaviour

- A malformed `config.yaml` breaks both consumers at once, since they share it.
  `tmux-cmd --doctor` already reports per-stage row counts; it must keep working
  when the verb lookup finds nothing.
- An entry outside any verb still gets a glyph, via the retained heuristic
  fallback. No row renders glyphless.
- `tmux-theme-pick` on a host with no themes directory reports it rather than
  opening an empty picker, matching `tmux-ssh --doctor`'s behaviour.
- Two YAML traps already documented in `CLAUDE.md` still apply and will bite a
  regenerated file exactly as they bit the first one: an unquoted scalar makes
  ` #{...}` a comment and silently truncates the command, and generated menu
  strings are single-quoted so a `'%1'` inside a command closes the string.

## Testing

- **`bin/tmux-cmd --doctor`** must report **89** commands after the restructure,
  against 97 today: −9 collapsed theme entries, +1 `Theme…`, and the favourites
  deduped. A verb-first file that quietly loses commands is the main regression
  risk, and an exact expected number is the check that catches it — "roughly the
  same" would not.
- **Every command string in the old file must survive into the new one.** A
  set-difference over command strings, run once during implementation — the
  restructure moves 110 entries by hand and dropping one would be invisible.
- **Dedupe is asserted, not assumed**: a favourite must appear once in the
  palette and twice in the file.
- **Every verb must resolve to a glyph**, and the fallback must fire for an
  entry deliberately placed outside a verb. Sabotage each to confirm the
  assertions are not vacuous — the `tmarchy-selftest` "defines every colour"
  check was vacuous for months for want of exactly this.
- **`tmux-theme-pick` selftest**: lists nine themes, swatch renders for both
  `#rrggbb` and jewel's `colourNNN`, Enter applies and persists, cursor-move
  does not.
- The which-key menu must still open on **both** `prefix + ?` and `prefix + m`,
  the latter being what ShellFish sends.

## Rollback

`config.yaml` is versioned, and the plugin regenerates `init.tmux` from it on
every load, so `git checkout` of that one file plus `prefix + r` restores the
old menu completely. `bin/tmux-cmd` and the new picker revert independently.
Because nothing is unbound, a rollback of the menu alone leaves every direct
key working — the two halves are separable.

## Documentation impact

- `CLAUDE.md`: the which-key bullet, the `tmux-cmd` bullet (the `class_for`
  description is now wrong), and the scripts list gain `tmux-theme-pick`.
- `tmarchy/README.md`: the `+Theme` submenu no longer lists nine themes, so
  "how to add a theme" loses its menu-entry step — adding a theme becomes
  dropping a `.conf` in and nothing else.
