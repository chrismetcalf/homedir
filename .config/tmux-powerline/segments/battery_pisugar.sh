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
    # Get clean numeric battery percentage from "battery: 73.428"
    battery_raw=$(send_command "get battery")
    battery_percentage=$(echo "$battery_raw" | awk -F': ' '{ split($2, parts, "."); print parts[1] }' | tr -cd '[:digit:]')

    # Get and parse charging status
    charging_raw=$(send_command "get battery_charging")
    charging_status=$(echo "$charging_raw" | awk -F': ' '{print tolower($2)}' | tr -cd 'a-zA-Z')

    # Determine the icon based on charging status and battery percentage
    if [[ "$charging_status" == "true" ]]; then
        charging_icon=" "
    else
        charging_icon=""
    fi

    if (( battery_percentage > 99 && "$charging_status" == "true" )); then
        icon=""
    elif (( battery_percentage > 98 )); then
        icon="󰁹"
    elif (( battery_percentage > 80 )); then
        icon="󰂁"
    elif (( battery_percentage > 60 )); then
        icon="󰁿"
    elif (( battery_percentage > 40 )); then
        icon="󰁽"
    elif (( battery_percentage > 20 )); then
        icon="󰁻"
    else
        icon="󱃍"
    fi

    # Output the icon and battery percentage
    echo "$charging_icon$icon $battery_percentage%"
    exit 0
}
