# tmux-frecency.sh — shared "most used first" ranking for the fzf pickers.
#
# Sourced, never executed. tmux-goto, tmux-ssh and tmux-cmd all open with a
# list in source order, which means the host you ssh to daily sits wherever
# tailscale happened to put it. This records what you actually pick and sorts
# by it.
#
# Frecency, not frequency: a count alone would keep a burst of activity from
# six months ago pinned to the top forever. The count is multiplied by a weight
# that decays with age, so recent use dominates and old use fades without ever
# quite vanishing.
#
# Two things make the ordering actually visible:
#   - with an empty query fzf does no scoring at all and shows input order, so
#     sorting the input IS the ranking at the moment the popup opens;
#   - once you type, fzf scores matches and breaks ties with --tiebreak, whose
#     default is `length`. Every caller passes --tiebreak=index so that ties
#     fall back to the order given here rather than to whichever row is
#     shortest. Sorting without that flag would be silently overridden.

# Resolved at CALL time, never captured into a variable at source time. A
# selftest exports TMUX_FRECENCY_DIR after sourcing this file, and a source-time
# capture would ignore it and write to the real state directory instead -- which
# is exactly how tmux-gen's CLAUDE_BIN once sent every test run at the real,
# billed claude binary. Same shape, same silence.

# Entries untouched for this long are dropped on the next write. Window names
# and hosts come and go; without this the file grows forever.
FRECENCY_MAX_AGE=$((90 * 24 * 3600))

frecency_path() {
    printf '%s/%s-frecency' "${TMUX_FRECENCY_DIR:-$HOME/.local/state/tmarchy}" "${1:-unknown}"
}

# Age in seconds -> weight. Integer throughout: awk floats would sort fine but
# the two copies of this ladder (here and in frecency_sort) have to agree
# exactly, and integers make that easy to eyeball.
# Never returns 0: something used once a year should still outrank something
# never used at all.
# The spread is deliberately steep. A flatter curve (40/30/20/10/5) let a pile
# of fifty uses from two months ago outrank three uses today, which is the
# opposite of what a picker is for: it should surface what you are working on
# now. Roughly, a week of disuse costs you an order of magnitude.
frecency_weight() {
    local age="${1:-0}"
    if   [ "$age" -lt 3600 ];    then printf '100'
    elif [ "$age" -lt 86400 ];   then printf '60'
    elif [ "$age" -lt 604800 ];  then printf '30'
    elif [ "$age" -lt 2592000 ]; then printf '10'
    else                              printf '3'
    fi
}

# rows (one per line) + a state file + the name of a function that turns a row
# into its key -> the same rows, most-used first, everything else undisturbed.
#
# Rows are tab-separated internally, so the annotation used for sorting is
# joined with \001 instead: reusing tab here would split rows at their own
# field boundaries.
frecency_sort() {
    local rows="${1:-}" file="${2:-}" keyfn="${3:-}" now row key
    [ -n "$rows" ] || return 0
    if [ -z "$keyfn" ] || ! command -v "$keyfn" >/dev/null 2>&1; then
        printf '%s\n' "$rows"
        return 0
    fi
    now=$(date +%s 2>/dev/null || printf '0')

    {
        while IFS= read -r row; do
            [ -n "$row" ] || continue
            key=$("$keyfn" "$row")
            printf '%s\001%s\n' "$key" "$row"
        done <<< "$rows"
    } | awk -F'\001' -v now="$now" -v statefile="$file" '
        BEGIN {
            while ((getline line < statefile) > 0) {
                n = split(line, a, "\t")
                if (n >= 3) { cnt[a[1]] = a[2]; last[a[1]] = a[3] }
            }
            close(statefile)
        }
        {
            key = $1
            row = substr($0, index($0, "\001") + 1)
            score = 0
            if (key != "" && (key in cnt)) {
                age = now - last[key]
                if (age < 0) age = 0
                # Must stay in step with frecency_weight above.
                if      (age < 3600)    w = 100
                else if (age < 86400)   w = 60
                else if (age < 604800)  w = 30
                else if (age < 2592000) w = 10
                else                    w = 3
                score = cnt[key] * w
            }
            # NR keeps the original order for everything that ties, so an
            # unused list comes out exactly as it went in.
            printf "%d\001%06d\001%s\n", score, NR, row
        }
    ' | sort -t $'\001' -k1,1nr -k2,2n | cut -d $'\001' -f3-
}

# Bump one key. Called after a selection, so it must never be able to break the
# thing that was selected: every failure path is silent and non-fatal.
frecency_record() {
    local file="${1:-}" key="${2:-}" now tmp dir
    [ -n "$file" ] || return 0
    [ -n "$key" ] || return 0
    case "$key" in *$'\t'*|*$'\n'*) return 0 ;; esac

    dir=$(dirname "$file")
    mkdir -p "$dir" 2>/dev/null || return 0
    [ -f "$file" ] || : > "$file" 2>/dev/null || return 0
    now=$(date +%s 2>/dev/null) || return 0

    tmp=$(mktemp "${file}.XXXXXX" 2>/dev/null) || return 0
    if awk -F'\t' -v k="$key" -v now="$now" -v maxage="$FRECENCY_MAX_AGE" '
        BEGIN { OFS = "\t" }
        NF >= 3 && $1 == k { print $1, $2 + 1, now; found = 1; next }
        # Drop what has gone stale rather than growing the file forever.
        NF >= 3 && (now - $3) <= maxage { print $1, $2, $3 }
        END { if (!found) print k, 1, now }
    ' "$file" > "$tmp" 2>/dev/null; then
        mv -f "$tmp" "$file" 2>/dev/null || rm -f "$tmp" 2>/dev/null
    else
        rm -f "$tmp" 2>/dev/null
    fi
    return 0
}
