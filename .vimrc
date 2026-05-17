" Yeah, bye vi
set nocompatible

" THE FUTURE
set encoding=UTF-8

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

" Use the system clipboard for every yank/delete/paste.
" Neovim 0.10+ ships an OSC 52 clipboard provider; this routes the system
" clipboard through the terminal escape sequence, so y/d/c reach the host
" clipboard over SSH on Tabby (Mac/Win) and ShellFish (iOS) without xclip.
set clipboard+=unnamedplus
lua <<EOF
if vim.fn.has('nvim-0.10') == 1 then
  local osc52 = require('vim.ui.clipboard.osc52')
  vim.g.clipboard = {
    name = 'OSC 52',
    copy  = { ['+'] = osc52.copy('+'),  ['*'] = osc52.copy('*')  },
    paste = { ['+'] = osc52.paste('+'), ['*'] = osc52.paste('*') },
  }
end
EOF

" Optional: show yank messages
augroup YankHighlight
  autocmd!
  autocmd TextYankPost * silent! lua vim.highlight.on_yank()
augroup END

" I like highlighting strings inside C comments
let c_comment_strings=1

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

" I guess I have to do this to make my cursor wrap lines?
set whichwrap+=<,h,l,[,]

" Commands start with ,
let mapleader = ","

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
  
  au BufNewFile,BufRead *.rss,*.atom setfiletype xml
  au BufNewFile,BufRead Gemfile,Rakefile,*.ru,*.thor setfiletype ruby
  au BufNewFile,BufRead *.json,*.draftsSyntax setfiletype json
  au BufNewFile,BufRead *.mst set filetype=mustache
  au BufNewFile,BufRead Supfile,*.sup setfiletype yaml

  " Syntax options
  au FileType java :set shiftwidth=4

  function! SetPythonOptions()
    set expandtab
    set tabstop=4
    set softtabstop=4
    set shiftwidth=4
  endfunction
  au FileType python call SetPythonOptions()

  " Delimitmate
  function! SetGitOptions()
    set spell
    let b:delimitMate_autoclose = 0
  endfunction
  au FileType gitcommit call SetGitOptions()

  " Autoload vimrc on save
  au! BufWritePost .vimrc source ~/.vimrc

  " Crontab
  autocmd filetype crontab setlocal nobackup nowritebackup

  " Latex
  autocmd filetype tex set conceallevel=0 spell
endif

"""""""""""""""""""""""""""""""""""""""
" Plugins!
" Managed with https://github.com/folke/lazy.nvim
"""""""""""""""""""""""""""""""""""""""

" Bootstrap and load lazy.nvim plugin manager.
" Plugin specs + their keybinds live in ~/.vim/lua/plugins/ and the per-plugin
" config modules in ~/.vim/lua/. Don't add plugin-specific config here.
lua require('lazy-bootstrap')

" Startify (the only plugin without its own config module)
let g:startify_session_dir = '~/.vim/sessions'
let g:startify_change_to_vcs_root = 1

" ShaDa (Neovim's replacement for viminfo) - Fix for Startify FAQ-02
if has('nvim')
  set shada='100,n$HOME/.vim/files/info/shada
else
  set viminfo='100,n$HOME/.vim/files/info/viminfo
endif

" True color
if exists('+termguicolors')
  let &t_8f = "\<Esc>[38;2;%lu;%lu;%lum"
  let &t_8b = "\<Esc>[48;2;%lu;%lu;%lum"
  set termguicolors
endif

colorscheme spaceduck

""""""""""""""""""""""""""""""""""""""""""
" Key Mappings
""""""""""""""""""""""""""""""""""""""""""

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

" Make
nnoremap <leader>m :Make<CR>

" Reselect just pasted
nnoremap <leader>v V`]

" Move one screen line at a time while wrapped
nmap j gj
nmap k gk
vmap j gj
vmap k gk

" Quick exit out of insert mode
inoremap jj <Esc>
inoremap jjw <Esc>:w<CR>
inoremap jjwq <Esc>:wq<CR>

" Quick save
nnoremap <leader>w :w!<CR>

" Vimux
map <leader>vp :VimuxPromptCommand<CR>
map <leader>vl :VimuxRunLastCommand<CR>
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

" Ignore these files when completing names and in Explorer
set wildignore=.svn,CVS,.git,.hg,*.o,*.a,*.class,*.mo,*.la,*.so,*.obj,*.swp,*.jpg,*.png,*.xpm,*.gif

" Don't store ~ and .swp files in the same directory.
if filewritable($HOME) && ! filewritable($HOME . "/.vimbackup")
 silent call mkdir($HOME . "/.vimbackup", "p", 0700)
endif
if filewritable($HOME) && ! filewritable($HOME . "/.vimswap")
 silent call mkdir($HOME . "/.vimswap", "p", 0700)
endif
set backupdir=~/.vimbackup,$TEMP,$TMP
set directory=~/.vimswap,$TEMP,$TMP

" Source local configs
if filereadable("$HOME/.vimrc.local")
  source $HOME/.vimrc.local
end
