" Load Pathogen first
runtime! autoload/pathogen.vim
if exists('g:loaded_pathogen')
  call pathogen#runtime_prepend_subdirectories(expand('~/.vimbundles'))
end

" Commands start with ,
let mapleader = ","

" Tab config
set smarttab
set shiftwidth=2
set tabstop=2
set autoindent
set expandtab

" Wrap while searching for strings....
set wrapscan

" Wrap at whitespace instead of the middle of a word.
set linebreak
set wrap
set wrapmargin=2
set display+=lastline

" Formatting options - help formatoptions/fo-table
set formatoptions=cn1
"set textwidth=80
set textwidth=0

" Show matching parens
set showmatch

" Time to wait before matching parens (tenths of seconds)
set matchtime=1

" The opposite is set noignorecase
set ignorecase

" You may want to turn off the beep sounds (if you want quite) with visual bell
set vb

" Make command line two lines high
set ch=2

" I like highlighting strings inside C comments
let c_comment_strings=1

" Tab-completion options
set completeopt=menuone,preview

" Switch on syntax highlighting.
syntax on

" Set nice colors
colorscheme vividchalk

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

"#### Show tabs as >-
set list
set listchars=tab:>-,trail:-

"#### Make backup files end in .bak instead of ~
set backupext=.bak

"#### Formatting options - help formatoptions/fo-table
set formatoptions=cn1
set textwidth=80

" Allow the creation of hidden buffers
set hidden

"#### Mappings for window keys
nmap <silent> <C-Up> :wincmd k<CR>
nmap <silent> <C-Down> :wincmd j<CR>
nmap <silent> <C-Left> :wincmd h<CR>
nmap <silent> <C-Right> :wincmd l<CR>
nmap <silent> <C-k> :wincmd k<CR>
nmap <silent> <C-j> :wincmd j<CR>
nmap <silent> <C-h> :wincmd h<CR>
nmap <silent> <C-l> :wincmd l<CR>

"#### Toggle through buffers
nmap <silent> <C-Tab> :bprevious<CR>

"#### NERDTree
nmap <silent> <C-n> :NERDTreeToggle<CR>
" ,p to show current file in the tree
nmap <leader>p :NERDTreeFind<CR>

" ,/ to invert comment on the current line/selection
nmap <leader>/ :call NERDComment(0, "invert")<cr>
vmap <leader>/ :call NERDComment(0, "invert")<cr>

" ,t to show tags window
let Tlist_Show_Menu=1
nmap <leader>t :TlistToggle<CR>

"#### FuzzyFinder Bindings
" ,f to fast finding files using fuzzy finder.
nmap <leader>f :FufFile **/<CR>
nmap <leader>b :FufBuffer<CR>
nmap <leader>y :FufFile<CR>
nmap <leader>t :FufFile **/<CR>

" ,sh to open vimshell window
nmap <Leader>sh :ConqueSplit zsh<cr>
set shell=/bin/zsh

" ,r to open vimshell window
nmap <Leader>r :ConqueSplit 

" map ,y to show the yankring
nmap <leader>y :YRShow<cr>
let g:yankring_replace_n_pkey = '<leader>['
let g:yankring_replace_n_nkey = '<leader>]'


"#### Move one screen line at a time while wrapped
nnoremap j gj
nnoremap k gk
vnoremap j gj
vnoremap k gk

"#### Quick exit out of insert mode
inoremap jj         <Esc>

" Ctrl-N to disable search match highlight
nmap <silent> <C-N> :silent noh<CR>

" Ctrl-E to switch between 2 last buffers
nmap <C-E> :b#<CR>

"Ignore these files when completing names and in Explorer
set wildignore=.svn,CVS,.git,.hg,*.o,*.a,*.class,*.mo,*.la,*.so,*.obj,*.swp,*.jpg,*.png,*.xpm,*.gif

" Source local configs
if filereadable("$HOME/.vimrc.local")
  source $HOME/.vimrc.local
end

"#### Gist
let g:gist_open_browser_after_post = 1
let g:gist_detect_filetype = 1

"#### snipMate
" Author name
let g:snips_author = "Chris Metcalf"

"#### AutoCmds
if has("autocmd")
  filetype plugin indent on

  autocmd BufNewFile,BufRead *.mkd  set ai formatoptions=tcroqn2 comments=n:>
  autocmd BufNewFile,BufRead *.rss,*.atom setfiletype xml

  au FileType pde :set syntax=c
  au FileType java :set shiftwidth=4
endif

"#### Strip trailing whitespace and delete blanks
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

" Resource vimrc
function! <SID>ReloadVimrc()
  :source ~/.vimrc
  :source ~/.gvimrc
endfunction
command! Reload call <SID>ReloadVimrc()
