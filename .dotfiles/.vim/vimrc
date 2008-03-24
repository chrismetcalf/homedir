" Vim
" An example for a gvimrc file.
" The commands in this are executed when the GUI is started.
"
" To use it, copy it to
"     for Unix and OS/2:  ~/.gvimrc
"             for Amiga:  s:.gvimrc
"  for MS-DOS and Win32:  $VIM\_gvimrc


" Runtime directories
"set runtimepath=~/.vim,/etc/vim,/usr/share/vim/vimfiles
"set runtimepath+=/usr/share/vim/addons,/usr/share/vim/vim61
"set runtimepath+=/usr/share/vim/vimfiles/after,~/.vim/after

" Make external commands work through a pipe instead of a pseudo-tty
"set noguipty

" Highly recommended to set tab keys to 4 spaces
set smarttab
set shiftwidth=2
set autoindent
set expandtab

" The opposite is 'set wrapscan' while searching for strings....
set nowrapscan

" Wrap at whitespace instead of the middle of a word.
set linebreak

" Time to wait before matching parens (tenths of seconds)
set matchtime=1

" The opposite is set noignorecase
set ignorecase

" You may want to turn off the beep sounds (if you want quite) with visual bell
set vb

" Make command line two lines high
set ch=3

" Make shift-insert work like in Xterm
map <S-Insert> <MiddleMouse>
map! <S-Insert> <MiddleMouse>

" I like highlighting strings inside C comments
let c_comment_strings=1

" Switch on syntax highlighting.
syntax on

" Switch on search pattern highlighting.
set hlsearch


" Hide the mouse pointer while typing
set mousehide

" Set nice colors
colorscheme oceanblack

filetype plugin indent on

"Shows the current editing mode
set showmode

"Show line numbers
set number

"Show the ruler
set ruler

"Highlight all matches
set hlsearch

"Show search while typing
set incsearch

"Show tabs as >-
set list
set listchars=tab:>-,trail:-

"Make backup files end in .bak instead of ~
set backupext=.bak

" Super nifty tab function
function! CleverTab()
  if strpart( getline('.'), 0, col('.')-1 ) =~ '^\s*$'
    return "\<Tab>"
  else
    return "\<C-N>"
  endfunction
inoremap <Tab> <C-R>=CleverTab()<CR>

let Tlist_Ctags_Cmd='/usr/bin/ctags-exuberant'

" Devel commands
nnoremap <F5> :make<CR>

" Window manipulation
nnoremap <F11> :wincmd j<CR>
nnoremap <F12> :wincmd k<CR>
"Automagically change directories to the directory of the current buffer
autocmd BufEnter * cd %:p:h

" Automatically load HTML/XML script when needed
au Filetype html,xml,xsl source ~/.vim/scripts/closetag.vim

"Formatting options - help formatoptions/fo-table
set formatoptions=cn
