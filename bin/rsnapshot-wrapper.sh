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

START_TIME=$(date +%s)

rsnapshot -c "$CONFIG" "$LEVEL"
EXIT_CODE=$?
DURATION=$(( $(date +%s) - START_TIME ))

case $EXIT_CODE in
    0)
        notify "✓ rsnapshot $LEVEL completed on $HOST"
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
