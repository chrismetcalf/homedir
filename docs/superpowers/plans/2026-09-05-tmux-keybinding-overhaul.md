# tmux Keybinding Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Regroup the tmux which-key menu by verb (what you want to do) instead of by tmux noun (what it acts on), without rebinding a single key.

**Architecture:** One file, `.config/tmux/plugins/tmux-which-key/config.yaml`, feeds two consumers — the which-key menu and `bin/tmux-cmd`'s palette. Rewriting it into nine verbs makes a row's *verb* equal the first segment of its menu path, which lets `tmux-cmd` read a declared verb instead of guessing one from command text. The three consumer-side changes (glyph lookup, dedupe, theme picker) land first so the new config has something correct to land into.

**Tech Stack:** bash, tmux 3.5a, PyYAML (vendored inside the tmux-which-key plugin), fzf.

**Spec:** `docs/superpowers/specs/2026-09-05-tmux-keybinding-overhaul-design.md` (commit `7bbf44f`)

## Global Constraints

- **Nothing is unbound.** No `unbind` anywhere. Demoted keys keep working and merely stop being advertised. A plugin key unbound here would also have to be re-unbound after `prefix + I` reinstalls the plugin.
- **`prefix + m` must keep opening the menu.** The ShellFish snippet sends `^A m`. `prefix + ?` must keep working too.
- **bash 3.2.** This repo deploys to macOS. No associative arrays, no `mapfile`, no `${var,,}`, no `readlink -f` in new code paths that macOS runs.
- **Two YAML traps.** An unquoted scalar makes ` #{...}` a comment and silently truncates the command; generated menu strings are single-quoted, so a `'%1'` inside a command closes the string. Use `{ }` command blocks or double quotes.
- **jewel is `colourNNN`, not hex.** Any colour reaching fzf goes through `fzf_colour`; one unparseable value makes fzf reject the *entire* `--color` argument.
- **Exact acceptance number: `tmux-cmd --doctor` reports 89 `collect_rows` rows** (97 today, −9 collapsed theme entries, +1 `Theme…`, favourites deduped).
- **Verb list, fixed:** `Go Open Move Set Copy New Ask Show Kill`, plus `Agents` as the documented noun exception.
- Test harness convention: `bin/*-selftest`, sourcing the tool with `TMUX_<TOOL>_LIB=1`, `assert_eq "name" expected actual`.

---

### Task 1: Glyph from the declared verb

`class_for()` pattern-matches command text to pick a palette glyph. It gets `resize` and `swap` wrong — both match the `navigate` arm — which is also why a naive verb split looked like it would put 36 entries under "Go". Replace it with a lookup on the row's declared verb, keeping the heuristic as the fallback for rows outside any verb (the favourites row).

**Files:**
- Modify: `bin/tmux-cmd` (glyph table after `GLYPH_PATH`; call site in `rows_from_flat`)
- Test: `bin/tmux-cmd-selftest`

**Interfaces:**
- Consumes: `GLYPH_*` constants, `class_for()`, `glyph_for()` — all already in `bin/tmux-cmd`.
- Produces: `glyph_for_verb <trail> <cmds>` → one glyph character. `<trail>` is the space-joined menu path minus the leaf, exactly as `flatten_menu` emits it in field 3.

- [ ] **Step 1: Write the failing test**

Append to `bin/tmux-cmd-selftest`, before the final summary block:

```bash
echo "glyph by declared verb"
assert_eq "Go uses the navigate glyph"      "$GLYPH_NAVIGATE"    "$(glyph_for_verb "Go Window" "selectw -t 1")"
assert_eq "Open uses the tool glyph"        "$GLYPH_TOOL"        "$(glyph_for_verb "Open" "display-popup -E lazygit")"
assert_eq "Move uses the navigate glyph"    "$GLYPH_NAVIGATE"    "$(glyph_for_verb "Move Resize" "resizep -L 5")"
assert_eq "Kill uses the destructive glyph" "$GLYPH_DESTRUCTIVE" "$(glyph_for_verb "Kill" "killp")"
assert_eq "Set uses the config glyph"       "$GLYPH_CONFIG"      "$(glyph_for_verb "Set" "source-file ~/.tmux.conf")"
assert_eq "Agents uses the tool glyph"      "$GLYPH_TOOL"        "$(glyph_for_verb "Agents" "run-shell -b tmux-scout-next-wait")"
# The verb wins over the command text. This is the misclassification being
# fixed: class_for sends `swapp` to navigate no matter which menu it sits in.
assert_eq "declared verb beats command text" "$GLYPH_NAVIGATE" "$(glyph_for_verb "Move" "swapp -D")"
# Fallback: the favourites row has no menu path, so the heuristic still runs.
assert_eq "empty trail falls back to class_for" "$(glyph_for "killp")" "$(glyph_for_verb "" "killp")"
assert_eq "unknown verb falls back to class_for" "$(glyph_for "killp")" "$(glyph_for_verb "Nonsense" "killp")"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bin/tmux-cmd-selftest 2>&1 | grep -c FAIL`
Expected: non-zero, with `glyph_for_verb: command not found` on stderr.

- [ ] **Step 3: Write minimal implementation**

In `bin/tmux-cmd`, immediately after the `GLYPH_PATH='›'` line:

