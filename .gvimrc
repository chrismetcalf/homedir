" Chris Metcalf (chris@chrismetcalf.net)
" gvim config file

" Get rid of "chrome" 
set guioptions=cR

" set the X11 font to use. See 'man xlsfonts' on unix/linux
" set guifont=-monotype-impact-medium-r-condensed--0-0-0-0-p-0-iso8859-1

" Hide the mouse pointer while typing
set mousehide

" Source local config
if filereadable("$HOME/.gvimrc.local")
  source $HOME/.gvimrc.local
end
