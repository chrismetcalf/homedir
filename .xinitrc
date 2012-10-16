xrdb -merge $HOME/.Xresources
PATH=/usr/local/bin:$PATH
xsetroot -solid '#4a525a'
xmodmap -e 'remove Mod2 = Meta_L' -e 'add Mod1 = Meta_L' &

xmobar &
exec $HOME/.cabal/bin/xmonad
