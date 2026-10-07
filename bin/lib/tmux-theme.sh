# tmux-theme.sh — shared access to the live tmarchy theme.
#
# Sourced, never executed. Four tools were each carrying their own copy of
# ansi_for; this is that function's home, plus the fzf half of the same idea.
#
# Why the fzf half matters: the pickers coloured their own row text from
# @theme-*, but fzf's own chrome -- prompt, pointer, the highlight on the
# selected line, the border -- stayed at fzf's defaults. Switching to any of the
# nine themes left a green-and-white picker sitting on top of it, which is
# exactly the inconsistency the theme system exists to remove.

# The theme is read from tmux at call time, so a theme switch takes effect on
# the next invocation with nothing to reload.
#
# ONE tmux invocation for the whole palette, held for the life of the process.
# A `tmux show -gv @theme-x` per value is the obvious shape and is what every
# caller used to do, but a fork costs ~13ms on this Mac (the endpoint-security
# exec hook taxes every exec), so tmux-goto alone spent 208ms of its startup on
# twelve of them -- more than it spent asking tmux for every session, window and
# pane it was about to list. `show -g` returns all 117 global options in 18ms.
#
# Per PROCESS, not per call, which is the same contract as before: each picker
# is a fresh process, so a theme switched between popups is still picked up.
# Only a switch DURING one popup is missed, and there is no such moment.
#
# DAEMON EXCEPTION: a long-lived process (bin/tmux-window-sidebar) must detect
# theme changes and invalidate. It appends a marker field to an existing tmux
# call and calls theme_invalidate() when the marker changes.
#
# Keyed by NAME, not read positionally out of chained `show -gqv` calls. That
# alternative is also one fork and looks tidier, but an unset option prints
# NOTHING AT ALL -- not even an empty line (verified) -- so a theme missing one
# key shifts every later value up by one and paints the picker in colours that
# are wrong rather than absent. Name-keyed, a missing key is simply missing.
#
# Parallel indexed arrays rather than one associative array: this repo deploys
# to macOS, where /bin/bash is still 3.2 and `declare -A` is a syntax error that
# would take the whole picker down on a host without Homebrew bash. A linear
# scan over ~14 keys is builtins only and costs nothing next to one fork.
_THEME_LOADED=""
_THEME_NAMES=()
_THEME_VALUES=()

_theme_load() {
    [ -z "$_THEME_LOADED" ] || return 0
    _THEME_LOADED=1
    local line name value
    # Process substitution, not a pipe: a `while read` on the right of a pipe
    # runs in a subshell and every array element written here would be lost the
    # moment the loop ended -- leaving a cache that is refilled on each lookup.
    while IFS= read -r line; do
        case "$line" in @theme-*) ;; *) continue ;; esac
        name=${line%% *}
        value=${line#* }
        # An option set to nothing prints as the bare name with no separator.
        [ "$value" != "$line" ] || value=""
        # tmux quotes what its own config language would otherwise mangle, which
        # is every hex colour, since # starts a comment there. jewel's colourNNN
        # comes back bare, so both forms have to be handled.
        case "$value" in '"'*'"') value=${value#\"}; value=${value%\"} ;; esac
        _THEME_NAMES[${#_THEME_NAMES[@]}]="${name#@theme-}"
        _THEME_VALUES[${#_THEME_VALUES[@]}]="$value"
    done < <(tmux show -g 2>/dev/null)
}

# Fill the cache in the CURRENT shell. Callers that are about to read several
# values should call this first: theme_get is almost always invoked inside a
# $(...) command substitution, and a cache filled in that subshell dies with it.
# Calling it here means the subshells inherit a cache that is already warm.
theme_load() { _theme_load; }

# Invalidate the cache, forcing a re-read on the next theme_load. Used by daemons
# (bin/tmux-window-sidebar) that detect theme changes via a marker field and need
# to reload. Short-lived processes never call this.
theme_invalidate() {
    _THEME_LOADED=""
    _THEME_NAMES=()
    _THEME_VALUES=()
}

theme_get() {
    local want="${1:-}" i=0
    _theme_load
    while [ "$i" -lt "${#_THEME_NAMES[@]}" ]; do
        if [ "${_THEME_NAMES[$i]}" = "$want" ]; then
            printf '%s' "${_THEME_VALUES[$i]}"
            return 0
        fi
        i=$((i + 1))
    done
}

# tmux colours are #rrggbb in eight of the nine themes but colourNNN in jewel,
# the pre-tmarchy palette. Anything else yields nothing rather than a broken
# escape.
ansi_for() {
    local v="${1:-}"
    case "$v" in
        '#'??????)
            printf '\033[38;2;%d;%d;%dm' \
                "$((16#${v:1:2}))" "$((16#${v:3:2}))" "$((16#${v:5:2}))" ;;
        colour[0-9]*|color[0-9]*)
            printf '\033[38;5;%dm' "${v#colo*r}" ;;
    esac
}

# fzf accepts #rrggbb or a bare 0-255 number. It does NOT understand tmux's
# "colour214" spelling, so jewel would silently produce an unparseable spec and
# fzf would reject the whole --color argument -- taking every other colour in it
# down too, not just that one.
fzf_colour() {
    local v="${1:-}"
    case "$v" in
        '#'??????)                printf '%s' "$v" ;;
        colour[0-9]*|color[0-9]*) printf '%s' "${v#colo*r}" ;;
    esac
}

# One --color=... token built from the live theme, or nothing at all when no
# theme is loaded (a bare tmux, or tmarchy not sourced yet). Emitting a partial
# spec would be worse than none: fzf would colour half its chrome and leave the
# rest default.
fzf_theme_opts() {
    local spec="" bg fg dim accent alt border done_col busy

    # Warm the cache HERE, in this shell, so the eight $(theme_get ...) below
    # inherit it instead of each filling and discarding its own copy.
    theme_load

    bg=$(fzf_colour "$(theme_get bg)")
    fg=$(fzf_colour "$(theme_get fg)")
    dim=$(fzf_colour "$(theme_get dim)")
    accent=$(fzf_colour "$(theme_get accent)")
    alt=$(fzf_colour "$(theme_get accent-alt)")
    border=$(fzf_colour "$(theme_get border)")
    done_col=$(fzf_colour "$(theme_get done)")
    busy=$(fzf_colour "$(theme_get busy)")

    _fzf_add() {
        [ -n "${2:-}" ] || return 0
        spec="${spec:+$spec,}$1:$2"
    }

    _fzf_add bg      "$bg"
    _fzf_add gutter  "$bg"
    _fzf_add fg      "$fg"
    # The selected row: same foreground, lifted background, so the highlight
    # reads as elevation rather than as a different palette.
    _fzf_add "fg+"   "$fg"
    _fzf_add "bg+"   "$border"
    # Matched characters. accent for the rest, accent-alt on the selected row so
    # the match stays legible against the lifted background.
    _fzf_add hl      "$accent"
    _fzf_add "hl+"   "$alt"
    _fzf_add prompt  "$accent"
    _fzf_add pointer "$alt"
    _fzf_add marker  "$done_col"
    _fzf_add spinner "$busy"
    _fzf_add info    "$dim"
    _fzf_add header  "$dim"
    _fzf_add border  "$border"

    unset -f _fzf_add
    [ -n "$spec" ] && printf -- '--color=%s' "$spec"
    return 0
}
