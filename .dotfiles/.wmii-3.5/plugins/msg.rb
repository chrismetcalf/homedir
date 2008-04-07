Plugin.define "temporaer at gmx dot de" do
  author '"Hannes Schulz" '
  lastmsgstr = "";
  important_tags = [ "remind", "system" ]     # Importance adjust to your needs
  max_msg_len    = 30                                   # adjust to your needs

  bar_applet("msgs", 50) do |wmii, bar|
    update_msgs = lambda do |val|
      tagscnt  = Hash.new();
      tagslast = Hash.new();
      tagscnt.default=0;

      ret = ""
      importance = 0;

      if !File.exist?(ENV['HOME'] + "/.events")
	ret = "nothing"
      else
	File.open(ENV['HOME'] + "/.events","r").each{ |line|
	  line.chomp!
	  next unless line =~ /^\w+\s+.+$/
	    tag = /^(\w+)\s/.match(line)[1]
	  msg = /^\w+\s+(.*)$/.match(line)[1]
	  msg.chop! while msg.length>max_msg_len
	  tagscnt[tag]  += 1
	  tagslast[tag]  = msg
	  importance += 1 if important_tags.include?(tag)
	}
	ret = ret+
	  tagscnt.collect { |key, value|
	  value.to_s + " " + key + ": "+ tagslast[key]
	}.join("; ")
      end
      colors = bar.colors
      if ret == "nothing"
	colors[1][0] = 28
	colors[1][1] = 85
	colors[1][2] = 119
      elsif importance > 0
	colors[1][0] = 255
	colors[1][1] = 130
	colors[1][2] = 0
      elsif ret == lastmsgstr
	colors[1][0] = 100
	colors[1][1] = 221
	colors[1][2] = 100
      else
	colors[1][0] = 255
	colors[1][1] = 0
	colors[1][2] = 0
      end
      bar.colors = colors
      lastmsgstr = ret
      bar.data = ret
    end
    Thread.new { loop { update_msgs[0] ; sleep 2 } }
    bar.on_click(MOUSE_BUTTON_LEFT) do
      system "wmiisetsid xmessage -file ~/.events &"
    end
    bar.on_click(MOUSE_BUTTON_RIGHT) do
      system("rm ~/.events")
      update_msgs[0]
    end
  end
end
