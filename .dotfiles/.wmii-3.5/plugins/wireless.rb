Plugin.define "wireless" do
  author '"Lucas Luitjes" <lucas@mindrules.net>'
  bar_applet("wireless", 501) do |wmii, bar|
    Thread.new do
      interface = wmii.plugin_config["wireless:wireless"]["interface"]
      interval = wmii.plugin_config["wireless:wireless"]["interval"] || 5
      loop do
        output = `sudo iwconfig #{interface}`

        status = output.scan(/Quality=\d+\/\d+/).to_s.sub('Quality=','')
        essid = output.scan(/ESSID:"\w+"/).to_s.sub('Quality=','')
        
        if status.empty?
          status = '--/--'
        end
        bar.data = "W:#{status}"
        sleep interval
      end
    end
  end
end

