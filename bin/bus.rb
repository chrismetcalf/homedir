#!/usr/bin/env ruby
require 'rubygems'
require 'hpricot'
require 'open-uri'

unless (ARGV[0] && ARGV[1] && ARGV[2])
  puts "Usage: ./bustimes.rb <location> <route> <regexp>"
  puts "   <location>  ID from http://tracker-loc.metrokc.gov/region.jsp?region=Seattle"
  puts "   <route> Route number"
  puts "   <regexp> Regular expression to match description of route"
  puts
  puts "Example: ./bustimes.rb 306 3 Union"
  exit 1
end

now = Time.now
startTime = Time.local(now.year, now.month, now.day, 16, 00, 00)
endTime   = Time.local(now.year, now.month, now.day, 21, 00, 00)

if (startTime > now || now > endTime)
 puts "Not time to leave yet"
 exit 0
end


doc = Hpricot(open("http://tracker-loc.metrokc.gov/avl.jsp?id=#{ARGV[0]}"))

routeTable = doc.search('table[@width="500"] table')
routeTable.search('tr:gt(0)') do |tr|
 route = tr.search('td:first').inner_text
 desc = tr.search('td:eq(1)').inner_text
 time = tr.search('td:eq(2)').inner_text
 delay = tr.search('td:eq(3)').inner_text
 puts "#{route} #{desc} #{time} #{delay}" if route == "#{ARGV[1]}" and desc =~ Regexp.new(ARGV[2]) 
end