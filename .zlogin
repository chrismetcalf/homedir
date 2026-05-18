# ~/.zlogin — runs once per LOGIN shell, after .zshrc.
#
# Auto-attach a tmux session named "main" on interactive SSH login.
#
# Why .zlogin and not .zshrc:
#   - Login shells only: env-probe / non-login invocations skip the file
#     entirely, so no false "open terminal" error.
#   - Runs after .zshrc / .zshrc.local; exec'ing tmux here is safe.
#   - exec replaces the shell with tmux so detaching from tmux ends the
#     SSH session cleanly instead of dropping back to a stub shell.
#
# Gated on stdin/stdout actually being ttys: OpenSSH-based clients (mac
# Terminal, iTerm2, ShellFish, ssh-from-terminal) have real PTYs and this
# fires cleanly. Tabby's bundled ssh2-based client doesn't attach to a
# real PTY at .zlogin time — for Tabby, configure the profile's "Initial
# command" to run `tmux new-session -A -s main` directly, bypassing this.

if [ -z "$TMUX" ] && [ -n "$SSH_CONNECTION" ] && [ -t 0 ] && [ -t 1 ]; then
  exec tmux new-session -A -s main
fi
