# Changed-files sidebar + `@file` picker — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a recency-ordered `CHANGED` files section to the `prefix + W` tmux sidebar, and a `prefix + f` fzf picker that inserts `@<path>` references at the Claude prompt.

**Architecture:** Two independent deliverables sharing this repo's picker conventions. The picker (`bin/tmux-files`) is a new script built the way `tmux-goto` is — pure functions sourceable in library mode, a thin `main` that talks to tmux and fzf. The sidebar (`bin/tmux-window-sidebar`) gains a second section, moves off hardcoded 256-colour indices onto `bin/lib/tmux-theme.sh`, and splits its git refresh off the 1 s render loop onto a 3 s active-window-only timer.

**Tech Stack:** bash 3.2 (macOS `/bin/bash` — no associative arrays), tmux, fzf, ripgrep, git. Shared libs `bin/lib/tmux-theme.sh` and `bin/lib/tmux-frecency.sh`.

**Spec:** `docs/superpowers/specs/2026-09-29-changed-files-design.md`

## Global Constraints

- **bash 3.2 compatible.** macOS `/bin/bash` is 3.2 — no `declare -A`, no `${var^^}`. Parallel indexed arrays, as `bin/lib/tmux-theme.sh` already does.
- **`--ignore-submodules` on every `git status` call.** Measured: 305 ms without, 32 ms with, in this nine-submodule repo. Non-negotiable; pinned by a test.
- **No fork inside the render loop.** No `date`, no `stat` per file, no subshell per row. Age comes from bash's `SECONDS`; one `stat` call covers every path.
- **`@theme-wait` is reserved.** Red means "an agent needs you". Not for deletions, not for old files, not for anything in this feature.
- **Every insertion goes through the control-byte gate and `send-keys -l --`.** Verbatim from `bin/tmux-gen`. `-R` silently resets a pane's terminal.
- **Selftest convention:** `pass`/`fail`/`assert_eq` helpers, `<TOOL>_LIB=1` to source without running `main`, exit 1 if anything failed. Copy the header of `bin/tmux-goto-selftest`.
- **Every assertion is sabotage-verified.** Break the implementation, confirm *exactly* the intended assertion fails, restore. A test that passes against broken code is worse than no test.

---

### Task 1: `to_ref` and the safety gate

The pure path→reference logic. No tmux, no fzf, no filesystem.

**Files:**
- Create: `bin/tmux-files`
- Create: `bin/tmux-files-selftest`

**Interfaces:**
- Consumes: nothing
- Produces: `to_ref <abspath> <cwd>` → reference text on stdout. `safe_ref <string>` → exit 0 if safe to insert, 1 otherwise. `build_insert <cwd>` → reads newline-separated absolute paths on stdin, writes the full insert string (`@a @b ` with one trailing space).

- [ ] **Step 1: Write the failing test**

Create `bin/tmux-files-selftest`:

```bash
#!/usr/bin/env bash
# tmux-files-selftest — fixture-driven tests for bin/tmux-files.
set -uo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FAILED=0

pass() { printf '  ok   %s\n' "$1"; }
fail() { printf '  FAIL %s\n       expected: %s\n       actual:   %s\n' "$1" "$2" "$3"; FAILED=1; }
assert_eq() { [ "$2" = "$3" ] && pass "$1" || fail "$1" "$2" "$3"; }
assert_ok() { if "${@:2}"; then pass "$1"; else fail "$1" "exit 0" "exit $?"; fi; }
assert_no() { if "${@:2}"; then fail "$1" "non-zero" "exit 0"; else pass "$1"; fi; }

export TMUX_FILES_LIB=1
# shellcheck source=/dev/null
. "$DIR/tmux-files"

echo "tmux-files selftest"

echo "to_ref"
HOME=/Users/x
assert_eq "under cwd is relative"  "bin/g"              "$(to_ref /Users/x/.homedir/bin/g /Users/x/.homedir)"
assert_eq "under HOME is ~-prefixed" "~/other/f"        "$(to_ref /Users/x/other/f /Users/x/.homedir)"
assert_eq "outside HOME is absolute" "/opt/otto/run.sh" "$(to_ref /opt/otto/run.sh /Users/x/.homedir)"
# A sibling directory sharing the cwd's prefix must NOT be treated as inside it.
assert_eq "sibling prefix is not inside" "~/.homedir-old/f" "$(to_ref /Users/x/.homedir-old/f /Users/x/.homedir)"
# An empty cwd would make the pattern "/*", which matches every absolute path.
assert_eq "empty cwd falls through" "~/.homedir/bin/g"  "$(to_ref /Users/x/.homedir/bin/g '')"
assert_eq "trailing slash on cwd"   "bin/g"             "$(to_ref /Users/x/.homedir/bin/g /Users/x/.homedir/)"

echo "safe_ref"
assert_no "rejects newline" safe_ref "$(printf 'a\nb')"
assert_no "rejects CR"      safe_ref "$(printf 'a\rb')"
assert_no "rejects ESC"     safe_ref "$(printf 'a\033b')"
assert_no "rejects empty"   safe_ref ""
assert_ok "accepts a plain path"      safe_ref "bin/tmux-goto"
assert_ok "accepts a leading dash"    safe_ref "-weird-name"
assert_ok "accepts spaces and UTF-8"  safe_ref "my dir/naïve file.md"

echo "build_insert"
assert_eq "joins with one trailing space" "@bin/a @bin/b " \
    "$(printf '/r/bin/a\n/r/bin/b\n' | build_insert /r)"
assert_eq "skips an unsafe path but keeps the rest" "@bin/a " \
    "$(printf '/r/bin/a\n/r/bin/\033b\n' | build_insert /r)"
assert_eq "empty input inserts nothing" "" "$(printf '' | build_insert /r)"

echo
[ "$FAILED" = "0" ] && echo "all passed" || echo "FAILURES"
exit "$FAILED"
```

- [ ] **Step 2: Run it to verify it fails**

```bash
chmod +x bin/tmux-files-selftest && bin/tmux-files-selftest
```

Expected: FAIL — `bin/tmux-files: No such file or directory`, then every assertion errors with `to_ref: command not found`.

