#!/usr/bin/env bash
# Wrap qeesung/tmux-scout status widget as a tmux-powerline segment.
# https://github.com/qeesung/tmux-scout

run_segment() {
	local tint="$HOME/bin/tmux-scout-window-tint"

	# Silent ticker: each status refresh runs the tint script to update
	# @scout-state on every tmux window. Backgrounded so node startup adds
	# no latency to status rendering. Echo nothing → powerline hides the
	# segment (no visible block / separator).
	[ -x "$tint" ] && "$tint" >/dev/null 2>&1 &
	return 0
}