```bash
# Glyph by DECLARED verb — the first segment of the row's menu path.
#
# This replaces guessing from command text. The heuristic below got `resizep`
# and `swapp` wrong, filing both under navigate because that arm matches their
# names; under a verb-first menu they are declared Move and the glyph follows
# the declaration. Space-separated pairs rather than an associative array:
# this repo still targets bash 3.2 for macOS.
VERB_GLYPHS="Go:$GLYPH_NAVIGATE Open:$GLYPH_TOOL Move:$GLYPH_NAVIGATE Set:$GLYPH_CONFIG Copy:$GLYPH_CLIPBOARD New:$GLYPH_CREATE Ask:$GLYPH_PROMPT Show:$GLYPH_INFO Kill:$GLYPH_DESTRUCTIVE Agents:$GLYPH_TOOL"

glyph_for_verb() {
    local trail="${1:-}" cmds="${2:-}" verb pair
    verb=${trail%% *}
    if [ -n "$verb" ]; then
        for pair in $VERB_GLYPHS; do
            if [ "${pair%%:*}" = "$verb" ]; then
                printf '%s' "${pair#*:}"
                return 0
            fi
        done
    fi
    # No verb, or one not in the table: the favourites row sits outside every
    # verb and still has to render something. class_for stays for exactly this.
    glyph_for "$cmds"
}
```

Then change the single call site in `rows_from_flat` from:

```bash
            "$C_ACCENT" "$(glyph_for "$cmds")" "${C_ACCENT:+$C_RESET}" \
```

to:

```bash
            "$C_ACCENT" "$(glyph_for_verb "$trail" "$cmds")" "${C_ACCENT:+$C_RESET}" \
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bin/tmux-cmd-selftest`
Expected: all `ok`, no `FAIL`.

- [ ] **Step 5: Verify the fix is real, on live data**

Run: `bin/tmux-cmd --doctor`
Expected: `collect_rows` still reports **97**. This task must not change the row count — only glyphs.

- [ ] **Step 6: Prove the fallback assertion is not vacuous**

Temporarily change `glyph_for_verb`'s fallback from `glyph_for "$cmds"` to
`printf '%s' "$GLYPH_CMD"`, run `bin/tmux-cmd-selftest`, and confirm the two
fallback assertions FAIL. Restore. The `tmarchy-selftest` "defines every colour"
check passed for months while asserting nothing; confirm rather than assume.

- [ ] **Step 7: Commit**

```bash
git add bin/tmux-cmd bin/tmux-cmd-selftest
git commit -m "tmux-cmd: glyph from the declared verb, not from command text"
```

---

### Task 2: Dedupe favourites in the palette

The new config repeats ten commands: once in the favourites row, once inside their verb. The menu wants both. The palette wants one — otherwise 89 rows become 99. Dedupe by command string, preferring the copy that has a menu path so the glyph and section are right, but keeping the advertised key from whichever copy carries one.

**Files:**
- Modify: `bin/tmux-cmd` (the embedded python in `flatten_menu`)
- Test: `bin/tmux-cmd-selftest`

**Interfaces:**
- Consumes: `flatten_menu <yaml-text>` → lines of `cmds \t key \t trail \t leaf`.
- Produces: same shape, with at most one line per distinct `cmds`.

- [ ] **Step 1: Write the failing test**

Append to `bin/tmux-cmd-selftest`:

```bash
echo "favourites dedupe"
DEDUPE_YAML='items:
  - name: lazygit
    key: G
    command: display-popup -E lazygit
  - name: +Open
    key: o
    menu:
      - name: lazygit
        command: display-popup -E lazygit
      - name: yazi
        key: e
        command: display-popup -E yazi'

DEDUPE_OUT=$(flatten_menu "$DEDUPE_YAML")
assert_eq "duplicate command yields one row" "1" \
    "$(printf '%s\n' "$DEDUPE_OUT" | grep -c 'display-popup -E lazygit')"
assert_eq "surviving row keeps the verb path" "Open" \
    "$(printf '%s\n' "$DEDUPE_OUT" | grep 'lazygit' | cut -f3)"
assert_eq "surviving row keeps the advertised key" "G" \
    "$(printf '%s\n' "$DEDUPE_OUT" | grep 'lazygit' | cut -f2)"
assert_eq "non-duplicate rows are untouched" "1" \
    "$(printf '%s\n' "$DEDUPE_OUT" | grep -c 'display-popup -E yazi')"
assert_eq "total rows after dedupe" "2" "$(printf '%s\n' "$DEDUPE_OUT" | grep -c .)"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bin/tmux-cmd-selftest 2>&1 | grep -A2 'duplicate command'`
Expected: FAIL, `expected: 1  actual: 2`.

- [ ] **Step 3: Write minimal implementation**

In `bin/tmux-cmd`, inside `flatten_menu`'s python, replace the final three lines:

```python
out = []
emit(doc.get("items"), macros, [], out)
print("\n".join(out))
```

with:

