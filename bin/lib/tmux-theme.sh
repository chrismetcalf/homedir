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
theme_get() {
    tmux show -gv "@theme-${1:-}" 2>/dev/null
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
