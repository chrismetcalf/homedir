#!/usr/bin/env bash
# tmarchy entry point. Loaded by an explicit run-shell AFTER tpm, so its
# ordering is ours rather than tpm's. Idempotent: safe to run on every reload.
set -uo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STATE="${XDG_STATE_HOME:-$HOME/.local/state}/tmarchy/theme"
THEME="tokyo-night"

# Restore the persisted theme, falling back to the default if the state file
# is missing or names a theme that no longer exists.
if [ -r "$STATE" ]; then
  candidate="$(head -n1 "$STATE" 2>/dev/null | tr -d '[:space:]')"
  if [ -n "$candidate" ] && [ -f "$DIR/themes/$candidate.conf" ]; then
    THEME="$candidate"
  fi
fi

tmux set -g @tmarchy-dir "$DIR"
tmux set -g @tmarchy-theme "$THEME"
tmux source-file "$DIR/themes/$THEME.conf"
tmux source-file "$DIR/bar.conf"