- [ ] **Step 3: Write the minimal implementation**

Create `bin/tmux-files`:

```bash
#!/usr/bin/env bash
# tmux-files — fuzzy-pick files and insert them as @<path> references at the
# calling pane's prompt, without running anything.
#
# Bound to `prefix + f`, which takes over tmux's own find-window; `prefix + u`
# (tmux-goto) already lists every window with fuzzy matching, a scout tint and
# frecency order, so find-window had nothing left to do.
#
# Sourceable for tests: TMUX_FILES_LIB=1 defines the functions without running
# main. See bin/tmux-files-selftest.
set -uo pipefail

# Absolute path + the cwd Claude resolves @ against -> the text to insert.
#
# Three branches, in order. The cwd test is first because a path inside the
# session's own directory should read the way you would have typed it.
to_ref() {
    local path="${1:-}" cwd="${2:-}"
    [ -n "$path" ] || return 0
    # Strip a trailing slash so the pattern below cannot double the separator.
    cwd="${cwd%/}"
    # Guarded on non-empty: an empty cwd makes the pattern "/*", which matches
    # every absolute path on the system and would relativise all of them.
    if [ -n "$cwd" ]; then
        case "$path" in
            # The literal / in the pattern is what stops a sibling directory
            # sharing the prefix (.homedir-old vs .homedir) from matching.
            "$cwd"/*) printf '%s' "${path#"$cwd"/}"; return 0 ;;
        esac
    fi
    case "$path" in
        "$HOME"/*) printf '~/%s' "${path#"$HOME"/}" ;;
        *)         printf '%s' "$path" ;;
    esac
}

# Filenames are not trusted input. They come off the filesystem, and this tool's
# entire job is putting them on a shell prompt.
#
# Reject any control byte, not just newline: CR submits a line exactly like
# Enter, and an ESC byte reaches readline's dispatcher, where ESC then C-e
# performs command substitution with no keypress and no visible trace. Same
# gate as bin/tmux-gen, for the same reason.
safe_ref() {
    case "${1-}" in
        "")            return 1 ;;
        *[[:cntrl:]]*) return 1 ;;
        *)             return 0 ;;
    esac
}

# Newline-separated absolute paths on stdin -> the string to insert.
#
# A filename containing a newline cannot survive fzf's default output at all,
# so it is already unreachable here; the gate is for every other control byte
# and for the day this stops reading line-oriented input.
build_insert() {
    local cwd="${1:-}" path ref out=""
    while IFS= read -r path; do
        [ -n "$path" ] || continue
        safe_ref "$path" || continue
        ref=$(to_ref "$path" "$cwd")
        safe_ref "$ref" || continue
        out="${out}@${ref} "
    done
    printf '%s' "$out"
}

[ "${TMUX_FILES_LIB:-}" = "1" ] || main "$@"
```

- [ ] **Step 4: Run it to verify it passes**

```bash
chmod +x bin/tmux-files && bin/tmux-files-selftest
```

Expected: `all passed`, 16 `ok` lines, exit 0. (`main` is undefined but never called in library mode.)

- [ ] **Step 5: Sabotage-verify three assertions**

Each of these must break *exactly* the named assertion and nothing else. Restore after each.

1. Drop the `/` from the cwd pattern (`"$cwd"*`) → only "sibling prefix is not inside" fails.
2. Drop the `[ -n "$cwd" ]` guard → only "empty cwd falls through" fails.
3. Narrow the gate to `*$'\n'*` → "rejects CR" and "rejects ESC" fail, "rejects newline" still passes. That pair is the point: a newline-only guard is the bug this gate exists to prevent.

- [ ] **Step 6: Commit**

```bash
git add bin/tmux-files bin/tmux-files-selftest
git commit -m "tmux-files: path references and the insertion safety gate

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: `file_rows` — candidate enumeration

**Files:**
- Modify: `bin/tmux-files`
- Modify: `bin/tmux-files-selftest`

**Interfaces:**
- Consumes: nothing from Task 1
- Produces: `file_rows <root> [maxdepth]` → newline-separated absolute paths on stdout. Empty output (exit 0) if the root is not a directory.

- [ ] **Step 1: Write the failing test**

Append to `bin/tmux-files-selftest`, before the final summary block:

```bash
echo "file_rows"
FIX=$(mktemp -d)
mkdir -p "$FIX/a/b/c"
touch "$FIX/top.txt" "$FIX/a/one.txt" "$FIX/a/b/two.txt" "$FIX/a/b/c/three.txt"
mkdir -p "$FIX/.git" && touch "$FIX/.git/config"

got=$(file_rows "$FIX" | wc -l | tr -d ' ')
assert_eq "finds every file recursively" "4" "$got"
file_rows "$FIX" | grep -q '\.git/config' \
    && fail "excludes .git" "no .git paths" "found .git/config" || pass "excludes .git"
file_rows "$FIX" | grep -q "^$FIX/top.txt$" \
    && pass "paths are absolute" || fail "paths are absolute" "$FIX/top.txt" "$(file_rows "$FIX" | head -1)"

# The depth cap is what makes the home root usable: ~ has no gitignore and
# ~/Library is unbounded on macOS.
got=$(file_rows "$FIX" 2 | wc -l | tr -d ' ')
assert_eq "depth cap limits the walk" "2" "$got"

