#!/usr/bin/env bash
# TMUX_POWERLINE_SEG_CPU_TEMP_SCRIPT

get_cpu_temp() {
    # Raspberry Pi (vcgencmd)
    if command -v vcgencmd >/dev/null 2>&1; then
        temp_raw=$(vcgencmd measure_temp 2>/dev/null)
        # Example: temp=53.2'C
        echo "$temp_raw" | grep -o "[0-9.]\+" | cut -d'.' -f1
        return
    fi

    # Linux thermal zone (e.g., /sys/class/thermal/thermal_zone0/temp)
    if [[ -f /sys/class/thermal/thermal_zone0/temp ]]; then
        temp_raw=$(cat /sys/class/thermal/thermal_zone0/temp)
        echo $((temp_raw / 1000))
        return
    fi

    # No temperature source found
    echo "?"
}

run_segment() {
    temp_celsius=$(get_cpu_temp)
    echo -n "🌡️ ${temp_celsius}°C"
}
