#
# An IMAP and POP plugin for ruby-wmii.  <http://eigenclass.org/hiki.rb?wmii+ruby>
# This is released under the same terms given in ruby-wmii's LICENSE file.
#
# Save this script to ~/.wmii-3/plugin/.  Add a few lines to your wmiirc-config.rb:
#
# 1. Add the bar applets you want.
#
#   from "mail" do
#     use_bar_applet "imap", 440
#     use_bar_applet "pop", 441
#   end
#
# 2. Add plugin_config settings. 
#
#   # Required IMAP settings
#   plugin_config["mail:imap"]["host"] = 'imap.yourhost.com'
#   plugin_config["mail:imap"]["boxes"] = ['INBOX', 'INBOX.IN.%']
#   plugin_config["mail:imap"]["summarize_at"] = 3
#   plugin_config["mail:imap"]["user"] = 'mail-user'
#   plugin_config["mail:imap"]["pass"] = 'mail-password'
#   plugin_config["mail:imap"]["use_ssl"] = true
#
#   # Optional IMAP settings
#   # format:: provides a hash of {box_name => count}, you return a string for the bar
#   plugin_config["mail:imap"]["format"] = proc { |boxes| boxes.inspect }
#   # summarize_at:: if more than N mailboxes is found, just display the total of all
#   plugin_config["mail:imap"]["summarize_at"] = 3
#   # refresh_time:: seconds to sleep between checks (default: 60)
#   plugin_config["mail:imap"]["refresh_time"] = 120
#   # certs:: where to find the server's CA cert
#   plugin_config["mail:imap"]["certs"] = "/etc/ssl/certs" 
#
#   # Required POP settings
#   plugin_config["mail:pop"]["host"] = 'pop.yourhost.com'
#   plugin_config["mail:pop"]["user"] = 'mail-user'
#   plugin_config["mail:pop"]["pass"] = 'mail-password'
#
#   # Optional IMAP settings
#   # format:: provides a total messages number to the proc, you return a string for the bar
#   plugin_config["mail:imap"]["format"] = proc { |boxes| boxes.inspect }
#   # refresh_time:: seconds to sleep between checks (default: 60)
#   plugin_config["mail:imap"]["refresh_time"] = 120
#
# Pay attention to wmiirc.log while setting this up.  Exceptions will be thrown
# as ERROR entries associated with mail:imap or mail:pop.
#
Plugin.define "mail" do
  author '"why the lucky stiff" <why@whytheluckystiff.net>'

  #{{{ POP menu bar
  bar_applet("pop", 440) do |wmii, bar|
    Thread.new do
      bar.data = "mail"
      conf = wmii.plugin_config["mail:pop"]
      loop do
        begin
          require 'net/pop'
          pop = Net::POP3.new(conf['host'])
          pop.start(conf['user'], conf['pass'])
          total = pop.n_mails
          bar.data = 
            if conf['format']
              conf['format'].call(total)
            else
              if total > 0
                "mail:#{total}"
              else
                "mail"
              end
            end
        rescue Exception => e
          bar.data = "x"
          LOGGER.error("[mail:pop] plugin threw an error -- #{e.class}: #{e.message}")
        end
        sleep(conf['refresh_time'] || 60)
      end
    end
  end

  #{{{ IMAP menu bar
  bar_applet("imap", 441) do |wmii, bar|
    Thread.new do
      bar.data = "mail"
      conf = wmii.plugin_config["mail:imap"]
      loop do
        begin
          require 'net/imap'
          imap = Net::IMAP.new(conf['host'], conf['use_ssl'] ? 993 : 143, conf['use_ssl'], conf['certs'])
          imap.login(conf['user'], conf['pass'])
          prefixes = []
          boxes = conf['boxes'].inject([]) do |ary, box|
            if box =~ /%/
              prefix = /^#{Regexp.quote($`)}/
              ary += imap.list("", box).map { |x| [x.name, x.name.gsub(prefix, '')] }
            else
              ary << [box, box.split('.').last]
            end
            ary
          end
          stats = boxes.inject({}) do |hsh, (box, short)|
            begin
              count = imap.status(box, ['UNSEEN'])['UNSEEN']
              hsh[short] = count if count > 0
            rescue Net::IMAP::NoResponseError
            end
            hsh
          end
          bar.data = 
            if conf['format']
              conf['format'].call(stats)
            else
              total = stats.values.inject(0) { |i,x| i+x }
              if conf['summarize_at'].to_i == 0 or (1..conf['summarize_at'].to_i).include? stats.size
                stats.sort.map { |k,v| "#{k.downcase}:#{v}" }.join(' ')
              else
                "mail:#{total}"
              end
            end
        rescue Exception => e
          bar.data = "x"
          LOGGER.error("[mail:pop] plugin threw an error -- #{e.class}: #{e.message}")
        end
        sleep(conf['refresh_time'] || 60)
      end
    end
  end
end