assert_eq "a missing root yields nothing" "" "$(file_rows "$FIX/nope")"
rm -rf "$FIX"
```

- [ ] **Step 2: Run it to verify it fails**

```bash
bin/tmux-files-selftest
```

Expected: the five new assertions fail with `file_rows: command not found`; the 16 from Task 1 still pass.

- [ ] **Step 3: Write the minimal implementation**

Add to `bin/tmux-files`, after `build_insert`:

```bash
# Candidate paths under a root, absolute, newline-separated.
#
# rg is gitignore-aware, which is what makes this sharp inside a repo -- a
# node_modules or a build directory never reaches the picker. Home has no
# gitignore and ~/Library is unbounded on macOS, so that root passes a depth
# cap, stated in the picker's header rather than applied silently.
#
# find is the fallback rather than an error: slower and not gitignore-aware,
# but the picker works on a host without rg.
file_rows() {
    local root="${1:-}" depth="${2:-}" args=()
    [ -d "$root" ] || return 0
    if command -v rg >/dev/null 2>&1; then
        args=(--files --hidden --glob '!.git/*')
        [ -n "$depth" ] && args+=(--max-depth "$depth")
        rg "${args[@]}" -- "$root" 2>/dev/null
    else
        # -maxdepth must follow the path and precede the tests.
        args=("$root")
        [ -n "$depth" ] && args+=(-maxdepth "$depth")
        find "${args[@]}" -type f -not -path '*/.git/*' 2>/dev/null
    fi
}
```

- [ ] **Step 4: Run it to verify it passes**

```bash
bin/tmux-files-selftest
```

Expected: `all passed`, 21 `ok` lines.

- [ ] **Step 5: Verify the fallback path is real**

The `find` branch only runs on a host without rg, which is not this one. Force it:

```bash
PATH=/usr/bin:/bin bin/tmux-files-selftest 2>&1 | grep -E 'file_rows|ok   (finds|excludes|paths|depth|a missing)'
```

Expected: the same five assertions pass. If they do not, the `find` branch is broken and would only have been discovered on a fresh host.

- [ ] **Step 6: Commit**

```bash
git add bin/tmux-files bin/tmux-files-selftest
git commit -m "tmux-files: enumerate candidates, rg with a find fallback

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: `main` — the popup, re-rooting, and insertion

**Files:**
- Modify: `bin/tmux-files`
- Modify: `bin/tmux-files-selftest`
- Modify: `.tmux.conf` (near line 221, beside the other picker binds)

**Interfaces:**
- Consumes: `file_rows`, `build_insert`, `to_ref`, `safe_ref` from Tasks 1–2; `fzf_theme_opts` from `bin/lib/tmux-theme.sh`; `frecency_path`/`frecency_record` from `bin/lib/tmux-frecency.sh`
- Produces: `main` (no arguments), the `prefix + f` binding

- [ ] **Step 1: Write the failing test**

Append to `bin/tmux-files-selftest`, before the final summary:

```bash
echo "main wiring"
assert_eq "main is defined" "function" "$(type -t main)"
assert_eq "sourcing does not run main" "" "${TMUX_FILES_MAIN_RAN:-}"

# Regression pins. These guard properties nothing else can observe from
# outside the process -- a `-` path reaching send-keys without `--` parses as
# flags, and -R silently resets the pane's terminal.
grep -q 'send-keys -t "\$pane" -l --' "$DIR/tmux-files" \
    && pass "send-keys uses -l and --" || fail "send-keys uses -l and --" "present" "missing"
grep -q 'ctrl-g:reload' "$DIR/tmux-files" \
    && pass "re-root keys are bound" || fail "re-root keys are bound" "present" "missing"
```

- [ ] **Step 2: Run it to verify it fails**

```bash
bin/tmux-files-selftest
```

Expected: `main is defined` fails with actual `""`, and both greps fail.

- [ ] **Step 3: Write the minimal implementation**

Add the library sourcing at the top of `bin/tmux-files`, directly after `set -uo pipefail`:

```bash
# shellcheck source=lib/tmux-theme.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib/tmux-theme.sh"
# shellcheck source=lib/tmux-frecency.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib/tmux-frecency.sh"
```

Add `main` immediately before the final `[ "${TMUX_FILES_LIB:-}" = "1" ] || main "$@"` line:

```bash
# Rank most-used-first. With an EMPTY query fzf does no scoring at all and
# shows input order, so sorting the input IS the ranking when the popup opens.
frecency_key_files() { printf '%s' "${1:-}"; }

main() {
    local pane cwd root git_root depth rows chosen text err
    # display-message -p inside a popup returns the pane the popup was launched
    # OVER -- a popup is not a pane. So this is the target without any
    # bookkeeping, and it cannot drift the way reading the active pane later
    # would (a popup is an ordinary client and the active pane can move).
    pane=$(tmux display-message -p '#{pane_id}' 2>/dev/null)
    cwd=$(tmux display-message -p -t "$pane" '#{pane_current_path}' 2>/dev/null)
    [ -d "$cwd" ] || cwd="$PWD"
    root="$cwd"
    git_root=$(git -C "$cwd" rev-parse --show-toplevel 2>/dev/null) || git_root="$cwd"

    if ! command -v fzf >/dev/null 2>&1; then
        printf '  fzf is not installed.\n  Install it, or run homedir-install.\n\n  [q] close  '
        IFS= read -r -n1 -s _ </dev/tty 2>/dev/null || true
        exit 1
    fi

    depth=""
    rows=$(file_rows "$root" "$depth")
    rows=$(frecency_sort "$rows" "$(frecency_path files)" frecency_key_files)

    # Re-root from inside the picker rather than choosing a scope up front --
    # the tmux-goto lesson. HOME passes a depth cap because ~ has no gitignore
    # and ~/Library is unbounded on macOS; the header says so rather than
    # quietly returning a short list.
    # shellcheck disable=SC2046  # one token or nothing; see tmux-cmd
    chosen=$(printf '%s\n' "$rows" | fzf --ansi --multi --tiebreak=index $(fzf_theme_opts) \
        --prompt='@file > ' --height=100% --reverse \
        --header="^g git root   ^h home (depth 4)   ^u up   TAB multi   root: $root" \
        --bind "ctrl-g:reload(\"$BASH_SOURCE\" --list '$git_root')+change-header(^g git root   ^h home (depth 4)   ^u up   TAB multi   root: $git_root)" \
        --bind "ctrl-h:reload(\"$BASH_SOURCE\" --list '$HOME' 4)+change-header(^g git root   ^h home (depth 4)   ^u up   TAB multi   root: $HOME)" \
        --bind "ctrl-u:reload(\"$BASH_SOURCE\" --list '$(dirname "$root")')+change-header(^g git root   ^h home (depth 4)   ^u up   TAB multi   root: $(dirname "$root"))"
    ) || exit 0
    [ -n "$chosen" ] || exit 0

    while IFS= read -r p; do
        [ -n "$p" ] && frecency_record "$(frecency_path files)" "$p"
    done <<< "$chosen"

    text=$(printf '%s\n' "$chosen" | build_insert "$cwd")
    [ -n "$text" ] || exit 0

    # `--` matters: a path starting with '-' is otherwise parsed as send-keys
    # flags, and -R silently resets the pane's terminal. `-l` is literal, so
    # tmux does not read tokens as key names.
    if ! err=$(tmux send-keys -t "$pane" -l -- "$text" 2>&1); then
        printf '\n  insert failed: %s\n\n  [q] close  ' "${err:-send-keys exited non-zero}"
        IFS= read -r -n1 -s _ </dev/tty 2>/dev/null || true
        exit 1
    fi
}

# fzf's reload() re-invokes this script for a new root.
if [ "${1:-}" = "--list" ]; then
    file_rows "${2:-}" "${3:-}"
    exit 0
fi
```

