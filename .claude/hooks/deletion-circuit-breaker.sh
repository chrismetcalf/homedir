#!/bin/bash
# Circuit breaker: force confirmation on risky deletions.
# - Recursive/wildcard rm: asks once the risk score exceeds the threshold
#   (each scores 10, so the second one in a session asks).
# - Single-file deletions: score 1 each; only asks after 15 in a session
#   (routine cleanup of temp files shouldn't trip the breaker).
# Tracks the score in a temp file keyed by session ID.

set -euo pipefail

INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name')
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id')

# Project opt-outs: no deletion tracking in these working directories
CWD=$(echo "$INPUT" | jq -r '.cwd // empty')
case "$CWD" in
  /home/krezel/src/github.com/sylvies|/home/krezel/src/github.com/sylvies/*) exit 0 ;;
esac

TRACKER_DIR="/tmp/otto-deletion-tracking"
mkdir -p "$TRACKER_DIR"
TRACKER_FILE="$TRACKER_DIR/$SESSION_ID"

# Initialize counter if needed
if [ ! -f "$TRACKER_FILE" ]; then
  echo "0" > "$TRACKER_FILE"
fi

is_deletion() {
  if [ "$TOOL_NAME" = "Bash" ]; then
    local cmd
    cmd=$(echo "$INPUT" | jq -r '.tool_input.command // empty')
    # Detect rm, unlink, rmdir, git rm commands (not grep/head which just read)
    if echo "$cmd" | grep -qE '(^|\s|&&|\|\||;)(rm|unlink|rmdir|git rm)(\s|$)'; then
      # Recursive rm (-r/-R) or wildcard = potentially many files, block immediately
      if echo "$cmd" | grep -qE 'rm\s+(-[rRf]*[rR][rRf]*\s+)'; then
        echo "10"
        return 0
      fi
      if echo "$cmd" | grep -qE 'rm\s+(-[rRf]+\s+)?[^|;]*\*'; then
        echo "10"
        return 0
      fi
      echo "1"
      return 0
    fi
  fi
  echo "0"
  return 1
}

DELETE_COUNT=$(is_deletion || true)

if [ "$DELETE_COUNT" -gt 0 ]; then
  CURRENT=$(cat "$TRACKER_FILE")
  NEW_COUNT=$((CURRENT + DELETE_COUNT))
  echo "$NEW_COUNT" > "$TRACKER_FILE"

  if [ "$NEW_COUNT" -gt 15 ]; then
    # Force user confirmation
    jq -n --arg count "$NEW_COUNT" '{
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "ask",
        permissionDecisionReason: ("Circuit breaker: deletion risk score " + $count + " this session (limit: 20; recursive/wildcard deletes score 10, single files 1). Please confirm to continue.")
      }
    }'
    exit 0
  fi
fi

# Allow by default
exit 0
