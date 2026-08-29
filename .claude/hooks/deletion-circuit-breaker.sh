#!/bin/bash
# Circuit breaker: force confirmation on risky deletions.
# - Recursive/wildcard rm scores 10; single-file deletions score 1.
# - Asks once the running score for the session exceeds THRESHOLD.
#
# CONFIRMATION RESETS THE SCORE (2026-08-06). Previously the score only ever grew, so the
# first time a session crossed the threshold it asked on EVERY subsequent deletion forever —
# confirming bought nothing. That is miserable interactively and much worse in a detached
# build pane, where the prompt stalls a build nobody is watching. A design build hit score 53.
#
# How the reset works, given a PreToolUse hook cannot see the user's answer: when we ask, we
# drop an `.asked` flag. The PostToolUse half only runs if the tool ACTUALLY EXECUTED — i.e.
# the user approved — and that is where the score is zeroed. Deny → the tool never runs →
# PostToolUse never fires → the flag and the high score persist → the next deletion asks
# again. So approving grants a fresh budget; denying does not.
#
# Invoke as:
#   deletion-circuit-breaker.sh          # PreToolUse  (matcher: Bash)
#   deletion-circuit-breaker.sh --post   # PostToolUse (matcher: Bash)

set -euo pipefail

THRESHOLD=15          # ask once the score EXCEEDS this
SCORE_RECURSIVE=10    # rm -r / wildcard: potentially many files
SCORE_SINGLE=1        # a named file: routine cleanup

# Scoped deletions under /tmp score 0 (2026-08-25). The budget is session-wide and only
# resets on approval, so charging it for ephemeral scratch means the breaker fires on noise
# — and a breaker that fires on noise trains you to approve reflexively, which is the exact
# failure it exists to prevent. Every node test fixture mkdtemps and removes a directory;
# one goal-* sweep was 238k directories.
#
# Three things under /tmp are NOT scratch and keep full weight:
#   - live state: /tmp/otto-* (queue) and /tmp/tmux-* (sockets you are attached to)
#   - OTHER sessions' scratchpads under /tmp/claude-*/. Several sessions run on this box
#     concurrently; deleting a sibling's working files destroys work invisible from here.
#     Our own scratchpad is exempt — we know our session id, so we can tell them apart.
#   - anything at the /tmp root itself (rm -rf /tmp, /tmp/*): not a scoped deletion.

MODE="pre"
[ "${1:-}" = "--post" ] && MODE="post"

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
ASKED_FLAG="$TRACKER_DIR/$SESSION_ID.asked"

[ -f "$TRACKER_FILE" ] || echo "0" > "$TRACKER_FILE"

# Is every path this command touches scoped scratch under /tmp? Conservative by
# construction: it must find at least one absolute path and ALL of them must be under
# /tmp/, so anything ambiguous (relative targets, no absolute path at all) is NOT exempt
# and falls through to normal scoring.
tmp_scratch_only() {
  local cmd="$1" paths p
  paths=$(echo "$cmd" | grep -oE '/[^[:space:];|&)"'"'"']+' || true)
  [ -n "$paths" ] || return 1

  while IFS= read -r p; do
    # A glob in the FIRST component under /tmp expands to everything in /tmp, so it is a
    # root-level delete wearing a scoped path's clothing. /tmp/tmarchy-* is fine; /tmp/* is
    # not. This case must precede the /tmp/?* test below, which would otherwise accept it.
    case "$p" in
      /tmp/\**) return 1 ;;
    esac
    case "$p" in
      /tmp/?*) ;;                      # scoped under /tmp — keep checking the rest
      *)       return 1 ;;             # touches something outside /tmp
    esac
    case "$p" in
      /tmp/otto-*|/tmp/tmux-*) return 1 ;;               # live state, not scratch
      /tmp/claude-*)
        # Our own scratchpad is scratch; a sibling session's is someone else's work.
        case "$p" in
          */"$SESSION_ID"/*|*/"$SESSION_ID") ;;
          *) return 1 ;;
        esac
        ;;
    esac
  done <<EOF
$paths
EOF
  return 0
}

# Score this command: 0 = not a deletion, or a deletion we deliberately do not charge for.
score_of() {
  if [ "$TOOL_NAME" = "Bash" ]; then
    local cmd
    cmd=$(echo "$INPUT" | jq -r '.tool_input.command // empty')
    # rm, unlink, rmdir, git rm (not grep/head, which only read)
    if echo "$cmd" | grep -qE '(^|\s|&&|\|\||;)(rm|unlink|rmdir|git rm)(\s|$)'; then
      if tmp_scratch_only "$cmd"; then echo "0"; return 1; fi
      if echo "$cmd" | grep -qE 'rm\s+(-[rRf]*[rR][rRf]*\s+)'; then echo "$SCORE_RECURSIVE"; return 0; fi
      if echo "$cmd" | grep -qE 'rm\s+(-[rRf]+\s+)?[^|;]*\*';   then echo "$SCORE_RECURSIVE"; return 0; fi
      echo "$SCORE_SINGLE"; return 0
    fi
  fi
  echo "0"; return 1
}

DELETE_SCORE=$(score_of || true)

# ── PostToolUse: the deletion actually ran, so it was approved (or auto-allowed).
# Only clear when WE asked — otherwise every successful delete would reset the score and
# it could never accumulate toward the threshold at all.
if [ "$MODE" = "post" ]; then
  if [ "$DELETE_SCORE" -gt 0 ] && [ -f "$ASKED_FLAG" ]; then
    echo "0" > "$TRACKER_FILE"
    rm -f "$ASKED_FLAG"
  fi
  exit 0
fi

# ── PreToolUse: accumulate, and ask once over the threshold.
if [ "$DELETE_SCORE" -gt 0 ]; then
  CURRENT=$(cat "$TRACKER_FILE")
  NEW_COUNT=$((CURRENT + DELETE_SCORE))
  echo "$NEW_COUNT" > "$TRACKER_FILE"

  if [ "$NEW_COUNT" -gt "$THRESHOLD" ]; then
    : > "$ASKED_FLAG"     # PostToolUse resets the score iff this exists
    jq -n --arg count "$NEW_COUNT" --arg limit "$THRESHOLD" \
          --arg rec "$SCORE_RECURSIVE" --arg one "$SCORE_SINGLE" '{
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "ask",
        permissionDecisionReason: ("Circuit breaker: deletion risk score " + $count
          + " this session (asks above " + $limit + "; recursive/wildcard deletes score "
          + $rec + ", single files " + $one + "). Confirming resets the score.")
      }
    }'
    exit 0
  fi
fi

exit 0