Note the `--list` block goes **before** the final `main` dispatch line.

Add to `.tmux.conf` beside the other picker binds (after line 221):

```
# prefix + f: fuzzy-pick files and insert them as @<path> at the prompt.
# Takes over tmux's own find-window, which prefix + u (tmux-goto) already
# subsumes with fuzzy matching, a scout tint and frecency order.
# -d is not optional: without it the popup opens in $HOME no matter which pane
# you pressed the key in, and the picker's whole scope is the pane's directory.
bind f display-popup -E -w 70% -h 70% -d '#{pane_current_path}' "~/bin/tmux-files"
```

- [ ] **Step 4: Run it to verify it passes**

```bash
bin/tmux-files-selftest && bash -n bin/tmux-files && tmux source-file .tmux.conf && tmux list-keys -T prefix f
```

Expected: `all passed` (25 `ok`), no syntax error, and `bind-key -T prefix f display-popup ...`.

- [ ] **Step 5: Drive it once by hand**

Press `prefix + f` in a pane inside this repo. Confirm: the list is scoped to the repo, `^h` re-roots to home and the header updates, `TAB` marks two files, Enter inserts `@bin/x @bin/y ` at the prompt **without running it**, and Escape inserts nothing.

- [ ] **Step 6: Commit**

```bash
git add bin/tmux-files bin/tmux-files-selftest .tmux.conf
git commit -m "tmux-files: the picker, on prefix + f

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Sidebar onto the theme

Pure refactor — no new behaviour, so any visible change other than colour is a bug.

**Files:**
- Modify: `bin/tmux-window-sidebar:15-34` (the palette), `:55` (header), `:82-89` (row painting)

**Interfaces:**
- Consumes: `theme_load`, `ansi_for` from `bin/lib/tmux-theme.sh`
- Produces: nothing new

- [ ] **Step 1: Replace the hardcoded palette**

`bin/tmux-window-sidebar` is the last surface in this repo on hardcoded 203/214/78/245. Source the shared library after the `PANE` guard:

```bash
# shellcheck source=lib/tmux-theme.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib/tmux-theme.sh"
```

Replace `SUBCOL` and `color_for` (lines 18–34) with:

```bash
# The theme is read once per draw, not per row: theme_load caches one
# `tmux show -g` in the calling shell and theme_get scans it with builtins.
# Twelve `tmux show -gv` forks per redraw is what made prefix + u take 2s.
#
# Subagents keep their OWN colour rather than sharing the row's state colour.
# The four state colours already mean specific things, and a window can be in
# any of them WHILE running subagents -- two independent facts, so one colour
# cannot carry both. @theme-info is the secondary data colour, deliberately
# neither a red nor an amber: subagents running is activity, not a problem.
theme_colours() {
    C_WAIT=$(ansi_for "$(theme_get wait)")
    C_BUSY=$(ansi_for "$(theme_get busy)")
    C_DONE=$(ansi_for "$(theme_get done)")
    C_IDLE=$(ansi_for "$(theme_get dim)")
    C_NAME=$(ansi_for "$(theme_get fg)")
    C_HEAD=$(ansi_for "$(theme_get accent)")
    C_SUB=$(ansi_for "$(theme_get info)")
}

