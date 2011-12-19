" Yeah, bye vim
set nocompatible

" Load Pathogen first
runtime! autoload/pathogen.vim
if exists('g:loaded_pathogen')
  call pathogen#runtime_prepend_subdirectories(expand('~/.vimbundles'))
end

" Tab config
set smarttab
set shiftwidth=2
set tabstop=2
set autoindent
set expandtab

" Wrap while searching for strings
set wrapscan

" Wrap at whitespace instead of the middle of a word.
set linebreak
set wrap
set wrapmargin=2
set display+=lastline

" Formatting options - help formatoptions/fo-table
set formatoptions=cn1

" Show matching parens
set showmatch

" Time to wait before matching parens (tenths of seconds)
set matchtime=1

" The opposite is set noignorecase
set ignorecase
set smartcase

" Global replace by default
set gdefault

" You may want to turn off the beep sounds (if you want quite) with visual bell
set vb

" Make command line two lines high
set ch=2

" Allow deleting previously entered charecters in insert mode
set backspace=indent,eol,start

" I like highlighting strings inside C comments
let c_comment_strings=1

" Tab-completion options
set completeopt=menuone,longest
syntax on

" Set nice colors
colorscheme jellybeans

"Shows the current editing mode
set showmode

" Set line numbers
set number

"Show the ruler
set ruler

"Highlight all matches
set hlsearch

"Show search while typing
set incsearch

" Show tabs as >-
set list
set listchars=tab:>-,trail:-

" Make backup files end in .bak instead of ~
set backupext=.bak

" Allow the creation of hidden buffers
set hidden

" Save up to 500 lines of history
set history=500

" Menus Gone Wild!
set wildmenu

""""""""""""""""""""""""""""""""""""""""""
" Plugin Config
""""""""""""""""""""""""""""""""""""""""""

" Gist
let g:gist_open_browser_after_post = 1
let g:gist_show_privates = 1
let g:gist_detect_filetype = 1
let g:gist_clip_command = 'pbcopy'
let g:github_user = "chrismetcalf"

" snipMate
" Author name
let g:snips_author = "Chris Metcalf"

" DelimitMate
let b:delimitMate_autoclose = 0

" NERDComment
let NERDDefaultNesting = 1

""""""""""""""""""""""""""""""""""""""""""
" Functions
""""""""""""""""""""""""""""""""""""""""""

" Strip trailing whitespace and delete blanks
function! <SID>StripTrailingWhitespaces()
  let _s=@/
  let l = line(".")
  let c = col(".")
  %s/\s\+$//e
  let @/=_s
  call cursor(l, c)
endfunction
command! StripTrail call <SID>StripTrailingWhitespaces()

command! DeleteBlank :g/^$/d

""""""""""""""""""""""""""""""""""""""""""
" Filetype-Specific Config
""""""""""""""""""""""""""""""""""""""""""

" AutoCmds
if has("autocmd")
  filetype plugin indent on

  " Set relevant filetypes
  au BufNewFile,BufRead *.mkd,*.txt setfiletype mkd
  au BufNewFile,BufRead *.rss,*.atom setfiletype xml
  au BufNewFile,BufRead Gemfile,Rakefile,*.ru setfiletype ruby
  au BufNewFile,BufRead *.json setfiletype javascript

  " Syntax options
  au FileType pde :set syntax=c
  au FileType java :set shiftwidth=4
  au FileType java,javascript,scala,ruby,c,c++ :RainbowParenthesesToggle

  " Delimitmate
  au FileType gitcommit let b:delimitMate_autoclose = 0

  " Autoload vimrc and gvimrc
  au! BufWritePost .vimrc source ~/.vimrc | source ~/.gvimrc
  au! BufWritePost .gvimrc source ~/.gvimrc

  " Arduino!
  autocmd! BufNewFile,BufRead *.pde setlocal ft=arduino
endif

" HTML Escaping
function! <SID>HtmlEscape()
  silent '<,'>s/&/\&amp;/eg
  silent '<,'>s/</\&lt;/eg
  silent '<,'>s/>/\&gt;/eg
endfunction
command! HtmlEscape call <SID>HtmlEscape()

function! <SID>HtmlUnEscape()
  silent '<,'>s/&lt;/</eg
  silent '<,'>s/&gt;/>/eg
  silent '<,'>s/&amp;/\&/eg
endfunction
command! HtmlUnEscape call <SID>HtmlUnEscape()

