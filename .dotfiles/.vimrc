" Vim Config File

" Highly recommended to set tab keys to 4 spaces
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

" Show matching parens
set showmatch

" Time to wait before matching parens (tenths of seconds)
set matchtime=1

" The opposite is set noignorecase
set ignorecase

" You may want to turn off the beep sounds (if you want quite) with visual bell
set vb

" Make command line two lines high
set ch=3

" I like highlighting strings inside C comments
let c_comment_strings=1

" Switch on syntax highlighting.
syntax on

" Switch on search pattern highlighting.
set hlsearch

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

" Devel commands
nnoremap <F5> :make<CR>

"Automagically change directories to the directory of the current buffer
"autocmd BufEnter * cd %:p:h

" Automatically load HTML/XML script when needed
au FileType html,xml,xsl,xhtml source ~/.vim/scripts/closetag.vim

" Markdown
augroup mkd
  autocmd BufRead *.mkd  set ai formatoptions=tcroqn2 comments=n:>
augroup END

" For arduino
au FileType pde :set syntax=c

" Mappings for window keys
nmap <silent> <C-Up> :wincmd k<CR>
nmap <silent> <C-Down> :wincmd j<CR>
nmap <silent> <C-Left> :wincmd h<CR>
nmap <silent> <C-Right> :wincmd l<CR>

" Toggle through buffers
nmap <silent> <C-Tab> :bprevious<CR>

" Lusty Explorer keybindings
set wildignore=*.o,*.bak,.git
nmap <silent> <C-b> :BufferExplorer<CR>
nmap <silent> <C-f> :FilesystemExplorer<CR>
nmap <silent> <C-r> :FilesystemExplorerFromHere<CR>

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

"Make backup files end in .bak instead of ~
set backupext=.bak

"Formatting options - help formatoptions/fo-table
set formatoptions=cn1
set textwidth=80

