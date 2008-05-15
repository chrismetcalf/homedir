" Chris Metcalf (chris@chrismetcalf.net)
" GTK-Vim Configuration File

" Get rid of "chrome" 
set guioptions=cR

" set the X11 font to use. See 'man xlsfonts' on unix/linux
set guifont=ProFontWindows\ 9

" Highly recommended to set tab keys to 4 spaces
set smarttab
set shiftwidth=2
set autoindent
set expandtab

" Wrap while searching for strings....
set wrapscan

" Options for line wrapping
set linebreak
set wrap
set wrapmargin=2
set display+=lastline

" Show matching parens
set showmatch

" Time to wait before matching parens (tenths of seconds)
set matchtime=7

" The opposite is set noignorecase
set ignorecase

" You may want to turn off the beep sounds (if you want quite) with visual bell
set vb

" Make command line one line high
set ch=2

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

"Formatting options - help formatoptions/fo-table
set formatoptions=cn1
set textwidth=80

" HTML closetag.vim
au Filetype html,xml,xsl,xhtml source ~/.vim/scripts/closetag.vim

" Mappings for window keys
nmap <silent> <C-Up> :wincmd k<CR>
nmap <silent> <C-Down> :wincmd j<CR>
nmap <silent> <C-Left> :wincmd h<CR>
nmap <silent> <C-Right> :wincmd l<CR>

" Toggle through buffers
nmap <silent> <C-Tab> :bprevious<CR>

" WinManager
nmap <F10> :FirstExplorerWindow<CR>
nmap <F11> :BottomExplorerWindow<CR>
nmap <F12> :WMToggle<CR>

" LaTeX suite stuff
set grepprg=grep\ -nH\ $*

" For Latex-Suite
let g:Tex_ViewRule_dvi = 'xgdvi'
let g:Tex_ViewRule_pdf = 'xpdf'

" For vimspell
let spell_auto_type="tex,txt"
nmap \vss <Plug>SpellCheck
nmap \vsA <Plug>SpellAutoEnable
nmap \vs? <Plug>SpellProposeAlternatives

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
