" Load Pathogen first
runtime! autoload/pathogen.vim
if exists('g:loaded_pathogen')
  call pathogen#runtime_prepend_subdirectories(expand('~/.vimbundles'))
end

" Tab config
set smarttab
set shiftwidth=2
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
colorscheme oceanblack

" Indent stuff
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

"Formatting options - help formatoptions/fo-table
set formatoptions=cn1
set textwidth=80

"######################################
" Keyboard Mappings
"######################################

" Mappings for window keys
nmap <silent> <C-Up> :wincmd k<CR>
nmap <silent> <C-Down> :wincmd j<CR>
nmap <silent> <C-Left> :wincmd h<CR>
nmap <silent> <C-Right> :wincmd l<CR>

" Toggle through buffers
nmap <silent> <C-Tab> :bprevious<CR>

" FuzzyFinder Bindings
nmap <silent> <C-b> :FufBuffer<CR>
nmap <silent> <C-y> :FufFile<CR>
nmap <silent> <C-t> :FufFile **/<CR>

" NERDTree
nmap <silent> <C-n> :NERDTreeToggle<CR>
nmap <silent> <C-S-r> :NERDTreeFind<CR>

" Ack
""nmap <si

" Move one screen line at a time while wrapped
nnoremap j gj
nnoremap k gk
vnoremap j gj
vnoremap k gk
nnoremap <Down> gj
nnoremap <Up> gk
vnoremap <Down> gj
vnoremap <Up> gk
inoremap <Down> <C-o>gj
inoremap <Up> <C-o>gk

" Source local configs
if filereadable("$HOME/.vimrc.local")
  source $HOME/.vimrc.local
fi

"######################################
" snipMate
"######################################

" Author name
let g:snips_author = "Chris Metcalf"

"######################################
" Filetypes
"######################################

" Markdown
augroup mkd
  autocmd BufRead *.mkd  set ai formatoptions=tcroqn2 comments=n:>
augroup END

" For arduino
au FileType pde :set syntax=c

au FileType java :set shiftwidth=4
