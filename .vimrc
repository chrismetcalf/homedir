" Yeah, bye vi
set nocompatible

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
set smartcase " Global replace by default set gdefault

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

" Always show the status line
set laststatus=2

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

function! HtmlEntities()
  silent %s/À/\&Agrave;/e
  silent %s/Á/\&Aacute;/e
  silent %s/Â/\&Acirc;/e
  silent %s/Ã/\&Atilde;/e
  silent %s/Ä/\&Auml;/e
  silent %s/Å/\&Aring;/e
  silent %s/Æ/\&AElig;/e
  silent %s/Ç/\&Ccedil;/e
  silent %s/È/\&Egrave;/e
  silent %s/É/\&Eacute;/e
  silent %s/Ê/\&Ecirc;/e
  silent %s/Ë/\&Euml;/e
  silent %s/Ì/\&Igrave;/e
  silent %s/Í/\&Iacute;/e
  silent %s/Î/\&Icirc;/e
  silent %s/Ï/\&Iuml;/e
  silent %s/Ð/\&ETH;/e
  silent %s/Ñ/\&Ntilde;/e
  silent %s/Ò/\&Ograve;/e
  silent %s/Ó/\&Oacute;/e
  silent %s/Ô/\&Ocirc;/e
  silent %s/Õ/\&Otilde;/e
  silent %s/Ö/\&Ouml;/e
  silent %s/Ø/\&Oslash;/e
  silent %s/Ù/\&Ugrave;/e
  silent %s/Ú/\&Uacute;/e
  silent %s/Û/\&Ucirc;/e
  silent %s/Ü/\&Uuml;/e
  silent %s/Ý/\&Yacute;/e
  silent %s/Þ/\&THORN;/e
  silent %s/ß/\&szlig;/e
  silent %s/à/\&agrave;/e
  silent %s/á/\&aacute;/e
  silent %s/â/\&acirc;/e
  silent %s/ã/\&atilde;/e
  silent %s/ä/\&auml;/e
  silent %s/å/\&aring;/e
  silent %s/æ/\&aelig;/e
  silent %s/ç/\&ccedil;/e
  silent %s/è/\&egrave;/e
  silent %s/é/\&eacute;/e
  silent %s/ê/\&ecirc;/e
  silent %s/ë/\&euml;/e
  silent %s/ì/\&igrave;/e
  silent %s/í/\&iacute;/e
  silent %s/î/\&icirc;/e
  silent %s/ï/\&iuml;/e
  silent %s/ð/\&eth;/e
  silent %s/ñ/\&ntilde;/e
  silent %s/ò/\&ograve;/e
  silent %s/ó/\&oacute;/e
  silent %s/ô/\&ocirc;/e
  silent %s/õ/\&otilde;/e
  silent %s/ö/\&ouml;/e
  silent %s/ø/\&oslash;/e
  silent %s/ù/\&ugrave;/e
  silent %s/ú/\&uacute;/e
  silent %s/û/\&ucirc;/e
  silent %s/ü/\&uuml;/e
  silent %s/ý/\&yacute;/e
  silent %s/þ/\&thorn;/e
  silent %s/ÿ/\&yuml;/e
  silent %s/“/"/e
  silent %s/”/"/e
  silent %s/’/'/e
endfunction
command! HtmlEntities :call HtmlEntities()

function! SoftWrap()
  set formatoptions=1
  set linebreak
  set wrap
  set nolist
  set breakat=\ |@-+;:,./?^I
endfunction
command! SoftWrap :call SoftWrap()

" Write this to a new note file
function! WNote()
  let filename = fnameescape(substitute(getline(1), '^#\s\+', '', '') . ".txt")
  exe "save " . filename 
  set filetype=markdown
endfunction
command! WNote :call WNote()

""""""""""""""""""""""""""""""""""""""""""
" Filetype-Specific Config
""""""""""""""""""""""""""""""""""""""""""

