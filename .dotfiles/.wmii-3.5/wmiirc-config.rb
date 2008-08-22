# {{{ ======== ruby-wmii CONFIGURATION BEGINS HERE ==============
 
# Set the log level
# It defaults to Logger::INFO.
# Set to Logger::DEBUG for extra verbosity.
LOGGER.level = Logger::INFO

# programs to run when wmiirc starts
# one per line, they're run sequentially right before the main loop begins
START_PROGS = <<EOF
xsetroot -solid '#003333'
xscreensaver -nosplash &
EOF

# {{{ WM CONFIGURATION
WMII::Configuration.define do
  border      1
  font        "fixed"
  focuscolors '#888888 #222222 #333333'
  normcolors  '#ffffff #285577 #4c7899'
  grabmod     'Mod1'
  rules <<EOF
/gvim:.*/ -> gvim
/pidgin:.*/ -> pidgin
/xchat:.*/ -> xchat
/gecko:.*/ -> web
/Iceweasel/ -> web
/XMMS.*/ -> ~
/Gimp.*/ -> ~
/MPlayer.*/ -> ~
/XForm.*/ -> ~
/XSane.*/ -> ~
/fontforge.*/ -> ~
/luvcview:.*/ -> ~
/.*/ -> !
/.*/ -> 1
EOF

  # Translate the following names in the on_key and use_binding definitions.
  key_subs  :MODKEY  => :Mod1,
            :MODKEY2 => :Mod4,
            :LEFT    => :h,
            :RIGHT   => :l,
            :UP      => :k,
            :DOWN    => :j

  # Constant used by the intellisort tag selection mechanism
  # set it to   0.0 <= value <= 1.0
  # Lower values make recent choices more likely (modified first order
  # markovian process with exponential decay):
  # 0.0 means that only the last transition counts (all others forgotten)
  # 1.0 means that the probabilities aren't biased to make recent choices more
  #     likely
  view_history_decay 0.8

  # Favor the view we came from in intellisort.
  # 1.0: that view is the first choice
  # 0.0: that view comes after all views with non-zero transition probability,
  #      but before all views we haven't yet jumped to from the current one
  view_history_prev_bias 0.4

  dmenu_options %(-b -fn "#{font}" -nf "#{normcolors.split[0]}" -nb "#{normcolors.split[1]}" -sf "#{focuscolors.split[0]}" -sb "#{focuscolors.split[1]}")

  # {{{ Plugin config
  plugin_config["standard:status"]["refresh_time"] = 5
  plugin_config["standard"]["x-terminal-emulator"] = "x-terminal-emulator"
  plugin_config["standard:actions"]["history_size"] = 3  # set to 0 to disable
  plugin_config["standard:programs"]["history_size"] = 5 # set to 0 to disable
  plugin_config["standard:volume"]["mixer"] = "PCM"

  # Allows you to override the default internal actions and define new ones:
  plugin_config["standard:actions"]["internal"].update({
    "lock" => lambda do |wmii, *args|
      system "xscreensaver-command -lock"
    end,
    "hibernate" => lambda do |wmii, *args|
      system "sudo s2disk"
    end

  })

  # {{{ Import bindings and bar applets
  from "standard"  do
    use_feature "tag-bar"

    use_binding "dict-lookup"
    use_binding "execute-program-with-tag"
    use_binding "execute-action"
    use_binding "execute-program"
    (0..9).each{|k| use_binding "numeric-jump-#{k}"  }
    use_binding "detag"
    use_binding "tag-jump"
    use_binding "retag"
    use_binding "retag-jump"
    use_binding "namespace-retag"
    use_binding "namespace-retag-jump"
    (('a'..'z').to_a+('0'..'9').to_a).each{|k| use_binding "letter-jump-#{k}" }
    (0..9).each{|k| use_binding "numeric-retag-#{k}" }
    (('a'..'z').to_a+('0'..'9').to_a).each{|k| use_binding "letter-retag-#{k}" }
    use_binding "move-prev"
    use_binding "move-next"
    use_binding "namespace-move-prev"
    use_binding "namespace-move-next"
    use_binding "history-move-forward"
    use_binding "history-move-back"

    use_binding "bookmark"
    use_binding "bookmark-open"
    use_feature "bookmark:actions"
  end

  # {{{ del.icio.us bookmark import
  plugin_config["standard:bookmark"]["del.icio.us-user"] = 'krezel'
  plugin_config["standard:bookmark"]["del.icio.us-password"] = 'hjui89'

  # {{{ Tag all browser instances as 'web' in addition to the current tag
  browsers = %w[Firefox Konqueror Iceweasel]
  browser_re = /^#{browsers.join("|")}/
  on_createclient(condition{|c| browser_re =~ read("/client/#{c}/props")}) do |cid|
    write("/client/#{cid}/tags", "+web")
  end

  # {{{ Simpler key bindings --- not defined in plugins
  on_key("MODKEY-LEFT"){ write "/tag/sel/ctl", "select left" }
  on_key("MODKEY-RIGHT"){ write "/tag/sel/ctl", "select right" }
  on_key("MODKEY-DOWN"){ write "/tag/sel/ctl", "select down" }
  on_key("MODKEY-UP"){ write "/tag/sel/ctl", "select up" }
  on_key("MODKEY-space"){ write "/tag/sel/ctl", "select toggle" }
  on_key("MODKEY-d"){ write "/tag/sel/ctl", "colmode sel default" }
  on_key("MODKEY-s"){ write "/tag/sel/ctl", "colmode sel stack" }
  on_key("MODKEY-m"){ write "/tag/sel/ctl", "colmode sel max" }
  on_key("MODKEY-Return") do 
    term = plugin_config["standard"]["x-terminal-emulator"] || "xterm"
    system "#{term} &"
  end
  on_key("MODKEY-Shift-LEFT"){ write "/tag/sel/ctl", "send sel left" }
  on_key("MODKEY-Shift-RIGHT"){ write "/tag/sel/ctl", "send sel right" }
  on_key("MODKEY-Shift-DOWN"){ write "/tag/sel/ctl", "send sel down" }
  on_key("MODKEY-Shift-UP"){ write "/tag/sel/ctl", "send sel up" }
  on_key("MODKEY-Shift-space"){ write "/tag/sel/ctl", "send sel toggle" }
  on_key("MODKEY-Shift-c"){ write "/client/sel/ctl", "kill" }
  on_key("MODKEY-r"){ view prev_view }
  on_key("MODKEY-Control-LEFT") { write "/tag/sel/ctl", "swap sel left" }
  on_key("MODKEY-Control-RIGHT"){ write "/tag/sel/ctl", "swap sel right" }

  from "yubnub" do
    use_binding "menu"
  end

  plugin_config["mail:imap"]["host"] = 'imap.gmail.com'
  plugin_config["mail:imap"]["boxes"] = ['INBOX']
  plugin_config["mail:imap"]["summarize_at"] = 3
  plugin_config["mail:imap"]["user"] = 'chrismetcalf'
  plugin_config["mail:imap"]["pass"] = 'statle69'
  plugin_config["mail:imap"]["use_ssl"] = true
  from "mail" do
     use_bar_applet "imap", 440
  end

  # Tempmon Config
  plugin_config["sysmon:tempmon"]["file"] = "/proc/eee/temperature"
  plugin_config["sysmon:tempmon"]["label"] = "cpu"
  plugin_config["sysmon:tempmon"]["interval"] = 5 
  plugin_config["sysmon:tempmon"]["warning"] = 65 
  plugin_config["sysmon:tempmon"]["emergency"] = 68

  # Wireless config
  plugin_config["sysmon:wireless"]["interface"] = "ath0"
  plugin_config["sysmon:wireless"]["interval"] = 5
  plugin_config["sysmon:wireless"]["trunc_essid"] = 3

  # Battery config
  plugin_config["sysmon:battery"]["warning"] = 20
  plugin_config["sysmon:battery"]["critical"] = 10 
  from "sysmon" do
    use_bar_applet "tempmon", 900 
    use_bar_applet "wireless", 900 
    use_bar_applet "battery", 900 
    use_bar_applet "loadlevel", 950
  end

  from "temporaer at gmx dot de" do
    use_bar_applet "msgs"
  end

  # {{{ ======== CONFIGURATION ENDS HERE ==============
end