```python
out = []
emit(doc.get("items"), macros, [], out)

# Dedupe by command string.
#
# The favourites row repeats ten commands that also live inside a verb. The
# menu wants both copies -- one is a shortcut strip, the other is where the
# command actually belongs. The palette wants one, or the row count inflates by
# exactly the size of the favourites row.
#
# Merge rather than pick: the trail comes from the copy inside a verb, so the
# glyph and section are right, while the key comes from whichever copy is
# advertised, so the shortcut is still shown.
best = {}
order = []
for cmds, key, trail, leaf in out:
    if cmds not in best:
        best[cmds] = [cmds, key, trail, leaf]
        order.append(cmds)
        continue
    prev = best[cmds]
    if trail and not prev[2]:
        prev[2], prev[3] = trail, leaf
    if key and not prev[1]:
        prev[1] = key
print("\n".join("\t".join(best[c]) for c in order))
```

And change `emit`'s append from:

```python
        out.append("\t".join([SEP.join(cmds), key, " ".join(pretty[:-1]), pretty[-1]]))
```

to:

```python
        out.append((SEP.join(cmds), key, " ".join(pretty[:-1]), pretty[-1]))
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bin/tmux-cmd-selftest`
Expected: all `ok`.

- [ ] **Step 5: Verify no change against the current config**

Run: `bin/tmux-cmd --doctor`
Expected: `collect_rows` still **97**. Today's config has no duplicate command strings, so dedupe must be a no-op until Task 4 lands. If this number moved, the current config had duplicates worth investigating before continuing.

- [ ] **Step 6: Commit**

```bash
git add bin/tmux-cmd bin/tmux-cmd-selftest
git commit -m "tmux-cmd: dedupe repeated commands, keeping the verb path and the key"
```

---

### Task 3: bin/tmux-theme-pick

A fifth fzf picker, so `+Theme`'s nine hardcoded menu entries become one `Theme…`. It is the only picker with a preview pane, because seeing the palette is the entire reason to choose a theme from a list.

**Files:**
- Create: `bin/tmux-theme-pick`
- Create: `bin/tmux-theme-pick-selftest`
- Modify: nothing else (the menu entry arrives in Task 4)

**Interfaces:**
- Consumes: `bin/lib/tmux-theme.sh` (`fzf_theme_opts`, `fzf_colour`, `ansi_for`), `bin/lib/tmux-frecency.sh` (`frecency_sort`, `frecency_path`, `frecency_record`), `tmarchy/bin/tmarchy-theme list|set`.
- Produces: `bin/tmux-theme-pick` executable; sourced with `TMUX_THEME_PICK_LIB=1` it defines `collect_rows`, `swatch_for <name>`, `theme_dir`, and does not run `main`.

- [ ] **Step 1: Write the failing test**

Create `bin/tmux-theme-pick-selftest`:

```bash
#!/usr/bin/env bash
# tmux-theme-pick-selftest — fixture-driven tests for bin/tmux-theme-pick.
set -uo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FAILED=0

pass() { printf '  ok   %s\n' "$1"; }
fail() { printf '  FAIL %s\n       expected: %s\n       actual:   %s\n' "$1" "$2" "$3"; FAILED=1; }
assert_eq() { [ "$2" = "$3" ] && pass "$1" || fail "$1" "$2" "$3"; }
assert_contains() {
    case "$3" in *"$2"*) pass "$1" ;; *) fail "$1" "to contain: $2" "$3" ;; esac
}

export TMUX_THEME_PICK_LIB=1
# shellcheck source=/dev/null
. "$DIR/tmux-theme-pick"

echo "tmux-theme-pick selftest"
assert_eq "sourcing does not run main" "" "${TMUX_THEME_PICK_MAIN_RAN:-}"
assert_eq "collect_rows is defined" "function" "$(type -t collect_rows)"
assert_eq "swatch_for is defined"   "function" "$(type -t swatch_for)"

echo "rows"
ROWS="$(collect_rows)"
assert_eq "nine themes are offered" "9" "$(printf '%s\n' "$ROWS" | grep -c .)"
assert_eq "rows are TARGET<TAB>KIND<TAB>DISPLAY" "theme" \
    "$(printf '%s\n' "$ROWS" | head -1 | cut -f2)"
assert_contains "tokyo-night is present" "tokyo-night" "$ROWS"
# Field 1 is the bare theme name: it is what reaches `tmarchy-theme set`, so it
# must never be recovered from display text.
assert_eq "field 1 is a bare theme name" "" \
    "$(printf '%s\n' "$ROWS" | cut -f1 | grep -v '^[a-z][a-z-]*$')"

echo "swatch"
SW="$(swatch_for tokyo-night)"
assert_contains "hex theme swatch carries an SGR escape" $'\033[38;2;' "$SW"
# jewel is the 256-colour theme; a swatch that only understood #rrggbb would
# render it blank, which is the silent-failure shape this repo keeps hitting.
SWJ="$(swatch_for jewel)"
assert_contains "256-colour theme swatch carries an SGR escape" $'\033[38;5;' "$SWJ"
assert_eq "unknown theme yields an empty swatch" "" "$(swatch_for definitely-not-a-theme)"

echo "empty state"
# A host with no themes directory must say so rather than open an empty picker,
# the behaviour tmux-ssh --doctor established.
assert_eq "missing theme dir yields no rows" "" \
    "$(TMARCHY_DIR=/definitely/not/here collect_rows)"

echo "safety"
# Enter applies; moving the cursor must not. If the preview command could apply
# a theme, browsing nine themes would repaint the bar nine times.
assert_eq "preview never calls tmarchy-theme set" "0" \
    "$(grep -c 'tmarchy-theme.*set' <(sed -n '/preview/,/^}/p' "$DIR/tmux-theme-pick"))"

printf '\n'
[ "$FAILED" = 0 ] && { printf 'all passed\n'; exit 0; }
printf 'FAILURES\n'; exit 1
```

