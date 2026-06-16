#!/usr/bin/env bash
# Claude Code statusLine command
# Mirrors powerlevel10k prompt elements: user@host, dir, git branch, model, context

input=$(cat)

user=$(whoami)
host=$(hostname -s)
cwd=$(echo "$input" | jq -r '.cwd')
model=$(echo "$input" | jq -r '.model.display_name')

# Git branch (skip optional locks)
branch=$(GIT_OPTIONAL_LOCKS=0 git -C "$cwd" symbolic-ref --short HEAD 2>/dev/null)

# Context window remaining
remaining=$(echo "$input" | jq -r '.context_window.remaining_percentage // empty')

# Build output with ANSI colors (dimmed-friendly)
# user@host in cyan
printf "\033[36m%s@%s\033[0m" "$user" "$host"

# cwd in blue
printf " \033[34m%s\033[0m" "$cwd"

# git branch in yellow (if in a repo)
if [ -n "$branch" ]; then
  printf " \033[33m(%s)\033[0m" "$branch"
fi

# model in magenta
printf " \033[35m%s\033[0m" "$model"

# context remaining in green (only after first message)
if [ -n "$remaining" ]; then
  printf " \033[32mctx:%s%%\033[0m" "$(printf '%.0f' "$remaining")"
fi

printf "\n"
