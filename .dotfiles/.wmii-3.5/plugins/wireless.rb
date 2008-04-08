Plugin.define "wireless" do
  author '"Lucas Luitjes" <lucas@mindrules.net>'
  bar_applet("wireless", 501) do |wmii, bar|
    Thread.new do
      interface = wmii.plugin_config["wireless:wireless"]["interface"]
      interval = wmii.plugin_config["wireless:wireless"]["interval"] || 5
      loop do
        output = `sudo iwconfig #{interface}`

        status = output.scan(/Quality=(\d+\/\d+)/)[0]
        essid = output.scan(/ESSID:"(\w+)"/)[0]

        if status == nil || status.empty?
          status = '--/--'
        end

        if essid == nil || essid.empty?
          essid = '-'
        end

        bar.data = "#{essid}:#{status}"
        sleep interval
      end
    end
  end
end

