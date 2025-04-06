#!/usr/bin/env bash
# PiSugar server host and port
HOST="127.0.0.1"
PORT="8423"

# Function to send a command to the PiSugar server and retrieve the response
send_command() {
    local command=$1
    echo "$command" | nc -q 0 "$HOST" "$PORT"
}

run_segment() {
    # Retrieve battery percentage (strip everything but the number)
    battery_raw=$(send_command "get battery")
    battery_percentage=$(echo "$battery_raw" | grep -o '[0-9]\+')

    # Retrieve charging status
    charging_raw=$(send_command "get battery_charging")
    charging_status=$(echo "$charging_raw" | grep -o '[0-9]\+')

    # Determine the icon based on charging status and battery percentage
    if [[ "$charging_status" == "1" ]]; then
        icon="" # Charging
    elif (( battery_percentage > 80 )); then
        icon="🔋"
    elif (( battery_percentage > 60 )); then
        icon="🔋"
    elif (( battery_percentage > 40 )); then
        icon="🔋"
    elif (( battery_percentage > 20 )); then
        icon="🔋"
    else
        icon="🪫"
    fi

    # Output the icon and battery percentage
    echo "$icon $battery_percentage%"
    exit 0
}