" AutoCmds
if has("autocmd")
  filetype plugin indent on

  function! SetMkdOptions()
    set filetype=markdown
    set nolinebreak
    set wrapmargin=0
    set spell
    call SoftWrap()
    " :NeoComplCacheDisable()<CR>
  endfunction
  au BufNewFile,BufRead *.md,*.mkd,*.txt call SetMkdOptions()

  au BufNewFile,BufRead *.rss,*.atom setfiletype xml
  au BufNewFile,BufRead Gemfile,Rakefile,*.ru,*.thor setfiletype ruby
  au BufNewFile,BufRead *.json setfiletype json
  au BufNewFile,BufRead *.mst set filetype=mustache

  " Syntax options
  au FileType java :set shiftwidth=4

  " Delimitmate
  function! SetGitOptions()
    set spell
    let b:delimitMate_autoclose = 0
  endfunction
  au FileType gitcommit call SetGitOptions()

  " Autoload vimrc and gvimrc
  au! BufWritePost .vimrc source ~/.vimrc | source ~/.gvimrc
  au! BufWritePost .gvimrc source ~/.gvimrc

  " Crontab
  autocmd filetype crontab setlocal nobackup nowritebackup
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

" Quick search clear
nnoremap <leader><space> :noh<cr>

" MultiMarkdown the selection
vmap <leader>mm :!sed 's/^ *//' \| multimarkdown --nolabels --nosmart --nonotes<CR>

" Open in marked
nnoremap <leader>md :silent !open -a Marked\ 2.app '%:p'<cr>

" Make
nnoremap <leader>m :Make<CR>

" Fold at tag
nnoremap <leader>ft Vatzf

