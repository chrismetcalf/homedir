# tmux-sidebar.sh — whether the window sidebar is allowed to exist right now.
#
# Sourced, never executed. One predicate with three callers --
# tmux-sidebar-{ensure,resize,toggle} -- which is why it lives here instead of
# being inlined three times. This repo has already paid once for a duplicated
# predicate (sessionState, byte-identical in two files, staying in sync by luck
# rather than by anything enforcing it), and a drift HERE would be the
# invisible kind: the follow hooks building a sidebar that the resize hook
# removes a moment later, on every window switch, forever.

# A window must be at least this wide to be worth spending columns on a
# sidebar.
#
# 120 is not a new number. It is the same threshold tmarchy/bar.conf uses to
# decide a client is a phone and bin/tmux-popup-fit uses to open a picker full
# screen -- one value for "this display is small" rather than a third guess at
# it. Overridable with @sidebar-min-width, which is the knob to reach for if
# you disagree, rather than editing this.
#
# Measured on the host this was written for: a 24-column sidebar in an
# 84-column ShellFish window left the shell 59 columns, which is what prompted
# it.
SIDEBAR_MIN_WIDTH_DEFAULT=120

# sidebar_fits <window_width> <min_width>
#
# True when a window that wide should carry a sidebar.
#
# It takes the WINDOW's width, never a client's, and that is the whole point of
# the signature. A sidebar is a pane split, so it is a property of the window
# and is shared by every client attached to it -- "how wide is the terminal"
# therefore has exactly one answer here, and #{client_width} does not give it:
# with two clients attached it gives two different ones for a thing that can
# only be one way. tmux already sizes a window to the smallest client viewing
# it (per window under `aggressive-resize on`, which is set here), so
# #{window_width} IS the column budget the split has to live inside. Measured
# on this host with four clients attached at 54/178/209/270: the windows report
# 54, 84, 178, 209 and 270 individually, which is exactly the per-window answer
# wanted.
#
# FAILS OPEN on anything it cannot parse -- an empty width, a non-numeric
# option, the 0 a window no client is looking at can report. The alternative is
# a sidebar that silently never appears again, which is the bin/lib-unreachable
# failure mode this repo has hit before: every other check passes and the
# feature is just quietly gone. Failing open degrades to the behaviour from
# before this file existed, which is merely the thing we are improving on.
sidebar_fits() {
	case "${1:-}" in ''|0|*[!0-9]*) return 0 ;; esac
	case "${2:-}" in ''|*[!0-9]*) return 0 ;; esac
	[ "$1" -ge "$2" ]
}

# The configured minimum, or the default. This asks tmux, so it is deliberately
# NOT part of sidebar_fits: the predicate stays pure, and therefore testable
# with no server running, which is the only way bin/tmux-sidebar-selftest can
# reach it.
sidebar_min_width() {
	local v
	v="$(tmux show-option -gqv @sidebar-min-width 2>/dev/null)"
	case "$v" in ''|*[!0-9]*) v="$SIDEBAR_MIN_WIDTH_DEFAULT" ;; esac
	printf '%s' "$v"
}
