#!/bin/sh
# shellfish-notify — Secure ShellFish hook helper for agentic coding hooks.
#
# Reads a hook JSON payload on stdin and forwards it to ShellFish through an
# OSC 6 sequence on the controlling terminal. The notification appears on
# whichever device is currently displaying the terminal that owns this
# session, and is silent when the ShellFish app is already in the foreground.
#
# The Shell Integration installer can wire this up for you — re-run Install
# from the app and pick "Install" when prompted. To do it by hand, add a
# hook to ~/.claude/settings.json using the absolute path (Claude Code does
# not expand ~ or $HOME inside hook commands):
#
#   "hooks": {
#     "Notification": [{"hooks":[{"type":"command",
#       "command":"/Users/you/.claude/shellfish-notify.sh claude"}]}],
#     "Stop": [{"hooks":[{"type":"command",
#       "command":"/Users/you/.claude/shellfish-notify.sh claude"}]}]
#   }
#
# Codex CLI and OpenCode use equivalent hook syntax — pass the matching tool
# name as the first argument (codex, opencode, …).

tool="${1:-agent}"
hook=$(cat)

tool_b64=$(printf '%s' "$tool" | base64 | tr -d '\n')
hook_b64=$(printf '%s' "$hook" | base64 | tr -d '\n')
osc="6;codingagenthook://?ver=2&tool=${tool_b64}&hook=${hook_b64}"

# /dev/tty only works when this process has a controlling terminal, which
# agent hook subprocesses (Claude Code, Codex, OpenCode) usually do not.
# The write then fails with "device not configured" and the notification is
# silently lost. Walk up the process tree to the shell or agent that owns the
# ShellFish pty (the tmux pane pty when inside tmux) and write there instead.
# Fall back to $SSH_TTY, then /dev/tty.
tty_path=""
pid=$$; i=0
while [ -n "$pid" ] && [ "$pid" -gt 1 ] && [ "$i" -lt 12 ]; do
  t=$(ps -o tty= -p "$pid" 2>/dev/null | tr -d ' ')
  case "$t" in ttys*|ttyp*|pts*) tty_path="/dev/$t"; break ;; esac
  pid=$(ps -o ppid= -p "$pid" 2>/dev/null | tr -d ' '); i=$((i+1))
done
[ -z "$tty_path" ] && tty_path="${SSH_TTY:-/dev/tty}"

# stdout is a pipe to the agent process, which would swallow the escape, so
# write to the resolved terminal. Inside tmux the OSC is wrapped in a
# passthrough so it reaches the outer terminal (needs allow-passthrough on).
if [ -n "$TMUX" ]; then
  printf '\033Ptmux;\033\033]%s\a\033\\' "$osc" > "$tty_path" 2>/dev/null || true
else
  printf '\033]%s\a' "$osc" > "$tty_path" 2>/dev/null || true
fi