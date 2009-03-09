Plugin.define "sysmon" do
  author '"Chris Metcalf" <chris@chrismetcalf.net>'

  # Temperature monitor
  bar_applet("tempmon", 501) do |wmii, bar|
    Thread.new do
      # A file that will be polled for system temperature and a regex that will
      # be appied to make it into an integer
      file = wmii.plugin_config["sysmon:tempmon"]["file"]
      regex = wmii.plugin_config["sysmon:tempmon"]["regex"] || ""

      # The label for this monitor
      label = wmii.plugin_config["sysmon:tempmon"]["label"] || "temp"

      # Notification options. If you're using the msg plugin, specify the
      # filename to append to. Otherwise, specify "nil" and xmessage will be
      # used instead
      msg_filename = wmii.plugin_config["sysmon:tempmon"]["msg_filename"] || nil

      # Warning and Emergency temperature levels and their messages
      warning = wmii.plugin_config["sysmon:tempmon"]["warning"] || 62
      emergency = wmii.plugin_config["sysmon:tempmon"]["emergency"] || 64 

      # How often to poll for temperature
      interval = wmii.plugin_config["sysmon:tempmon"]["interval"] || 5

      # Commands to run on left or right click
      on_left_click = wmii.plugin_config["sysmon:tempmon"]["on_left_click"]
      on_right_click = wmii.plugin_config["sysmon:tempmon"]["on_right_click"]

      # Save the original color of the bar
      orig_color = bar.colors

      loop do
        output = `cat #{file}`.chomp.to_i

        if output >= emergency
          # EMERGENCY!!
          c = bar.colors
          c[1][0] = 255
          c[1][1] = 0
          c[1][2] = 0
          bar.colors = c

          system "echo 'system Temperature Critical!' >> ~/.events"
        elsif output >= warning
          # Warning!
          c = bar.colors
          c[1][0] = 255
          c[1][1] = 130
          c[1][2] = 0
          bar.colors = c
        else
          bar.colors = orig_color
        end

        bar.data = "#{label}:#{output}"
        sleep interval
      end

      bar.on_click(MOUSE_BUTTON_LEFT) do
        LOGGER.info "Left clicked #{on_left_click}"  
      end
    end
  end # Temp monitor

  # Improved wireless monitor
  bar_applet("wireless", 501) do |wmii, bar|
    Thread.new do
      interface = wmii.plugin_config["sysmon:wireless"]["interface"]
      trunc_essid = wmii.plugin_config["sysmon:wireless"]["trunc_essid"] || 0
      interval = wmii.plugin_config["sysmon:wireless"]["interval"] || 5
      loop do
        output = `sudo iwconfig #{interface}`

        status = output.scan(/Quality=(\d+\/\d+)/)[0]
        essid = output.scan(/ESSID:"(\w+)"/)[0].to_s

        if status == nil || status.empty?
          status = '--/--'
        end

        if essid != nil && !essid.empty? && trunc_essid > 0 
          essid = essid.slice(0, trunc_essid) 
          essid += "~"
        end

        if essid == nil || essid.empty?
          essid = '-'
        end

        bar.data = "#{essid}:#{status}"
        sleep interval
      end
    end

    bar.on_click(MOUSE_BUTTON_LEFT) do
      system "sudo wpa_gui"
    end
  end

  # Battery
  bar_applet("battery", 950) do |wmii, bar|
    batt_cmd = wmii.plugin_config["sysmon:battery"]["batt_cmd"] || 'acpi'
    warning = wmii.plugin_config["sysmon:battery"]["warning"] || 5
    critical = wmii.plugin_config["sysmon:battery"]["critical"] || 1
    interval = wmii.plugin_config["sysmon:battery"]["interval"] || 5

    # For safekeeping
    orig_color = bar.colors

    Thread.new do
      loop do
        state = `#{batt_cmd}`
        status, percent = state.scan(/Battery \d: (\w+), (\d+)%/)[0]

        # Take action in case battery is low/critical
        if status == "Discharging" && percent.to_i <= critical
          # Change bar colors
          c = bar.colors
          c[1][0] = 255
          c[1][1] = 0
          c[1][2] = 0
          bar.colors = c

          system "echo 'system Battery Critical!' >> ~/.events"
        elsif status == "Discharging" && percent.to_i <= warning 
          c = bar.colors
          c[1][0] = 255
          c[1][1] = 130
          c[1][2] = 0
          bar.colors = c
        else
          # All is OK
          bar.colors = orig_color
        end

        # If percent is 100 and state is discharging then
        # the battery is full and not discharging.
        case status
        when "Full"
          icon = "="
        when "Discharging"
          icon = "v"
        when "Charging"
          icon = "^"
        else
          icon = "?"
        end

        bar.data = "#{icon}:#{percent}"

        sleep interval
      end
    end
  end

  # Load 
  bar_applet("loadlevel", 950) do |wmii, bar|
    warning = wmii.plugin_config["sysmon:loadlevel"]["warning"] || 2
    critical = wmii.plugin_config["sysmon:loadlevel"]["critical"] || 4
    interval = wmii.plugin_config["sysmon:loadlevel"]["interval"] || 1
    orig_color = bar.colors

    Thread.new do
      loop do
        one, five, fifteen = `uptime`.scan(/average: (\d+.\d+), (\d+.\d+), (\d+.\d+)/)[0];

        if one.to_i >= critical
          # Change bar colors
          c = bar.colors
          c[1][0] = 255
          c[1][1] = 0
          c[1][2] = 0
          bar.colors = c
        elsif one.to_i >= warning
          c = bar.colors
          c[1][0] = 255
          c[1][1] = 130
          c[1][2] = 0
          bar.colors = c
        else
          # All is OK
          bar.colors = orig_color
        end

        bar.data = "#{one}"
        sleep interval
      end
    end

    bar.on_click(MOUSE_BUTTON_LEFT) do
      system "x-terminal-emulator htop"
    end
  end

end

