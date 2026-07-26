#!/usr/bin/env bash
#
# ios-clip.sh — copy text or a file to the iOS clipboard via Secure ShellFish.
#
# Uses the OSC 52 clipboard escape sequence that Secure ShellFish understands,
# written DIRECTLY to the terminal (the tmux client tty, or $SSH_TTY when not in
# tmux). Writing to the tty bypasses Claude Code's stdout capture, so this works
# from inside a Claude Code tool call — not just at a bare shell prompt.
#
# Only works when the session is running in a Secure ShellFish terminal (iOS/
# iPadOS). Off-ShellFish (relay bot, web, another SSH client) there is no iOS
# clipboard to write to; the script says so and exits non-zero.
#
# Usage:
#   ios-clip.sh <file>                # copy the file's contents
#   ios-clip.sh --text "some text"
#   echo "piped text" | ios-clip.sh
#
#   ios-clip.sh --rich <file>         # copy, then run the Markdown->rich-text
#   ios-clip.sh --rich --text "..."   # Shortcut so the clipboard ends up as
#                                     # formatted rich text (see RICH_SHORTCUT)
#
set -euo pipefail

# --- rich-text support -------------------------------------------------------
# Name of the iOS Shortcut that converts the clipboard from Markdown to rich
# text and copies it back. Build it as:  Get Clipboard -> Make Rich Text from
# Markdown -> Copy to Clipboard.  Override at runtime with $IOS_CLIP_RICH_SHORTCUT.
RICH_SHORTCUT="${IOS_CLIP_RICH_SHORTCUT:-Markdown to Rich Text}"

RICH=0
if [ "${1:-}" = "--rich" ]; then RICH=1; shift; fi

b64() { printf '%s' "$1" | base64 | tr -d '\n'; }

urlencode() {
  local s="$1" i c out=""
  for ((i = 0; i < ${#s}; i++)); do
    c="${s:i:1}"
    case "$c" in
      [a-zA-Z0-9._~-]) out+="$c" ;;
      *) printf -v c '%%%02X' "'$c"; out+="$c" ;;
    esac
  done
  printf '%s' "$out"
}

# --- gather the payload as base64 (single line) ------------------------------
if [ "$#" -ge 1 ] && [ "$1" = "--text" ]; then
  shift
  TXT="$*"
  DATA=$(printf '%s' "$TXT" | base64 -w0)
  SRC="text (${#TXT} chars)"
elif [ "$#" -ge 1 ] && { [ "$1" = "-h" ] || [ "$1" = "--help" ]; }; then
  grep '^#' "$0" | sed 's/^# \{0,1\}//' | head -n 24; exit 0
elif [ "$#" -ge 1 ] && [ "$1" != "-" ]; then
  [ -f "$1" ] || { echo "ios-clip: no such file: $1" >&2; exit 1; }
  DATA=$(base64 -w0 "$1")
  SRC="file: $1"
else
  DATA=$(base64 -w0)
  SRC="stdin"
fi

RAW_BYTES=$(printf '%s' "$DATA" | wc -c)

# --- pick a terminal to write escape sequences to ----------------------------
TTY=""
if [ -n "${TMUX:-}" ] && command -v tmux >/dev/null 2>&1; then
  TTY=$(tmux display-message -p '#{client_tty}')
  [ -w "$TTY" ] || { echo "ios-clip: tmux client tty $TTY is not writable" >&2; exit 1; }
elif [ -w "${SSH_TTY:-/dev/null}" ]; then
  TTY="$SSH_TTY"
elif [ -t 1 ]; then
  TTY="/dev/stdout"
else
  echo "ios-clip: no ShellFish terminal reachable (no tmux client tty, no writable \$SSH_TTY, stdout not a tty)." >&2
  echo "ios-clip: this only works from a Secure ShellFish session." >&2
  exit 1
fi

# Emit an OSC sequence to $TTY, tmux-passthrough-wrapped when inside tmux.
emit() { # $1 = OSC payload (without the leading ESC] or trailing BEL)
  if [ -n "${TMUX:-}" ]; then
    printf '\ePtmux;\e\e]%s\a\e\\' "$1" > "$TTY"
  else
    printf '\e]%s\a' "$1" > "$TTY"
  fi
}

# --- copy to clipboard (OSC 52) ----------------------------------------------
emit "52;c;${DATA}"
echo "Copied $SRC to iOS clipboard (${RAW_BYTES} b64 bytes)."
if [ "$RAW_BYTES" -gt 74000 ]; then
  echo "Warning: payload is large (${RAW_BYTES} b64 bytes) — some terminals cap OSC 52; verify the paste isn't truncated." >&2
fi

# --- optionally convert the clipboard to rich text via a Shortcut ------------
if [ "$RICH" = "1" ]; then
  [ -n "$RICH_SHORTCUT" ] || { echo "ios-clip: --rich set but no shortcut name (set \$IOS_CLIP_RICH_SHORTCUT)." >&2; exit 1; }
  # Give ShellFish a beat to finish setting the clipboard before the Shortcut reads it.
  sleep 0.5
  FIFO="/tmp/.ioclip_fifo_$$"; mkfifo "$FIFO" 2>/dev/null || true
  URL="shortcuts://run-shortcut?name=$(urlencode "$RICH_SHORTCUT")"
  emit "6;open://?ver=2&respond=$(b64 "$FIFO")&url=$(b64 "$URL")"
  rm -f "$FIFO"
  echo "Triggered rich-text shortcut: $RICH_SHORTCUT"
fi
