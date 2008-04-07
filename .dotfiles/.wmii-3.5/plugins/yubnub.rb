#
# Small yubnub plugin for ruby-wmii. <http://eigenclass.org/hiki.rb?wmii+ruby>
# yubnub is a "social command line for the web"
# see <http://www.yubnub.org>
#
# Released under the same terms given in ruby-wmii's LICENSE file
#
#
# This plugin currently only lets you fire up yubnub commands in your browser, and saves the commands ordered by the most used.
#
# To use the plugin, place this in your wmiirc-config.rb
#    from "yubnub" do
#      use_binding "menu"
#    end
#
# The default binding is MOD-y
#
# USAGE:
#   press mod-y, type (or select a previously used) command. 
#   you can supply the arguments directly, or
#   if you do not supply arguments, another menu will pop up after that
# 
# EXAMPLE 
#   press mod-y
#   type "wp"
#   enter
#   type "ruby"
#   enter
#   => your browser will execute the yubnub command "wp ruby" which will lead you to wikipedia's ruby article :-)
#   (you could have also just typed wp ruby in the first menu)
#
#   
#
# Configuration:
#   - plugin_config["yubnub:menu"]["on_command_executed"] = lambda { |wmii| ... }
#     the block given is called when a yubnub command-url is opened
#     I use it to switch to my browser's workspace
#   - plugin_config["yubnub:menu"]["browser"]
#     to set your browser, defaults to "x-www-browser"
#   - plugin_config["yubnub:menu"]["save_history_interval"]
#     in seconds, defaults to 300sec (5 minutes) 
#     
#
# TODO:
#   - using pipes
#   - getting a complete command list from yubnub
#   - manual pages
#
#


Plugin.define "yubnub"  do
  author '"Thomas Neumann" <neumann.thomas@gmail.com>'

  binding("menu", "MODKEY-y") do |wmii,|
    wmii.plugin_config["yubnub:menu"]["browser"] ||= "x-www-browser"
    wmii.plugin_config["yubnub:menu"]["on_command_executed"] ||= lambda {}

    # load history if needed
    @history_file ||= File.join(ENV["HOME"], ".wmii-3", "yubnub_history.txt")
    @history ||= {}
    if @history.empty? && File.exists?(@history_file)
      File.open(@history_file, 'r') do |file|
        file.each_line do |line|
          cmd, uses = line.split(' ')
          @history[cmd] = uses.to_i
        end
      end
    end

    Thread.new do
      # get sorted list for menu
      menu_items = @history.sort {|a,b| b[1] <=> a[1]}
      menu_items.collect! {|x| "#{x[0]}(#{x[1]})" }
      # block until command input
      choice = wmii.wmiimenu(menu_items).value
      return if choice == ""
      # selected or typed in directly?
      cmd = (menu_items.include? choice) ?  choice.split('(', 2).first : choice
      # find arguments
      cmd, args = cmd.split(' ',2)

      # arguments missing? call another menu 
      args ||= wmii.wmiimenu([]).value

      # add the command to the history and increment use cound
      @history[cmd] ||= 0
      @history[cmd] += 1

      LOGGER.info "yubnub: #{cmd} #{args}"
      # start browser
      system "wmiisetsid #{wmii.plugin_config["yubnub:menu"]["browser"]} 'http://www.yubnub.org/parser/parse?command=#{cmd} #{args}' &"

      wmii.plugin_config["yubnub:menu"]["on_command_executed"].call(wmii)
    end

    @history_save_thread ||= Thread.new do 
        loop do
          sleep wmii.plugin_config["yubnub:menu"]["save_history_interval"] || 300
          LOGGER.info "saving yubnub history"
          # save history
          File.open(@history_file, File::CREAT|File::TRUNC|File::RDWR) do |file|
            @history.each do |cmd, uses| 
              file.puts "#{cmd} #{uses}"
            end
          end
      end
    end
  end

end
