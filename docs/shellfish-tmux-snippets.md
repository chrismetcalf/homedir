# ShellFish tmux snippets

Recreate these tmux shortcuts as **Secure ShellFish** (iOS/iPadOS) snippets, so
the prefix chords are one tap on a phone.

## Import (fast path)

ShellFish snippets round-trip as JSON: a `/* … */` header then an object keyed by
UUID, each with `description`, optional `keyboardLabel`, and a `body` where the
tmux prefix (Ctrl-A) is `\u0001`. Import the ready-made file:

**[`shellfish-tmux-snippets.json`](./shellfish-tmux-snippets.json)** — open it in
ShellFish (Files → the file → share to Secure ShellFish, or via ShellFish's own
file browser) and it loads all the snippets below. (A copy is also dropped in
`/opt/otto/attachments/` so it's reachable from the phone.)

The table below is the human-readable source for that file. To add one **by hand**
instead: long-press the keyboard bar → New Snippet, set the Name and enter the
Sequence (insert the Ctrl-A control code via the `^` key, shown as `^A`, then the
key — e.g. zoom is `^A` then `z`).

1. In a ShellFish terminal, **long-press the keyboard bar** (or ⌘S with a
   hardware keyboard) → **New Snippet**.
2. Give it the **Name** from the table.
3. In the body, enter the **Sequence**. The prefix is `Ctrl-A`, which the editor
   shows as `^A`: insert the Ctrl-A control code (via the `^` key on the keyboard
   bar), then type the following character(s). E.g. "Zoom pane" is `^A` then `z`.
4. Optionally assign it to a keyboard-bar key or a `#tag` group (e.g. `#tmux`).

`^A` = the single Ctrl-A control byte (0x01), **not** the two characters caret-A.

## Start here: the tappable menu

Add **this one first** — it makes the rest optional. `^A m` opens an on-screen
menu you **tap** (mouse mode is on), centred on screen. It's the tmux-which-key
menu: the top level covers the common actions, and rows starting with `+` open a
submenu (`+Agents`, `+Panes`, `+Windows`, …), so everything tmux can do is
reachable by tapping — no chords. `^A ?` opens the same menu from a keyboard.

| Name | Sequence | Does |
|------|----------|------|
| tmux menu | `^A` `m` | Tappable popup — every binding, nested by category |

## Pane focus (what you asked for)

| Name | Sequence | Does |
|------|----------|------|
| Zoom pane (fullscreen toggle) | `^A` `z` | Blow the current split up to fill the window; repeat to restore |
| Break pane → window | `^A` `b` | Move the current split out into its own full window |
| Pane numbers | `^A` `q` | Overlay pane numbers — tap/type one to jump |
| Pane/window picker (fzf) | `^A` `F` | Fuzzy, selectable list of panes/windows/sessions (tmux-fzf) |
| Choose tree | `^A` `s` | Sessions → windows → panes tree, selectable |
| Cycle to next pane | `^A` `^A` | Ctrl-A twice |

## Splits & windows

| Name | Sequence | Does |
|------|----------|------|
| Split right | `^A` `\|` | New pane to the right |
| Split below | `^A` `-` | New pane below |
| New window | `^A` `c` | |
| Next window | `^A` `n` | |
| Previous window | `^A` `p` | |
| Last window | `^A` `Space` | Toggle to the previously-active window |
| Rename window | `^A` `,` | |
| Kill pane | `^A` `x` | (confirms) |
| Kill window | `^A` `&` | (confirms) |
| Detach | `^A` `d` | Leave the session running |

## Copy / scroll / grab

| Name | Sequence | Does |
|------|----------|------|
| Scroll / copy mode | `^A` `[` | Enter scrollback; drag to select (OSC-52 copies to iOS) |
| Paste buffer | `^A` `]` | |
| Grab text (extrakto) | `^A` `Tab` | Fuzzy-pick URLs/paths/words off the screen |

## Claude / workflow

| Name | Sequence | Does |
|------|----------|------|
| Next agent awaiting input | `^A` `~` | Jump to the next Claude pane that needs you (tmux-scout) |
| Agent session picker | `` ^A `` `` ` `` | tmux-scout session picker |
| Vault console | `^A` `V` | Prompt for a name, open Claude in the Obsidian vault |

## Admin

| Name | Sequence | Does |
|------|----------|------|
| Reload tmux config | `^A` `r` | |
| Install tmux plugins | `^A` `I` | tpm (run on a new host) |

---

Bindings live in [`.tmux.conf`](../.tmux.conf); the `m` menu and `b` break-pane
keys were added specifically for mobile use. `m` used to open a hand-rolled
`display-menu`; it now points at tmux-which-key's root menu, whose contents come
from [`.config/tmux/plugins/tmux-which-key/config.yaml`](../.config/tmux/plugins/tmux-which-key/config.yaml).
The snippet itself is unchanged — it still just sends `^A m`.
