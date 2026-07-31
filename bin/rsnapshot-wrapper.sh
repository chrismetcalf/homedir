#!/bin/bash
set -uo pipefail
export PATH="$HOME/bin:$PATH"

CONFIG="$HOME/.config/rsnapshot/rsnapshot.conf"
LEVEL="${1:-hourly}"
HOST="$(hostname)"

# Source pushover credentials if not in environment
if [[ -z "${PUSHOVER_APP_TOKEN:-}" ]]; then
    source ~/.config/pushover/env 2>/dev/null || true
fi

notify() {
    if command -v pushover &>/dev/null && [[ -n "${PUSHOVER_APP_TOKEN:-}" ]]; then
        pushover "$1"
    fi
}

# Otto event logging
OTTO_EVENT_URL="http://localhost:3456/events/rsnapshot"
OTTO_TOKEN="$(grep OTTO_WEBHOOK_TOKEN /opt/otto/.env 2>/dev/null | cut -d= -f2)"

otto_event() {
    if [[ -n "${OTTO_TOKEN:-}" ]]; then
        curl -sf -X POST "$OTTO_EVENT_URL" \
            -H "Authorization: Bearer $OTTO_TOKEN" \
            -H "Content-Type: application/json" \
            -d "$1" >/dev/null 2>&1 &
    fi
}

# Serialize the levels. rsnapshot's own lockfile only *detects* an overlap and
# then refuses to run, so a level that collided was simply dropped: every Monday
# the weekly rotation's ~50 min `rm -rf weekly.3` was still holding the lock when
# daily fired, and Monday's daily snapshot never happened (2026-07-13, -20, -27).
# A long hourly does the same thing less predictably — one ran 10 h on 2026-07-01
# and took out that night's daily and the next hourly. Waiting for the lock turns
# a dropped backup into a late one; only give up if the wait itself is absurd,
# which means something is genuinely wedged and is worth a page.
LOCK="$HOME/.local/run/rsnapshot.flock"
LOCK_WAIT="${RSNAPSHOT_LOCK_WAIT:-7200}"
mkdir -p "$(dirname "$LOCK")"

WAIT_START=$(date +%s)
exec 9>"$LOCK"
if ! flock -w "$LOCK_WAIT" 9; then
    notify "✗ rsnapshot $LEVEL on $HOST: gave up after waiting ${LOCK_WAIT}s for the lock"
    otto_event "{\"type\":\"backup.lock_timeout\",\"level\":\"$LEVEL\",\"host\":\"$HOST\",\"waited_s\":$LOCK_WAIT}"
    exit 75
fi
LOCK_WAITED=$(( $(date +%s) - WAIT_START ))
[[ $LOCK_WAITED -gt 60 ]] && echo "waited ${LOCK_WAITED}s for the rsnapshot lock" >&2

START_TIME=$(date +%s)

rsnapshot -c "$CONFIG" "$LEVEL"
EXIT_CODE=$?
DURATION=$(( $(date +%s) - START_TIME ))

case $EXIT_CODE in
    0)
        otto_event "{\"type\":\"backup.completed\",\"level\":\"$LEVEL\",\"host\":\"$HOST\",\"duration_s\":$DURATION}"
        ;;
    2)
        # rsnapshot exit 2 = completed with warnings (e.g., unreadable files). Backup ran; don't page.
        otto_event "{\"type\":\"backup.completed_with_warnings\",\"level\":\"$LEVEL\",\"host\":\"$HOST\",\"duration_s\":$DURATION}"
        ;;
    *)
        notify "✗ rsnapshot $LEVEL FAILED on $HOST (exit $EXIT_CODE)"
        otto_event "{\"type\":\"backup.failed\",\"level\":\"$LEVEL\",\"host\":\"$HOST\",\"exit_code\":$EXIT_CODE,\"duration_s\":$DURATION}"
        ;;
esac

exit $EXIT_CODE