Then: `chmod +x bin/tmux-theme-pick-selftest`

- [ ] **Step 2: Run test to verify it fails**

Run: `bin/tmux-theme-pick-selftest`
Expected: fails at the source line — `bin/tmux-theme-pick: No such file or directory`.

- [ ] **Step 3: Write minimal implementation**

Create `bin/tmux-theme-pick`:

```bash
#!/usr/bin/env bash
# tmux-theme-pick — fuzzy-pick a tmarchy theme, with a preview of its palette.
#
# The fifth picker, built like tmux-goto / tmux-ssh / tmux-cmd: rows are
# "TARGET<TAB>KIND<TAB>DISPLAY" with fzf on --with-nth=3.., so the theme name is
# never recovered from display text.
#
# It is the only one with a preview pane, and that is the whole point: a menu of
# nine theme names tells you nothing about what you are choosing. The swatch is
# read from tmarchy/themes/<name>.conf directly rather than from live tmux
# options, so it works with no server running -- the same reason
# `tmarchy-theme sync` parses the file instead of querying tmux.
#
# Applies on Enter ONLY. Applying on cursor-move would repaint the bar nine
# times while browsing.
#
# Sourced with TMUX_THEME_PICK_LIB=1 it defines its functions and exits.
set -uo pipefail

TMUX_THEME_PICK_SELF="${BASH_SOURCE[0]}"
if command -v readlink >/dev/null 2>&1; then
    TMUX_THEME_PICK_SELF="$(readlink -f "${BASH_SOURCE[0]}" 2>/dev/null || printf '%s' "${BASH_SOURCE[0]}")"
fi
TMUX_THEME_PICK_LIBDIR="$(dirname "$TMUX_THEME_PICK_SELF")/lib"
# shellcheck source=lib/tmux-theme.sh
[ -r "$TMUX_THEME_PICK_LIBDIR/tmux-theme.sh" ] && . "$TMUX_THEME_PICK_LIBDIR/tmux-theme.sh"
# shellcheck source=lib/tmux-frecency.sh
[ -r "$TMUX_THEME_PICK_LIBDIR/tmux-frecency.sh" ] && . "$TMUX_THEME_PICK_LIBDIR/tmux-frecency.sh"

GLYPH_THEME='󰏘'

# tmarchy lives beside bin/ in the checkout, not inside it.
theme_dir() {
    printf '%s' "${TMARCHY_DIR:-$(dirname "$TMUX_THEME_PICK_LIBDIR")/../tmarchy}/themes"
}

theme_cmd() {
    printf '%s' "${TMARCHY_THEME_BIN:-$(dirname "$TMUX_THEME_PICK_LIBDIR")/tmarchy-theme}"
}

# One @theme-* value out of a theme .conf.
theme_val() {
    sed -n "s/^set -g @theme-$2  *\"\(.*\)\".*/\1/p" "$1" 2>/dev/null | head -1
}

# Six blocks in the theme's own colours. ansi_for handles both #rrggbb and
# jewel's colourNNN and yields nothing for anything else, so an unparseable
# value costs one block rather than a broken escape sequence.
swatch_for() {
    local name="${1:-}" conf out key val
    conf="$(theme_dir)/$name.conf"
    [ -r "$conf" ] || return 0
    out=""
    for key in bg fg accent wait busy done; do
        val="$(theme_val "$conf" "$key")"
        [ -n "$val" ] || continue
        out="$out$(ansi_for "$val")███$(printf '\033[0m') "
    done
    printf '%s' "$out"
}

collect_rows() {
    local rows conf name
    rows="$(
        for conf in "$(theme_dir)"/*.conf; do
            [ -r "$conf" ] || continue
            name="$(basename "$conf" .conf)"
            printf '%s\ttheme\t%s %s\n' "$name" "$GLYPH_THEME" "$name"
        done
    )"
    [ -n "$rows" ] || return 0
    # frecency_sort may be undefined if bin/lib/ was never linked -- the exact
    # failure that once left tmux-cmd's palette silently empty. Degrade to
    # alphabetical rather than to nothing.
    if type frecency_sort >/dev/null 2>&1; then
        frecency_sort "$rows" "$(frecency_path theme)" frecency_key_theme
    else
        printf '%s\n' "$rows"
    fi
}

frecency_key_theme() { printf '%s' "${1%%	*}"; }

main() {
    TMUX_THEME_PICK_MAIN_RAN=1
    if ! command -v fzf >/dev/null 2>&1; then
        printf 'tmux-theme-pick: fzf is not installed\n' >&2
        exit 1
    fi
    local rows choice
    rows=$(collect_rows)
    if [ -z "$rows" ]; then
        printf '\ntmux-theme-pick: no themes found in %s\n\n' "$(theme_dir)"
        printf '  run:  bin/gitfix\n\n'
        printf 'Press ENTER to close'; read -r _; exit 1
    fi
    # --preview shells back into this script; SELF is absolute via readlink so
    # the preview works regardless of the popup's cwd.
    # shellcheck disable=SC2046  # one token or nothing; see tmux-cmd
    choice=$(printf '%s\n' "$rows" | fzf --ansi --tiebreak=index $(fzf_theme_opts) \
        --delimiter=$'\t' --with-nth=3.. \
        --preview="$TMUX_THEME_PICK_SELF --swatch {1}" --preview-window=down,3 \
        --prompt='theme > ' --height=100% --reverse --no-multi) || exit 0
    local name
    name=${choice%%	*}
    [ -n "$name" ] || exit 0
    type frecency_record >/dev/null 2>&1 && frecency_record "$(frecency_path theme)" "$name"
    "$(theme_cmd)" set "$name"
}

case "${1:-}" in
    --swatch) [ "${TMUX_THEME_PICK_LIB:-}" = "1" ] || { swatch_for "${2:-}"; printf '\n'; exit 0; } ;;
    --doctor) [ "${TMUX_THEME_PICK_LIB:-}" = "1" ] || {
        printf 'tmux-theme-pick doctor\n\n'
        printf '  lib dir        %s\n' "$TMUX_THEME_PICK_LIBDIR"
        printf '  frecency_sort  %s\n' "$(type -t frecency_sort 2>/dev/null || echo MISSING)"
        printf '  theme dir      %s\n' "$(theme_dir)"
        printf '  themes         %s\n' "$(collect_rows | grep -c .)"
        printf '  tmarchy-theme  %s\n' "$(theme_cmd)"
        exit 0; } ;;
esac

[ "${TMUX_THEME_PICK_LIB:-}" = "1" ] || main "$@"
```