" Reselect just pasted
nnoremap <leader>v V`]

" Move one screen line at a time while wrapped
nnoremap j gj
nnoremap k gk
vnoremap j gj
vnoremap k gk

" Quick exit out of insert mode
inoremap jj <Esc>
inoremap jjw <Esc>:w<CR>
inoremap jjwq <Esc>:wq<CR>

" Vimux
map <leader>vp :VimuxPromptCommand<CR>
map <leader>vl :VimuxRunLastCommand<CR>
map <leader><leader> :VimuxRunLastCommand<CR>
map <leader>vi :VimuxInspectRunner<CR>

" Duplicate the line below
vmap D y'>p

" Reverse the selected lines
vnoremap <leader>r !tac<CR>

" Disable help, since its annoying as hell
inoremap <F1> <ESC>
nnoremap <F1> <ESC>
vnoremap <F1> <ESC>

" Pressing ,sp will toggle and untoggle spell checking
map <leader>sp :setlocal spell!<cr>

" Shortcuts using <leader>
map <leader>sn ]s
map <leader>sp [s
map <leader>sa zg
map <leader>s? z=

" Tab skips
map <leader>] :tabn<CR>
map <leader>[ :tabp<CR>

" Copy to PB
map <leader>c :w !pbcopy<CR>

" Jekyll magic
nnoremap <leader>jw :silent !tmux split-window -d -l 8 'cd $(pwd); jekyll build --watch --safe'<cr>
nnoremap <leader>mw :silent !tmux split-window -b -l 8 'cd $(pwd); make watch<cr>

" Quick search/replace from
" http://sheerun.net/2014/03/21/how-to-boost-your-vim-productivity/
vnoremap <silent> s //e<C-r>=&selection=='exclusive'?'+1':'<CR><CR>
    \:<C-u>call histdel('search',-1)<Bar>let @/=histget('search',-1)<CR>gv
omap s :normal vs<CR>

" Sudo to write
cmap w!! w !sudo tee % >/dev/null

" Don't replace the buffer when you put
" vp doesn't replace paste buffer
function! RestoreRegister()
  let @" = s:restore_reg
  return ''
endfunction
function! s:Repl()
  let s:restore_reg = @"
  return "p@=RestoreRegister()\<cr>"
endfunction
vmap <silent> <expr> p <sid>Repl()

"""""""""""""""""""""""""""""""""""""""
" Plugins!
" Managed with https://github.com/junegunn/vim-plug
"""""""""""""""""""""""""""""""""""""""
call plug#begin('~/.vim-plugged')

  " Color Schemes
  Plug 'vim-scripts/Colour-Sampler-Pack'

  " ChromeReload
  Plug 'tell-k/vim-browsereload-mac'
  nnoremap <leader>r :ChromeReload<CR>
  let g:returnApp = "iTerm"

  " FZF
  Plug 'junegunn/fzf'
  Plug 'junegunn/fzf.vim'
  nnoremap <leader>b :Buffers<CR>
  nnoremap <leader>f :GFiles<CR>
  nnoremap <leader>F :Files<CR>
  nnoremap <leader>g :Ag<CR>
  nnoremap <leader>a :Ag<CR>
  nnoremap <leader>h :Helptags<CR>

  " Gundo
  Plug 'sjl/gundo.vim'
  nnoremap <leader>G :GundoToggle<CR>

  " Quick Dash search
  Plug 'rizzatti/dash.vim'
  nnoremap <leader>d :Dash 

  " Funcoo is a Dependency
  Plug 'rizzatti/funcoo.vim'

  " Gitgutter
  Plug 'airblade/vim-gitgutter'
  highlight clear SignColumn
  highlight SignColumn guibg=NONE ctermbg=NONE

  " Gist
  Plug 'mattn/gist-vim'
  let g:gist_open_browser_after_post = 1
  let g:gist_show_privates = 1
  let g:gist_detect_filetype = 1
  let g:gist_clip_command = 'pbcopy'
  let g:github_user = "chrismetcalf"

  " vim-airline
  Plug 'bling/vim-airline'
  let g:airline_left_sep = ''
  let g:airline_right_sep = ''
  let g:airline#extensions#bufferline#enabled = 1

  " Misc fun stuff
  Plug 'timcharper/gitosis.vim'
  Plug 'msanders/snipmate.vim'
  Plug 'godlygeek/tabular'
  Plug 'airblade/vim-rooter'
  Plug 'junegunn/goyo.vim'
  Plug 'gcmt/wildfire.vim'
  Plug 'benmills/vimux'

  " tpop is my spirit animal
  Plug 'tpope/vim-haml'
  Plug 'tpope/vim-endwise'
  Plug 'tpope/vim-surround'
  Plug 'tpope/vim-repeat'
  Plug 'tpope/vim-git'
  Plug 'tpope/vim-fugitive'
  Plug 'tpope/vim-pastie'
  Plug 'tpope/vim-eunuch'
  Plug 'tpope/vim-commentary'
  Plug 'tpope/vim-rake'
  Plug 'tpope/vim-rvm'
  Plug 'tpope/vim-tbone'
  Plug 'tpope/vim-dispatch'
  Plug 'tpope/vim-heroku'
  Plug 'tpope/vim-speeddating'
  Plug 'tpope/vim-jdaddy'

  " Syntax
  Plug 'vim-scripts/vim-json-bundle'
  Plug 'tclem/vim-arduino'
  Plug 'honza/dockerfile.vim'
  Plug 'tpope/vim-bundler'
  Plug 'tpope/vim-liquid'
  Plug 'tpope/vim-markdown'
  Plug 'lrampa/vim-apib'
  Plug 'davidoc/taskpaper.vim'

  " Completion
  Plug 'ervandew/supertab'
  Plug 'davidhalter/jedi-vim'

  Plug 'AndrewRadev/splitjoin.vim'
  Plug 'christoomey/vim-tmux-navigator'
  Plug 'nikvdp/ejs-syntax'
  Plug 'tmux-plugins/tpm'
  Plug 'tmux-plugins/vim-tmux'
  Plug 'tmux-plugins/vim-tmux-focus-events'

call plug#end()
""""" END Plugins """""""""""""""""""""

" Color scheme must be set after plugin initialization
colorscheme jellybeans
highlight Normal guibg=NONE ctermbg=NONE
highlight LineNr guibg=NONE ctermbg=NONE
highlight NonText guibg=NONE ctermbg=NONE

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