command! PreviewHTML :!open %<CR>
""""""""""""""""""""""""""""""""""""""""""
" Key Mappings
""""""""""""""""""""""""""""""""""""""""""
" Commands start with ,
let mapleader = ","

" Mappings for window keys
nmap <silent> <C-k> :wincmd k<CR>
nmap <silent> <C-j> :wincmd j<CR>
nmap <silent> <C-h> :wincmd h<CR>
nmap <silent> <C-l> :wincmd l<CR>
nmap <silent> <C-down> :wincmd k<CR>
nmap <silent> <C-up> :wincmd j<CR>
nmap <silent> <C-left> :wincmd h<CR>
nmap <silent> <C-right> :wincmd l<CR>

" Toggle through buffers
nmap <silent> <C-Tab> :bprevious<CR>

" Scratch file
nmap <leader>s :Sscratch<cr>

" Rainbows
nmap <leader>R :RainbowParenthesesToggle<CR>

" Quick search clear
nnoremap <leader><space> :noh<cr>

" NERDTree
nmap <leader>n :NERDTreeToggle<CR>
nmap <leader>p :NERDTreeFind<CR>

" ,/ to invert comment on the current line/selection
nmap <leader>/ :call NERDComment(0, "invert")<cr>
vmap <leader>/ :call NERDComment(0, "invert")<cr>

" Color Pickers
nnoremap <leader>c :ColorHEX

" Quick Ack
nnoremap <leader>a :Ack 


" Fold at tag
nnoremap <leader>ft Vatzf

" Reselect just pasted
nnoremap <leader>v V`]

" Command-T
let g:CommandTMaxFiles = 20000
let g:CommandTMaxDepth = 20
let g:CommandTMatchWindowAtTop = 1
nmap <leader>t :CommandT<CR>
nmap <leader>b :CommandTBuffer<CR>

" map ,y to show the yankring
nmap <leader>y :YRShow<cr>
let g:yankring_replace_n_pkey = '<leader>['
let g:yankring_replace_n_nkey = '<leader>]'

" Show Gundo window
nnoremap <leader>g :GundoToggle<CR>

" Move one screen line at a time while wrapped
nnoremap j gj
nnoremap k gk
vnoremap j gj
vnoremap k gk

" Quick exit out of insert mode
inoremap jj <Esc>

" Duplicate the line below
vmap D y'>p

" Reverse the selected lines
vnoremap <leader>r !tac<CR>

" Disable help, since its annoying as hell
inoremap <F1> <ESC>
nnoremap <F1> <ESC>
vnoremap <F1> <ESC>

" Pressing ,ss will toggle and untoggle spell checking
map <leader>ss :setlocal spell!<cr>

" Shortcuts using <leader>
map <leader>sn ]s
map <leader>sp [s
map <leader>sa zg
map <leader>s? z=

" VimRoom
map <leader>vr <Plug>VimroomToggle
let g:vimroom_width = 100

" Quick Ruby Run
if !hasmapto("RunRuby") && has("autocmd") && has("gui_macvim")
  " Shifted
  au FileType ruby nmap <leader>r :RunRuby<CR> <C-w>w

  " Close output buffer
  au FileType ruby-runner nmap <leader>r ZZ
endif

" EasyMotion
let g:EasyMotion_do_mapping=0
highlight link EasyMotionTarget ErrorMsg
let g:EasyMotion_keys = 'abcdefghijklmnopqrstuvwxyz'

" Sudo to write
cmap w!! w !sudo tee % >/dev/null

" Ignore these files when completing names and in Explorer
set wildignore=.svn,CVS,.git,.hg,*.o,*.a,*.class,*.mo,*.la,*.so,*.obj,*.swp,*.jpg,*.png,*.xpm,*.gif

" Don't store ~ and .swp files in the same directory.
if filewritable($HOME) && ! filewritable($HOME . "/.vimbackup")
 silent call mkdir($HOME . "/.vimbackup", "p", 0700)
endif
if filewritable($HOME) && ! filewritable($HOME . "/.vimswap")
 silent call mkdir($HOME . "/.vimswap", "p", 0700)
endif
set backupdir=./.backup,~/.vimbackup,$TEMP,$TMP
set directory=./.backup,~/.vimswap,$TEMP,$TMP

" Source local configs
if filereadable("$HOME/.vimrc.local")
  source $HOME/.vimrc.local
end