color_for() {
    case "$1" in
    wait) printf '%s' "$C_WAIT" ;;
    busy) printf '%s' "$C_BUSY" ;;
    done) printf '%s' "$C_DONE" ;;
    *)    printf '%s' "$C_IDLE" ;;
    esac
}
```

Call `theme_load; theme_colours` at the top of `draw`.

- [ ] **Step 2: Swap the escapes in the row painter**

`color_for` now returns a complete SGR escape, not a bare index, so every `${ESC}[38;5;${col}m` becomes `${col}`. Lines 55, 82, 87 and 89 become:

```bash
	lines+=("${C_HEAD} WINDOWS${RESET}")
```
```bash
		[ -n "$tag" ] && tagpart=" ${C_SUB}${tag}"
```
```bash
			lines+=("${C_HEAD}▌${RESET}${col}${idx} ${nm}${tagpart}${RESET}")
```
```bash
			lines+=(" ${col}${idx}${RESET} ${C_NAME}${nm}${tagpart}${RESET}")
```

The active row's full-width `48;5;236m` highlight becomes a `▌` left rule. It costs two columns of name budget at a 24-column width, and the sidebar needs those for the `CHANGED` section. Remove the `plain`/`pad` computation that padded the highlight — nothing pads now.

- [ ] **Step 3: Verify nothing but colour moved**

```bash
bash -n bin/tmux-window-sidebar && tmux set -g @sidebar on && ~/bin/tmux-sidebar-ensure
```

Expected: the sidebar renders with the same rows in the same order, in theme colours. Then switch theme and confirm it follows:

```bash
tmarchy/bin/tmarchy-theme set gruvbox; sleep 2; tmarchy/bin/tmarchy-theme set tokyo-night
```

Expected: the sidebar repaints in gruvbox within ~1 s, then back. This is the property the whole task buys — nothing else in the repo was checking it.

- [ ] **Step 4: Commit**

```bash
git add bin/tmux-window-sidebar
git commit -m "sidebar: follow the tmarchy theme

The last surface on hardcoded 203/214/78/245, from the powerline era. It
now reads the same @theme-* options everything else does, through the
cached bin/lib/tmux-theme.sh, so a theme switch moves it too.

The active row's full-width highlight becomes a left rule: the bar cost two
columns of name budget at 24 wide, which the CHANGED section needs.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: The changed-files data and row formatting

Pure functions plus the one git call. No rendering yet.

**Files:**
- Modify: `bin/tmux-window-sidebar`
- Create: `bin/tmux-sidebar-selftest`

**Interfaces:**
- Consumes: nothing
- Produces: `parse_status` (stdin porcelain → `state\tpath` lines), `age_str <seconds>`, `trunc_left <string> <width>`, `recency_of <mtime> <now>` → `now`/`recent`/`old`, `changed_rows <lines> <now> <width> <max>` → `recency\trendered` lines, `git_refresh <repo>` → `mtime\tstate\tpath` lines newest-first

- [ ] **Step 1: Write the failing test**

Create `bin/tmux-sidebar-selftest`:

```bash
#!/usr/bin/env bash
# tmux-sidebar-selftest — fixture-driven tests for bin/tmux-window-sidebar.
set -uo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FAILED=0
pass() { printf '  ok   %s\n' "$1"; }
fail() { printf '  FAIL %s\n       expected: %s\n       actual:   %s\n' "$1" "$2" "$3"; FAILED=1; }
assert_eq() { [ "$2" = "$3" ] && pass "$1" || fail "$1" "$2" "$3"; }

export TMUX_SIDEBAR_LIB=1
# shellcheck source=/dev/null
. "$DIR/tmux-window-sidebar"

echo "tmux-window-sidebar selftest"

echo "age_str"
assert_eq "59s"   "59s" "$(age_str 59)"
assert_eq "60s"   "1m"  "$(age_str 60)"
assert_eq "3599s" "59m" "$(age_str 3599)"
assert_eq "3600s" "1h"  "$(age_str 3600)"
assert_eq "86399s" "23h" "$(age_str 86399)"
assert_eq "86400s" "1d"  "$(age_str 86400)"
# Buckets, not rounding: 90s is one minute ago, it has not been touched twice.
assert_eq "90s buckets down" "1m" "$(age_str 90)"

echo "trunc_left"
assert_eq "short path is untouched" "bin/g" "$(trunc_left bin/g 12)"
# The basename is what identifies a file -- the opposite of the window list.
assert_eq "keeps the basename" "…lib/theme.sh" "$(trunc_left bin/lib/theme.sh 13)"
assert_eq "exact fit is untouched" "abcde" "$(trunc_left abcde 5)"

echo "parse_status"
IN=$(printf ' M bin/a\n?? new.txt\n D gone.txt\nA  added.txt\nR  old.txt -> new-name.txt\n')
OUT=$(printf '%s\n' "$IN" | parse_status)
assert_eq "modified" "modified"  "$(printf '%s\n' "$OUT" | grep 'bin/a' | cut -f1)"
assert_eq "untracked" "untracked" "$(printf '%s\n' "$OUT" | grep 'new.txt$' | cut -f1)"
assert_eq "deleted"  "deleted"   "$(printf '%s\n' "$OUT" | grep 'gone.txt' | cut -f1)"
assert_eq "added"    "added"     "$(printf '%s\n' "$OUT" | grep 'added.txt' | cut -f1)"
# A rename reports "old -> new"; the new name is the one that exists on disk.
assert_eq "rename keeps the new name" "new-name.txt" "$(printf '%s\n' "$OUT" | grep 'new-name' | cut -f2)"

echo "recency_of"
assert_eq "just now"  "now"    "$(recency_of 1000 1010)"
assert_eq "this hour" "recent" "$(recency_of 1000 1400)"
assert_eq "older"     "old"    "$(recency_of 1000 90000)"
assert_eq "no mtime is old" "old" "$(recency_of - 1000)"

echo "changed_rows"
NOW=1000000
L=$(printf '%s\t%s\t%s\n' \
    999988 modified bin/a \
    999940 added    bin/b \
    -      deleted  bin/gone)
R=$(changed_rows "$L" "$NOW" 24 10)
assert_eq "one row per file" "3" "$(printf '%s\n' "$R" | wc -l | tr -d ' ')"
printf '%s\n' "$R" | head -1 | cut -f2 | grep -q '●' && pass "modified glyph" || fail "modified glyph" "●" "$(printf '%s\n' "$R" | head -1 | cut -f2)"
printf '%s\n' "$R" | sed -n 2p | cut -f2 | grep -q '+' && pass "added glyph" || fail "added glyph" "+" "$(printf '%s\n' "$R" | sed -n 2p | cut -f2)"
printf '%s\n' "$R" | head -1 | cut -f2 | grep -q '12s' && pass "age is rendered" || fail "age is rendered" "12s" "$(printf '%s\n' "$R" | head -1 | cut -f2)"
# A deleted file has no mtime: stat failed on it. An em dash, never "0s" --
# that would claim the file was touched a moment ago.
printf '%s\n' "$R" | tail -1 | cut -f2 | grep -q '—' && pass "deleted shows no age" || fail "deleted shows no age" "—" "$(printf '%s\n' "$R" | tail -1 | cut -f2)"
assert_eq "max caps the rows" "2" "$(changed_rows "$L" "$NOW" 24 2 | wc -l | tr -d ' ')"
assert_eq "zero max yields nothing" "" "$(changed_rows "$L" "$NOW" 24 0)"

echo "regression pins"
# 305 ms vs 32 ms in this nine-submodule repo. Nothing else would catch its
# removal: the sidebar would still be correct, just a third of a core.
grep -q 'ignore-submodules' "$DIR/tmux-window-sidebar" \
    && pass "git status ignores submodules" || fail "git status ignores submodules" "present" "missing"
# Red means "an agent needs you". Not a deleted file, not an old one.
grep -q 'theme_get wait' "$DIR/tmux-window-sidebar" && ! grep -q 'C_WAIT.*recen\|recen.*C_WAIT' "$DIR/tmux-window-sidebar" \
    && pass "recency never claims @theme-wait" || fail "recency never claims @theme-wait" "no wait in recency" "found"

echo
[ "$FAILED" = "0" ] && echo "all passed" || echo "FAILURES"
exit "$FAILED"
```

- [ ] **Step 2: Run it to verify it fails**

```bash
chmod +x bin/tmux-sidebar-selftest && bin/tmux-sidebar-selftest
```

Expected: every assertion fails — the functions do not exist, and sourcing runs the render loop because there is no library guard yet.

- [ ] **Step 3: Write the minimal implementation**

Add to `bin/tmux-window-sidebar`, after `color_for`:

```bash
# --- changed files -----------------------------------------------------------

# Seconds -> the shortest honest label. Buckets, not rounding: 90s is "1m",
# because a file touched a minute and a half ago was touched once.
age_str() {
    local s="${1:-0}"
    if   [ "$s" -lt 60 ];    then printf '%ds' "$s"
    elif [ "$s" -lt 3600 ];  then printf '%dm' "$((s / 60))"
    elif [ "$s" -lt 86400 ]; then printf '%dh' "$((s / 3600))"
    else                          printf '%dd' "$((s / 86400))"
    fi
}

# Truncate from the LEFT, keeping the basename. The opposite of the window
# list, and deliberately: for a file the basename identifies it, for a window
# the prefix does.
trunc_left() {
    local s="${1:-}" w="${2:-10}"
    [ "$w" -lt 2 ] && w=2
    if [ "${#s}" -le "$w" ]; then printf '%s' "$s"
    else printf '…%s' "${s: -$((w - 1))}"; fi
}

# git status --porcelain on stdin -> "state \t relpath". Pure.
parse_status() {
    local line xy path
    while IFS= read -r line; do
        [ -n "$line" ] || continue
        xy="${line:0:2}"
        path="${line:3}"
        # "R  old -> new": the new name is the one that exists on disk.
        case "$path" in *" -> "*) path="${path#* -> }" ;; esac
        case "$xy" in
            '??') printf 'untracked\t%s\n' "$path" ;;
            *D*)  printf 'deleted\t%s\n'   "$path" ;;
            *A*)  printf 'added\t%s\n'     "$path" ;;
            *)    printf 'modified\t%s\n'  "$path" ;;
        esac
    done
}

# Which colour a row takes. Colour carries RECENCY because that is the
# headline; the glyph carries git state. @theme-wait is not in this set at
# any bucket -- red means "an agent needs you" everywhere else here.
recency_of() {
    local m="${1:-}" now="${2:-0}" d
    { [ -n "$m" ] && [ "$m" != "-" ]; } || { printf 'old'; return 0; }
    d=$((now - m))
    if   [ "$d" -lt 300 ];  then printf 'now'
    elif [ "$d" -lt 3600 ]; then printf 'recent'
    else                         printf 'old'
    fi
}

# "mtime \t state \t path" lines -> "recency \t rendered" lines. Pure, so the
# layout is testable without a repo, a tmux server or a clock.
changed_rows() {
    local lines="${1:-}" now="${2:-0}" w="${3:-24}" max="${4:-0}"
    local mtime state path glyph age name namew pad n=0
    [ "$max" -gt 0 ] || return 0
    [ -n "$lines" ] || return 0
    # gutter(1) + name + gap(1) + age(up to 4)
    namew=$((w - 6)); [ "$namew" -lt 3 ] && namew=3
    while IFS=$'\t' read -r mtime state path; do
        [ -n "$path" ] || continue
        [ "$n" -ge "$max" ] && break
        case "$state" in
            modified)  glyph='●' ;;
            added)     glyph='+' ;;
            untracked) glyph='○' ;;
            deleted)   glyph='−' ;;
            *)         glyph='·' ;;
        esac
        # A deleted path has no mtime -- stat failed on it. An em dash, never
        # "0s", which would claim it had just been touched.
        if [ -n "$mtime" ] && [ "$mtime" != "-" ]; then age=$(age_str "$((now - mtime))")
        else age='—'; fi
        name=$(trunc_left "$path" "$namew")
        pad=$((w - 1 - ${#name} - ${#age}))
        [ "$pad" -lt 1 ] && pad=1
        printf '%s\t%s%s%*s%s\n' "$(recency_of "$mtime" "$now")" \
            "$glyph" "$name" "$pad" '' "$age"
        n=$((n + 1))
    done <<< "$lines"
}

# Repo -> "mtime \t state \t path" lines, newest first.
#
# --ignore-submodules is MANDATORY, not a tuning knob: measured in this repo
# it is 305 ms without and 32 ms with, because there are nine submodules. At
# the sidebar's redraw rate the first number is a third of a core per window,
# which is the 2026-08-21 fork-storm shape. bin/tmux-sidebar-selftest pins it.
#
# ONE stat for every path, never one per file -- a fork per changed file is
# the cost this design exists to avoid. A deleted path makes stat fail, so its
# mtime is "-", which sorts last numerically and renders no age.
git_refresh() {
    local repo="${1:-}" pairs paths
    [ -n "$repo" ] || return 0
    pairs=$(git -C "$repo" status --porcelain --ignore-submodules 2>/dev/null | parse_status)
    [ -n "$pairs" ] || return 0
    while IFS=$'\t' read -r state path; do
        [ -n "$path" ] || continue
        printf '%s\t%s\t%s\n' "$(_mtime "$repo/$path")" "$state" "$path"
    done <<< "$pairs" | sort -t$'\t' -k1,1nr
}

# BSD and GNU stat disagree on every flag. Resolved once, not per call.
if stat -f '%m' . >/dev/null 2>&1; then _STAT_FMT=(-f '%m'); else _STAT_FMT=(-c '%Y'); fi
_mtime() { stat "${_STAT_FMT[@]}" "$1" 2>/dev/null || printf '%s' '-'; }
```

Add the library guard at the very end of the file, wrapping the existing loop:

```bash
if [ "${TMUX_SIDEBAR_LIB:-}" != "1" ]; then
    trap ':' WINCH
    while :; do
        draw
        sleep 1 &
        sp=$!
        wait "$sp" 2>/dev/null
        kill "$sp" 2>/dev/null
    done
fi
```

The `PANE` guard near the top must also not `exit 0` in library mode — change it to:

```bash
PANE="${TMUX_PANE:-}"
[ -n "$PANE" ] || [ "${TMUX_SIDEBAR_LIB:-}" = "1" ] || exit 0
```

- [ ] **Step 4: Run it to verify it passes**

```bash
bin/tmux-sidebar-selftest
```

Expected: `all passed`, 30 `ok` lines.

- [ ] **Step 5: Verify `git_refresh` against the real repo, and time it**

```bash
cd /Users/chris.metcalf/.homedir
TMUX_SIDEBAR_LIB=1 bash -c '. bin/tmux-window-sidebar; git_refresh "$PWD"' | head
time (TMUX_SIDEBAR_LIB=1 bash -c '. bin/tmux-window-sidebar; git_refresh "$PWD"' >/dev/null)
```

Expected: real changed files newest-first, and **under 100 ms**. If it is ~300 ms, `--ignore-submodules` is not reaching the call — that is the whole point of the pin.

- [ ] **Step 6: Sabotage-verify two assertions**

1. Change `age_str`'s `-lt 60` to `-le 60` → only "60s" fails. (If "59s" also fails, the test is testing the wrong boundary.)
2. Make `changed_rows` print `0s` instead of `—` for a missing mtime → only "deleted shows no age" fails.

- [ ] **Step 7: Commit**

```bash
git add bin/tmux-window-sidebar bin/tmux-sidebar-selftest
git commit -m "sidebar: changed-files data and row layout

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Render the section, on a decoupled refresh

**Files:**
- Modify: `bin/tmux-window-sidebar` (`draw`)
- Modify: `bin/tmux-sidebar-selftest`

**Interfaces:**
- Consumes: everything from Task 5
- Produces: `budget <height> <nwindows>` → `"<winrows> <changedrows>"`

- [ ] **Step 1: Write the failing test**

Append to `bin/tmux-sidebar-selftest` before the regression pins:

```bash
echo "budget"
# WINDOWS takes what it NEEDS, up to half the pane -- not half unconditionally.
assert_eq "few windows take few rows" "3" "$(budget 40 3 | cut -d' ' -f1)"
assert_eq "many windows cap at half"  "20" "$(budget 40 30 | cut -d' ' -f1)"
assert_eq "changed gets the remainder" "33" "$(budget 40 3 | cut -d' ' -f2)"
# A heading with nothing under it reads as broken rather than absent, so the
# section goes header and all. This is the screensaver panel's rule.
assert_eq "changed is dropped entirely when it cannot fit" "0" "$(budget 9 4 | cut -d' ' -f2)"
assert_eq "windows still render in a tiny pane" "4" "$(budget 9 4 | cut -d' ' -f1)"
```

- [ ] **Step 2: Run it to verify it fails**

```bash
bin/tmux-sidebar-selftest
```

Expected: the five new assertions fail with `budget: command not found`; the 30 from Task 5 still pass.

- [ ] **Step 3: Write the minimal implementation**

Add `budget` after `changed_rows`:

```bash
# Pane height + window count -> how many rows each section gets.
#
# WINDOWS takes what it needs up to a ceiling of half the pane; under that
# ceiling it takes only what it has. CHANGED gets everything left. Below
# CHANGED_MIN rows of room the section is dropped HEADER AND ALL -- a rule
# with nothing under it reads as broken rather than absent, which is the
# screensaver panel's rule for exactly the same reason.
CHANGED_MIN=2
budget() {
    local h="${1:-0}" nwin="${2:-0}" cap wrows crows
    cap=$((h / 2)); [ "$cap" -lt 1 ] && cap=1
    wrows=$nwin; [ "$wrows" -gt "$cap" ] && wrows=$cap
    # Two headers, each with a blank line under it.
    crows=$((h - wrows - 4))
    [ "$crows" -lt "$CHANGED_MIN" ] && crows=0
    printf '%s %s' "$wrows" "$crows"
}
```

In `draw`, add `#{pane_height}` and `#{window_active}` to the existing `display-message` format — it is already being paid for, so the active test costs nothing:

```bash
	info=$(tmux display-message -p -t "$PANE" \
		'#{pane_width} #{window_panes} #{pane_height} #{window_active}' 2>/dev/null) || exit 0
	# shellcheck disable=SC2086
	set -- $info
	W="${1:-24}"; NP="${2:-2}"; H="${3:-24}"; ACTIVE="${4:-0}"
```

Add the refresh, gated, before the section is built:

```bash
	# Render every second from cache; refresh the git data every REFRESH_EVERY
	# seconds and ONLY when the window is active. Same split as bar.conf vs
	# tmarchy-tick, for the same reason: `git status` is 32 ms even with
	# --ignore-submodules, and paying it per second per window is how a status
	# surface in this repo turns into a fork storm.
	#
	# The cache is these variables. The sidebar is a long-running process per
	# window, so the process IS the cache -- no state file to go stale, no
	# reader/writer race, nothing to clean up when the window closes.
	if [ "$ACTIVE" = "1" ] && [ $((SECONDS - LAST_REFRESH)) -ge "$REFRESH_EVERY" ]; then
		LAST_REFRESH=$SECONDS
		# The repo follows the ACTIVE pane, excluding this one -- focusing the
		# sidebar would otherwise re-root the list to wherever it started.
		apath=$(tmux list-panes -t "$PANE" \
			-F '#{pane_active} #{?@sidebar-pane,1,0} #{pane_current_path}' 2>/dev/null \
			| awk '$1=="1" && $2=="0" {$1="";$2="";sub(/^  /,"");print;exit}')
		if [ -n "$apath" ]; then
			nrepo=$(git -C "$apath" rev-parse --show-toplevel 2>/dev/null) || nrepo=""
			REPO="$nrepo"
		fi
		# A failed refresh leaves the previous rows standing -- one interval
		# stale, never a blank or half-populated section.
		[ -n "$REPO" ] && CHANGED_CACHE=$(git_refresh "$REPO")
		[ -n "$REPO" ] || CHANGED_CACHE=""
		NOW_TS=$(date +%s 2>/dev/null || printf '0')
	fi
```

Declare the cache beside `lastW` (line 40):

```bash
lastW=""
REPO=""
CHANGED_CACHE=""
NOW_TS=0
LAST_REFRESH=-999
REFRESH_EVERY=3
```

The one `date` call is inside the 3 s refresh, not the 1 s render — the constraint is no fork *in the render loop*. Ages therefore step in 3 s increments, which at a 12 s floor is invisible.

Build the section after the window loop, replacing the direct `lines+=` for windows with the budget:

```bash
	read -r WROWS CROWS <<< "$(budget "$H" "${#winrows[@]}")"

	local lines=()
	lines+=("${C_HEAD} WINDOWS${RESET}")
	lines+=("")
	local i=0
	for ln in "${winrows[@]}"; do
		[ "$i" -ge "$WROWS" ] && break
		lines+=("$ln"); i=$((i + 1))
	done

	if [ "$CROWS" -gt 0 ] && [ -n "$CHANGED_CACHE" ]; then
		lines+=("")
		lines+=("${C_HEAD} CHANGED${RESET}")
		while IFS=$'\t' read -r rec text; do
			[ -n "$text" ] || continue
			case "$rec" in
				now)    lines+=("${C_HEAD}${text}${RESET}") ;;
				recent) lines+=("${C_NAME}${text}${RESET}") ;;
				*)      lines+=("${C_IDLE}${text}${RESET}") ;;
			esac
		done <<< "$(changed_rows "$CHANGED_CACHE" "$NOW_TS" "$W" "$CROWS")"
	fi
```

The window loop now appends to a `winrows` array instead of `lines` — change its two `lines+=(` calls to `winrows+=(` and declare `local winrows=()` before it.

- [ ] **Step 4: Run it to verify it passes**

```bash
bin/tmux-sidebar-selftest && bash -n bin/tmux-window-sidebar
```

Expected: `all passed`, 35 `ok` lines, no syntax error.

- [ ] **Step 5: Verify end to end, including the cost**

```bash
tmux set -g @sidebar on && ~/bin/tmux-sidebar-ensure
touch bin/tmux-goto
```

Expected: within ~3 s `bin/tmux-goto` appears at the top of `CHANGED` in the accent colour reading `0s`–`3s`, ageing as you watch. Then confirm the refresh really is gated — switch to another window for 30 s and check the sidebar process has not been spinning:

```bash
ps -o %cpu= -p "$(pgrep -f tmux-window-sidebar | head -1)"
```

Expected: under 1%. Then shrink the pane to fewer than 10 rows and confirm `CHANGED` disappears **header and all**, not as a bare heading.

- [ ] **Step 6: Sabotage-verify the budget rule**

Change `[ "$crows" -lt "$CHANGED_MIN" ] && crows=0` to `crows=1` → only "changed is dropped entirely when it cannot fit" fails. That is the assertion worth protecting: the failure mode it prevents is a heading with nothing under it, which looks like a bug rather than a design.

- [ ] **Step 7: Commit**

```bash
git add bin/tmux-window-sidebar bin/tmux-sidebar-selftest
git commit -m "sidebar: a CHANGED section, on a decoupled refresh

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: Documentation

**Files:**
- Modify: `CLAUDE.md` (the `bin/` scripts list, and the sidebar bullet under Tmux Configuration)

- [ ] **Step 1: Document the picker**

Add to the `Scripts in bin/` list, after the `tmux-theme-pick` entry, in the voice of the surrounding entries — what it does, and the non-obvious thing a future reader would otherwise rediscover:

- `prefix + f`, taking tmux's own `find-window`, which `prefix + u` already subsumes.
- The **305 ms vs 32 ms** submodule measurement and why `--ignore-submodules` is load-bearing rather than tuning.
- `display-message -p '#{pane_id}'` inside a popup returns the pane it was launched **over** — a popup is not a pane — which is why the target needs no bookkeeping.
- The depth cap on the home root, and that `~` has no gitignore.
- The control-byte gate, and that a filename is untrusted input for the same reason a model's reply is.

- [ ] **Step 2: Update the sidebar bullet**

The existing bullet says the sidebar hardcodes `44` for subagents and the four state colours. That is now false — note it reads `@theme-*` through `bin/lib/tmux-theme.sh`, that the full-width highlight became a left rule to buy name budget, and that `CHANGED` is dropped header-and-all rather than shown empty.

- [ ] **Step 3: Verify the claims**

Every number in the new prose must be one that was actually measured in this session, not estimated. Re-run anything you are unsure of rather than writing it from memory.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: the changed-files sidebar and the @file picker

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Self-review notes

**Spec coverage.** Every decision in the spec maps to a task: 1–2 → Task 5/6, 3–5 → Task 6, 6 → Task 6 (the `@sidebar-pane` exclusion in the refresh), 7–9 → Task 5, 10–12 → Task 3, 13 → Task 4. Failure behaviour: no-repo and refresh-failure in Task 6 step 3, deleted-file in Task 5, missing rg in Task 2, missing fzf and empty selection in Task 3. All eight rows of the spec's test table appear: age boundaries and deleted-no-age (Task 5), left-truncation (Task 5), the trim rule (Task 6), the three reference branches and the three control-byte cases and the leading-dash case (Task 1/3), the `--ignore-submodules` pin (Task 5).

**One spec deviation, deliberate.** The spec says the target pane is "captured once at startup". `bin/tmux-gen:222` documents that tmux already returns the launching pane from inside a popup, so Task 3 relies on that instead of storing it — same guarantee, less state. Worth flagging at review.

**One known risk.** `${#name}` counts characters, not display columns, and this repo has documented BSD tooling miscounting Nerd Font glyphs. The existing sidebar already pads with `${#plain}` against strings containing `…` and renders correctly, so the exposure is unchanged rather than new — but if a `CHANGED` row's age column looks off by one, this is the first place to look.
