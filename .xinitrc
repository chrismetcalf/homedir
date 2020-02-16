xrdb -merge $HOME/.Xresources

/usr/bin/trayer --edge top --align right --SetDockType true --SetPartialStrut true --expand true --width 10 --transparent true --tint 0x191970 --height 12 &

/usr/bin/kitty &

#exec /usr/bin/xmonad
exec /usr/bin/xmonad
