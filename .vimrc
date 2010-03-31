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

"#### Toggle through buffers
nmap <silent> <C-Tab> :bprevious<CR>

"#### FuzzyFinder Bindings
nmap <silent> <C-b> :FufBuffer<CR>
nmap <silent> <C-y> :FufFile<CR>
nmap <silent> <C-t> :FufFile **/<CR>

"#### NERDTree
nmap <silent> <C-n> :NERDTreeToggle<CR>
nmap <silent> <C-S-r> :NERDTreeFind<CR>

"#### Move one screen line at a time while wrapped
nnoremap j gj
nnoremap k gk
vnoremap j gj
vnoremap k gk

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
