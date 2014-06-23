# Prints current status of doing, if available

run_segment() {
  # Skip if we don't have doing
  type doing >/dev/null 2>&1
  if [ "$?" -ne 0 ]; then
    return
  fi

  local tmp_file="${TMUX_POWERLINE_DIR_TEMPORARY}/status.txt"
  local status

  if [ -f "$tmp_file" ]; then
    if shell_is_osx || shell_is_bsd; then
      last_update=$(stat -f "%m" ${tmp_file})
    elif shell_is_linux; then
      last_update=$(stat -c "%Y" ${tmp_file})
    fi

    time_now=$(date +%s)
    update_period=10
    up_to_date=$(echo "(${time_now}-${last_update}) < ${update_period}" | bc)

    if [ "$up_to_date" -eq 1 ]; then
      status=$(cat ${tmp_file})
    fi
  fi

  if [ -z "$status" ]; then
    status=$(doing last)

    if [ "$?" -eq "0" ]; then
      echo "${status}" > $tmp_file
    elif [ -f "${tmp_file}" ]; then
      status=$(cat "$tmp_file")
    fi
  fi

  if [ -n "$status" ]; then
    echo "◴ ${status}"
  fi

  return 0
}

