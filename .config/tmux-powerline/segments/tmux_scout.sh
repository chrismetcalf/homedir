#!/usr/bin/env bash
# Wrap qeesung/tmux-scout status widget as a tmux-powerline segment.
# https://github.com/qeesung/tmux-scout

run_segment() {
	local plugin_dir="$HOME/.tmux/plugins/tmux-scout"
	local widget="$plugin_dir/scripts/status-widget.sh"

	[ -x "$widget" ] || return 0

	local out
	out=$("$widget" 2>/dev/null)
	[ -n "$out" ] || return 0

	# status-widget.sh emits trailing space + #[default] resets; strip them so
	# the powerline segment's bg/fg drives the surrounding styling.
	out="${out//#\[default\]/}"
	out="${out%% }"

	echo "$out"
	return 0
}
