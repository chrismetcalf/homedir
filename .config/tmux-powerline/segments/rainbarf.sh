#!/usr/bin/env bash
# Print out Memory and CPU using https://github.com/creaktive/rainbarf

run_segment() {
	local rainbarf_cmd="$HOME/perl5/bin/rainbarf"

	# Check if rainbarf exists
	if [ ! -x "$rainbarf_cmd" ]; then
		return
	fi

	# Customize via ~/.rainbarf.conf
	# Use --rgb for better color visibility and --width to control size
	stats=$("$rainbarf_cmd" --tmux --rgb --width 20)
	if [ -n "$stats" ]; then
		echo "$stats"
	fi
	return 0
}
