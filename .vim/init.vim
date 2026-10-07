" Neovim entry point.
"
" A real file sourcing ~/.vimrc, not a symlink to it. The old
" `.vim/init.vim -> ../../.vimrc` resolved relative to the LINK, so it only
" landed on the right file while this repo was checked out at exactly
" ~/.homedir -- and it silently pointed at whatever ~/.vimrc happened to be,
" which on this host was a standalone copy from Nov 2025 that predated the
" OSC 52 provider, the tmarchy theme hook and `set undofile`. nvim loaded that
" copy for months while the repo tracked a newer one. A `source` is
" location-independent and names its target explicitly.
"
" ~/.vimrc is a gitfix symlink to this repo. Keep it that way: a real file
" there is exactly the drift this replaced.

source ~/.vimrc