Then: `chmod +x bin/tmux-theme-pick`

- [ ] **Step 4: Run test to verify it passes**

Run: `bin/tmux-theme-pick-selftest`
Expected: all `ok`.

- [ ] **Step 5: Verify it works for real**

Run: `bin/tmux-theme-pick --doctor`
Expected: `themes  9`.
Run: `bin/tmux-theme-pick --swatch jewel | cat -v | head -2`
Expected: visible `^[[38;5;` escapes, i.e. the 256-colour path renders.

- [ ] **Step 6: Prove the test is not vacuous**

Break `swatch_for` by replacing `ansi_for "$val"` with `printf ''`, run `bin/tmux-theme-pick-selftest`, confirm the two swatch assertions FAIL, then restore. This repo has shipped a vacuous assertion before (`tmarchy-selftest`'s "defines every colour"); confirm rather than assume.

- [ ] **Step 7: Commit**

```bash
git add bin/tmux-theme-pick bin/tmux-theme-pick-selftest
git commit -m "tmux-theme-pick: a fifth picker, with a swatch preview"
```

---

### Task 4: Rewrite config.yaml into verbs

The core of the overhaul, and the one task where something can be silently lost. The test is written and run *before* the rewrite: it compares the set of command strings in the old file against the new one, so a dropped entry fails loudly instead of quietly.

**Files:**
- Modify: `.config/tmux/plugins/tmux-which-key/config.yaml` (rewritten)
- Create: `bin/tmux-menu-coverage` (the equality check)
- Test: `bin/tmux-menu-selftest` (existing; gains the structural assertions)

**Interfaces:**
- Consumes: `flatten_menu` from `bin/tmux-cmd` (via `TMUX_CMD_LIB=1`), `VERB_GLYPHS` from Task 1, dedupe from Task 2, `bin/tmux-theme-pick` from Task 3.
- Produces: a `config.yaml` whose top level is the favourites row, then `+Go +Open +Move +Set +Copy +New +Ask +Show +Kill +Agents`.

- [ ] **Step 1: Write the coverage check**

Create `bin/tmux-menu-coverage`:

```bash
#!/usr/bin/env bash
# tmux-menu-coverage — every command in the OLD which-key config must still be
# reachable in the new one.
#
# The verb rewrite moves ~97 entries by hand. Dropping one is invisible: the
# menu still opens, the palette still lists things, and the command is simply
# gone. This diffs the two command sets and is the only thing that would notice.
#
#   tmux-menu-coverage <old-ref> [config-path]
#
# <old-ref> is any git ref, e.g. HEAD or the commit before the rewrite.
set -uo pipefail

REF="${1:-HEAD}"
CONFIG="${2:-$HOME/.config/tmux/plugins/tmux-which-key/config.yaml}"
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REL=".config/tmux/plugins/tmux-which-key/config.yaml"

export TMUX_CMD_LIB=1
# shellcheck source=/dev/null
. "$(dirname "${BASH_SOURCE[0]}")/tmux-cmd"

cmds_of() { flatten_menu "$1" | cut -f1 | sort -u; }

old="$(git -C "$REPO" show "$REF:$REL" 2>/dev/null)"
if [ -z "$old" ]; then
    printf 'tmux-menu-coverage: cannot read %s at %s\n' "$REL" "$REF" >&2
    exit 2
fi
new="$(cat "$CONFIG" 2>/dev/null)"

missing="$(comm -23 <(cmds_of "$old") <(cmds_of "$new"))"
added="$(comm -13 <(cmds_of "$old") <(cmds_of "$new"))"

printf 'tmux-menu-coverage  (old=%s)\n\n' "$REF"
printf '  old commands   %s\n' "$(cmds_of "$old" | grep -c .)"
printf '  new commands   %s\n' "$(cmds_of "$new" | grep -c .)"
if [ -n "$missing" ]; then
    printf '\n  MISSING from the new config:\n'
    printf '%s\n' "$missing" | sed 's/^/    /'
fi
if [ -n "$added" ]; then
    printf '\n  added (expected: the theme picker):\n'
    printf '%s\n' "$added" | sed 's/^/    /'
fi
[ -z "$missing" ] || exit 1
printf '\n  no commands lost\n'
```

Then: `chmod +x bin/tmux-menu-coverage`

- [ ] **Step 2: Run it against the unmodified config to prove it is a no-op baseline**

Run: `bin/tmux-menu-coverage HEAD`
Expected: `no commands lost`, with old and new counts equal. If it reports anything missing before the rewrite, the tool is wrong — fix it before touching the config.

- [ ] **Step 3: Commit the check before it can be tuned to pass**

```bash
git add bin/tmux-menu-coverage
git commit -m "tmux-menu-coverage: assert the verb rewrite loses no commands"
```

- [ ] **Step 4: Record the pre-rewrite baseline**

```bash
git rev-parse HEAD > /tmp/menu-baseline-ref
bin/tmux-cmd --doctor | grep collect_rows
```
Expected: `collect_rows   97 rows`. Note the ref; every later check compares against it.

- [ ] **Step 5: Rewrite the config**

Restructure `.config/tmux/plugins/tmux-which-key/config.yaml`:

1. Keep the header comment block, `command_alias_start_index`, `keybindings`, `title`, `position`, `custom_variables` and `macros` **exactly as they are**. Only `items:` is rewritten.
2. `items:` becomes, in order: the ten favourites, a separator, then the ten submenus.

```yaml
items:
  # Favourites. These ten repeat commands that also live inside a verb below --
  # the menu wants both (this is a shortcut strip), the palette wants one, and
  # tmux-cmd dedupes by command string keeping the verb's path and this key.
  - name: Command palette
    key: p
    command: 'display-popup -E -w 70% -h 70% "~/bin/tmux-cmd"'
  - name: Go to session/window/pane
    key: u
    command: 'display-popup -E -w 70% -h 60% "~/bin/tmux-goto"'
  - name: SSH to a host
    key: S
    command: 'display-popup -E -w 60% -h 70% "~/bin/tmux-ssh"'
  - name: Ask Claude for a command
    key: g
    command: 'display-popup -E -w 80% -h 60% "~/bin/tmux-gen"'
  - name: lazygit
    key: G
    command: 'display-popup -E -d "#{pane_current_path}" -w 90% -h 90% "~/bin/tmux-popup lazygit"'
  - name: yazi
    key: e
    command: 'display-popup -E -d "#{pane_current_path}" -w 90% -h 90% "~/bin/tmux-popup yazi"'
  - name: btop
    key: B
    command: 'run-shell -b "~/bin/tmux-dropdown _btop btop"'
  - name: lazydocker
    key: D
    command: 'run-shell -b "~/bin/tmux-dropdown _docker lazydocker"'
  - name: Window sidebar
    key: W
    command: run-shell -b tmux-sidebar-toggle
  - name: Next agent awaiting input
    key: '~'
    command: run-shell -b tmux-scout-next-wait
  - separator: true
```

Then the ten submenus, keyed `g o m s c n a i k` and `A` for Agents.

**The assignment is not left to judgment.** Every leaf in the current file, with
the verb it moves to. Generated from the config at plan time; 88 rows here plus
the one new `Theme…` is the 89 the acceptance check expects. Where a row could
defensibly sit under two verbs the table is the decision — follow it, so the
count is reproducible.

<details>
<summary>Verb assignment for all 88 surviving entries</summary>

| Current path | Entry | Verb | Key |
| --- | --- | --- | --- |
| (top) | Run | **Ask** | `space` |
| (top) | Last window | **Go** | `tab` |
| (top) | Last pane | **Go** | ``` |
| (top) | Go to session/window/pane | **Open** | `u` |
| (top) | Command palette | **Open** | `P` |
| (top) | SSH to a host | **Open** | `S` |
| (top) | Ask Claude for a command | **Open** | `g` |
| Copy | Copy | **Copy** | `c` |
| Copy | List buffers | **Copy** | `#` |
| Agents | Session picker (tmux-scout) | **Agents** | ``` |
| Agents | Next pane awaiting input | **Agents** | `~` |
| Agents | Toggle window sidebar | **Agents** | `W` |
| Agents | New vault session | **Agents** | `V` |
| Tools | Extract text (extrakto) | **Open** | `e` |
| Tools | Fuzzy finder (tmux-fzf) | **Open** | `f` |
| Tools | Toggle pane logging | **Open** | `l` |
| Tools | Save complete history | **Open** | `h` |
| Tools | Screen capture | **Open** | `s` |
| Tools | Clear pane history | **Open** | `C` |
| Tools | Copy pane path | **Copy** | `y` |
| Overlays | btop (dropdown) | **Open** | `B` |
| Overlays | lazydocker (dropdown) | **Open** | `D` |
| Overlays | lazygit (this directory) | **Open** | `G` |
| Overlays | yazi file manager (this directory) | **Open** | `e` |
| Windows | Last | **Go** | `tab` |
| Windows | Choose | **Go** | `w` |
| Windows | Previous | **Go** | `p` |
| Windows | Next | **Go** | `n` |
| Windows | New | **New** | `c` |
| Windows › Layout | Next | **Move** | `l` |
| Windows › Layout | Tiled | **Move** | `t` |
| Windows › Layout | Horizontal | **Move** | `h` |
| Windows › Layout | Vertical | **Move** | `v` |
| Windows › Layout | Horizontal main | **Move** | `H` |
| Windows › Layout | Vertical main | **Move** | `V` |
| Windows | Split horizontal | **New** | `/` |
| Windows | Split vertical | **New** | `-` |
| Windows | Rotate | **Move** | `o` |
| Windows | Rotate reverse | **Move** | `O` |
| Windows | Rename | **Ask** | `R` |
| Windows | Kill | **Kill** | `X` |
| Panes | Last | **Go** | `tab` |
| Panes | Choose | **Go** | `p` |
| Panes | Left | **Go** | `h` |
| Panes | Down | **Go** | `j` |
| Panes | Up | **Go** | `k` |
| Panes | Right | **Go** | `l` |
| Panes | Zoom | **Move** | `z` |
| Panes › Resize | Left | **Move** | `h` |
| Panes › Resize | Down | **Move** | `j` |
| Panes › Resize | Up | **Move** | `k` |
| Panes › Resize | Right | **Move** | `l` |
| Panes › Resize | Left more | **Move** | `H` |
| Panes › Resize | Down more | **Move** | `J` |
| Panes › Resize | Up more | **Move** | `K` |
| Panes › Resize | Right more | **Move** | `L` |
| Panes | Swap left | **Move** | `H` |
| Panes | Swap down | **Move** | `J` |
| Panes | Swap up | **Move** | `K` |
| Panes | Swap right | **Move** | `L` |
| Panes | Break to own window | **Move** | `!` |
| Panes | Mark | **Go** | `m` |
| Panes | Unmark | **Go** | `M` |
| Panes | Capture | **Copy** | `C` |
| Panes | Respawn pane | **Kill** | `R` |
| Panes | Kill | **Kill** | `X` |
| Buffers | Choose | **Copy** | `b` |
| Buffers | List | **Copy** | `l` |
| Buffers | Paste | **Copy** | `p` |
| Sessions | Choose | **Go** | `s` |
| Sessions | New | **New** | `N` |
| Sessions | Rename | **Ask** | `r` |
| Client | Choose | **Go** | `c` |
| Client | Last | **Go** | `l` |
| Client | Previous | **Go** | `p` |
| Client | Next | **Go** | `n` |
| Client | Refresh | **Show** | `R` |
| Client › Plugins | Install | **Set** | `i` |
| Client › Plugins | Update | **Set** | `u` |
| Client › Plugins | Clean | **Set** | `c` |
| Client | Detach | **Go** | `D` |
| Client | Suspend | **Go** | `Z` |
| Client | Reload config | **Set** | `r` |
| Client | Customize | **Set** | `,` |
| (top) | Time | **Show** | `C-t` |
| (top) | Show messages | **Show** | `M` |
| Keys | Custom bindings only | **Open** | `c` |
| Keys | Raw list-keys (everything) | **Show** | `?` |

Counts: Move 22, Go 20, Open 15, Set(theme) 9, Copy 7, Set 5, Agents 4, New 4, Show 4, Ask 3, Kill 3, Go? 1

</details>

Notes on three judgment calls already made in that table:

- `Client › Suspend` (`suspend-client`) goes to **Go**, as the sibling of
  detach — it moves you out of the session rather than changing anything.
- The four agent entries (scout picker, next-wait, sidebar, vault session) go to
  **Agents**, not to Open/Go/Ask. That is the documented noun exception.
- `Move` ends up the largest verb at 22, because `resizep`/`swapp`/`rotatew`
  are numerous and were previously scattered through `+Panes` and `+Windows`.
  It gets the `+Resize` and `+Layout` noun tiers.

The single new entry, under `+Set`:

```yaml
      - name: Theme…
        key: t
        command: 'display-popup -E -w 50% -h 60% "~/bin/tmux-theme-pick"'
```

The nine `tmarchy-theme set <name>` entries are deleted; the picker replaces them.

**Both YAML traps apply.** Every command containing `#{...}` is single-quoted — unquoted, ` #{` is a comment and the command is silently truncated. Any command carrying `%%` uses a `{ }` block rather than a single-quoted string.

- [ ] **Step 6: Run the coverage check**

Run: `bin/tmux-menu-coverage "$(cat /tmp/menu-baseline-ref)"`
Expected: `no commands lost`, with the nine `tmarchy-theme set` commands listed under "added"/"missing" as the only intended difference — the picker command is added, the nine are removed. Any other name under MISSING is a real loss: put it back.

- [ ] **Step 7: Verify the exact acceptance number**

Run: `bin/tmux-cmd --doctor | grep -E 'flatten_menu|rows_from_flat|collect_rows'`
Expected: `collect_rows   89 rows`.

If it reads 99, dedupe is not firing — check that a favourite's command string matches its twin **byte for byte**, since dedupe keys on the exact string. If it reads 97, the theme collapse did not happen.

- [ ] **Step 8: Verify the menu still opens on both keys**

```bash
tmux source-file ~/.tmux.conf
tmux list-keys | grep -cE 'bind-key.*(\?|m).*show-wk-menu-root'
```
Expected: `2`. `prefix + m` is what ShellFish sends; losing it breaks the phone.

- [ ] **Step 9: Verify glyphs now follow the declaration**

Run: `bin/tmux-cmd --doctor >/dev/null && TMUX_CMD_LIB=1 . bin/tmux-cmd && rows_from_flat "$(flatten_menu "$(cat ~/.config/tmux/plugins/tmux-which-key/config.yaml)")" | grep -i resize | head -3`
Expected: rows show the Move section, and the swap/resize entries carry the navigate glyph by declaration rather than by heuristic.

- [ ] **Step 10: Add the structural assertions to bin/tmux-menu-selftest**

Append:

```bash
echo "verb structure"
MENU_CFG="$HOME/.config/tmux/plugins/tmux-which-key/config.yaml"
for verb in Go Open Move Set Copy New Ask Show Kill Agents; do
    assert_eq "+$verb exists" "1" "$(grep -c "name: +$verb\$" "$MENU_CFG")"
done
assert_eq "no tmarchy-theme set entries remain" "0" "$(grep -c 'tmarchy-theme.*set ' "$MENU_CFG")"
assert_eq "the theme picker is referenced" "1" "$(grep -c 'tmux-theme-pick' "$MENU_CFG")"
# Every command containing a #{...} format must be quoted, or YAML treats the
# space-hash as a comment and truncates it.
assert_eq "no unquoted #{ } formats" "0" \
    "$(grep -E '^\s+command: [^'"'"'"]*#\{' "$MENU_CFG" | grep -c .)"
```

- [ ] **Step 11: Run the full suite**

```bash
bin/tmux-menu-selftest && bin/tmux-cmd-selftest && bin/tmux-theme-pick-selftest && bin/homedir-doctor | tail -1
```
Expected: all pass; doctor unchanged from before the task.

- [ ] **Step 12: Commit**

```bash
git add .config/tmux/plugins/tmux-which-key/config.yaml bin/tmux-menu-selftest
git commit -m "tmux: regroup the which-key menu by verb"
```

---

### Task 5: Documentation

Three documented facts are now wrong, and one instruction gets shorter.

**Files:**
- Modify: `CLAUDE.md` (which-key bullet, `tmux-cmd` bullet, scripts list)
- Modify: `tmarchy/README.md` ("How to add a theme")

- [ ] **Step 1: Update the `tmux-cmd` bullet in CLAUDE.md**

The sentence describing classification is now false. Replace the clause about a glyph "classified from the tmux verb (`class_for`)" with: the glyph comes from the **declared** verb — the first segment of the row's menu path — and `class_for` survives only as the fallback for the favourites row, which sits outside every verb. Record that the old heuristic filed `resize` and `swap` under *navigate* by matching their command text, and that this is why the palette drew the wrong glyph for both.

Update the command count from **97** to **89**, and say why: nine theme entries collapsed into one picker, and the ten favourites are deduped.

- [ ] **Step 2: Update the which-key bullet in CLAUDE.md**

Record that the menu is grouped by verb, list the nine plus the `+Agents` exception and why it exists (the one domain grouping rather than a tmux noun), and state the invariant that **nothing was unbound** — demoted keys still work and merely stopped being advertised, which is what makes a menu rollback safe on its own.

- [ ] **Step 3: Add `tmux-theme-pick` to the scripts list in CLAUDE.md**

Note that it is the only picker with a preview, that the swatch is read from the `.conf` rather than live tmux options so it works with no server running, and that it applies on Enter only — cursor-move would repaint the bar once per row.

- [ ] **Step 4: Shorten "How to add a theme" in tmarchy/README.md**

The instruction to add a `+Theme` menu entry is now wrong: adding a theme is dropping a `.conf` into `themes/` and nothing else, because the picker globs the directory. Delete the menu-entry step and say so.

- [ ] **Step 5: Verify the docs match reality**

```bash
grep -n '97 commands' CLAUDE.md; echo "expect: no output"
bin/tmux-cmd --doctor | grep collect_rows; echo "expect: 89"
grep -n 'tmux-theme-pick' CLAUDE.md | head -2; echo "expect: present"
```

- [ ] **Step 6: Commit**

```bash
git add CLAUDE.md tmarchy/README.md
git commit -m "docs: the menu is verb-first, and the palette reads a declared verb"
```

---

## Rollback

`config.yaml` is versioned and the plugin regenerates `init.tmux` from it on every load, so `git checkout <ref> -- .config/tmux/plugins/tmux-which-key/config.yaml && tmux source-file ~/.tmux.conf` restores the old menu completely. Because nothing was unbound, rolling back the menu alone leaves every direct key working — the two halves are separable, which is the main reason the demotion decision was "unadvertised" rather than "unbound".

`bin/tmux-cmd` and `bin/tmux-theme-pick` revert independently. Reverting Task 1 or 2 while keeping the new config leaves the palette working with heuristic glyphs and duplicate favourites — degraded, not broken.
