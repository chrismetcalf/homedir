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

" Use the latest clipboard magic
set clipboard+=unnamedplus

function! CopyOSC52(text) abort
  let l:base64 = substitute(system('base64 | tr -d "\n"', a:text), '\n', '', 'g')
  let l:esc = "\033Ptmux;\033]52;c;" . l:base64 . "\a\033\\"
  call system(printf("printf '%s'", substitute(l:esc, "'", "'\\''", 'g')))
endfunction

nnoremap <leader>ya :call CopyOSC52(join(getline(1, '$'), "\n"))<CR>

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

  " Autoload vimrc and gvimrc
  au! BufWritePost .vimrc source ~/.vimrc | source ~/.gvimrc
  au! BufWritePost .gvimrc source ~/.gvimrc
  au! BufWritePost .config/nvim/init.vim source ~/.config/nvim/init.vim
  au! BufWritePost .vim/init.vim source ~/.vim/init.vim

  " Crontab
  autocmd filetype crontab setlocal nobackup nowritebackup

  " Latex
  autocmd filetype tex set conceallevel=0 spell
endif

"""""""""""""""""""""""""""""""""""""""
" Plugins!
" Managed with https://github.com/folke/lazy.nvim
"""""""""""""""""""""""""""""""""""""""

" Bootstrap and load lazy.nvim plugin manager
lua require('lazy-bootstrap')

" OLD vim-plug configuration (COMMENTED OUT - migrated to lazy.nvim)
" call plug#begin('~/.vim-plugged')

  " Color Schemes
  Plug 'vim-scripts/Colour-Sampler-Pack'

  " ChromeReload
  Plug 'tell-k/vim-browsereload-mac'
  nnoremap <leader>r :ChromeReload<CR>
  let g:returnApp = "kitty"

  " FZF
  Plug 'junegunn/fzf'
  Plug 'junegunn/fzf.vim'
  nnoremap <leader>b :Buffers<CR>
  nnoremap <leader>f :GFiles<CR>
  nnoremap <leader>F :Files<CR>
  nnoremap <leader>a :Ag<CR>
  nnoremap <leader>h :Helptags<CR>
  nnoremap <leader>c :Commands<CR>
  nnoremap <leader>l :Lines<CR>

  " AnyJump
  Plug 'pechorin/any-jump.vim'
  let g:any_jump_disable_default_keybindings = 1
  nnoremap <leader>aj :AnyJump<CR>
  xnoremap <leader>aj :AnyJumpVisual<CR>
  nnoremap <leader>ajb :AnyJumpBack<CR>
  nnoremap <leader>ajl :AnyJumpLastResults<CR>

  " File Explorer
  Plug 'nvim-tree/nvim-web-devicons'
  Plug 'nvim-tree/nvim-tree.lua'
  nnoremap <leader>n :NvimTreeToggle<CR>
  nnoremap <leader>nf :NvimTreeFindFile<CR>

  " Gundo
  Plug 'sjl/gundo.vim'
  nnoremap <leader>G :GundoToggle<CR>

  " Funcoo is a Dependency
  Plug 'rizzatti/funcoo.vim'

  " Gitgutter (keeping for compatibility, but gitsigns is better)
  " Plug 'airblade/vim-gitgutter'
  " highlight clear SignColumn
  " highlight SignColumn guibg=NONE ctermbg=NONE

  " Modern Git Integration
  Plug 'lewis6991/gitsigns.nvim'
  Plug 'sindrets/diffview.nvim'

  " MiniMap
  " Plug 'wfxr/minimap.vim'
  " let g:minimap_width = 10
  " let g:minimap_auto_start = 1
  " let g:minimap_auto_start_win_enter = 1

  " Gist
  Plug 'mattn/webapi-vim'
  Plug 'mattn/gist-vim'
  let g:gist_open_browser_after_post = 1
  let g:gist_show_privates = 1
  let g:gist_detect_filetype = 1
  let g:gist_clip_command = 'pbcopy'
  let g:github_user = "chrismetcalf"

  " vim-airline
  Plug 'vim-airline/vim-airline'
  Plug 'vim-airline/vim-airline-themes'
  let g:airline_powerline_fonts = 1
  let g:airline_theme='jellybeans'
  let g:airline#extensions#bufferline#enabled = 1

  " Misc fun stuff
  Plug 'timcharper/gitosis.vim'
  Plug 'rhysd/git-messenger.vim'
  Plug 'godlygeek/tabular'
  Plug 'airblade/vim-rooter'
  Plug 'junegunn/goyo.vim'
  Plug 'gcmt/wildfire.vim'
  Plug 'AndrewRadev/splitjoin.vim'
  Plug 'Yggdroot/indentLine'

  " Color Scheme
  Plug 'NLKNguyen/papercolor-theme'
  Plug 'sheerun/vim-polyglot'
  Plug 'pineapplegiant/spaceduck', { 'branch': 'main' }

  " vim-test
  Plug 'janko/vim-test'
  Plug 'benmills/vimux'
  let test#strategy='vimux'
  nnoremap <leader>tn :TestNearest<CR>
  nnoremap <leader>tf :TestFile<CR>
  nnoremap <leader>ta :TestSuite<CR>
  nnoremap <leader>tt :TestLast<CR>

  " tpope is my spirit animal
  Plug 'tpope/vim-endwise'
  Plug 'tpope/vim-repeat'
  Plug 'tpope/vim-git'
  Plug 'tpope/vim-fugitive'
  Plug 'tpope/vim-rhubarb'
  Plug 'tpope/vim-eunuch'
  Plug 'tpope/vim-commentary'
  Plug 'tpope/vim-rake'
  Plug 'tpope/vim-rvm'
  Plug 'tpope/vim-tbone'
  Plug 'tpope/vim-dispatch'
  Plug 'tpope/vim-speeddating'
  Plug 'tpope/vim-jdaddy'
  Plug 'tpope/vim-vinegar'

  " Easy Align
  Plug 'junegunn/vim-easy-align'
  xmap ga <Plug>(EasyAlign) 
  nmap ga <Plug>(EasyAlign)

  " Capitalization
  Plug 'arthurxavierx/vim-caser'

  " Syntax
  Plug 'vim-scripts/vim-json-bundle'
  " Plug 'tclem/vim-arduino'
  Plug 'honza/dockerfile.vim'
  Plug 'tpope/vim-bundler'

  " Markdown
  Plug 'plasticboy/vim-markdown'
  let g:vim_markdown_folding_disabled = 1
  let g:vim_markdown_frontmatter = 1

  " Docker
  Plug 'kevinhui/vim-docker-tools'

  " Completion
  " Plug 'ervandew/supertab'
  " if has('nvim')
  "   Plug 'Shougo/deoplete.nvim', { 'do': ':UpdateRemotePlugins' }
  " else
  "   Plug 'Shougo/deoplete.nvim'
  "   Plug 'roxma/nvim-yarp'
  "   Plug 'roxma/vim-hug-neovim-rpc'
  " endif
  " Plug 'zchee/deoplete-jedi'
  " let g:deoplete#enable_at_startup = 1
  " let g:deoplete#enable_syntax_highlighting = 1

  " LSP Configuration
  Plug 'neovim/nvim-lspconfig'
  Plug 'williamboman/mason.nvim', { 'do': ':MasonUpdate' }
  Plug 'williamboman/mason-lspconfig.nvim'

  " LSP UI Enhancements
  Plug 'nvim-lua/plenary.nvim'
  Plug 'stevearc/dressing.nvim'
  Plug 'ray-x/lsp_signature.nvim'
  Plug 'folke/trouble.nvim'

  " Modern Completion - order matters!
  Plug 'L3MON4D3/LuaSnip'
  Plug 'hrsh7th/nvim-cmp'
  Plug 'hrsh7th/cmp-nvim-lsp'
  Plug 'hrsh7th/cmp-buffer'
  Plug 'hrsh7th/cmp-path'
  Plug 'hrsh7th/cmp-cmdline'
  Plug 'saadparwaiz1/cmp_luasnip'

  " Auto-pairs and Surround
  Plug 'windwp/nvim-autopairs'
  Plug 'kylechui/nvim-surround'

  " Tmux
  Plug 'christoomey/vim-tmux-navigator'
  Plug 'tmux-plugins/tpm'
  Plug 'tmux-plugins/vim-tmux'
  Plug 'tmux-plugins/vim-tmux-focus-events'

  " incsearch
  Plug 'haya14busa/incsearch.vim'
  map /  <Plug>(incsearch-forward)
  map ?  <Plug>(incsearch-backward)
  map g/ <Plug>(incsearch-stay)

  " illuminates word matches in movement modes
  Plug 'RRethy/vim-illuminate'

  " ALE - Disabled in favor of native LSP
  " Plug 'w0rp/ale'
  " let g:airline#extensions#ale#enabled = 1
  " nmap <silent> <C-s-k> <Plug>(ale_previous_wrap)
  " nmap <silent> <C-s-j> <Plug>(ale_next_wrap)

  " Keymapping pop-up
  Plug 'liuchengxu/vim-which-key'
  nnoremap <silent> <leader> :WhichKey ','<CR>

  " REPL magic
  Plug 'rhysd/reply.vim'

  " Startup screen, why not?
  Plug 'mhinz/vim-startify'

  " DevIcons always needs to be last
  Plug 'ryanoasis/vim-devicons'

  " EasyMotion
  Plug 'easymotion/vim-easymotion'
  let g:EasyMotion_do_mapping = 0 " Disable default mappings

  " Jump to anywhere you want with minimal keystrokes, with just one key binding.
  " `s{char}{label}`
  nmap s <Plug>(easymotion-overwin-f)
  " or
  " `s{char}{char}{label}`
  " Need one more keystroke, but on average, it may be more comfortable.
  nmap s <Plug>(easymotion-overwin-f2)

  " Turn on case-insensitive feature
  let g:EasyMotion_smartcase = 1

  " JK motions: Line motions
  map <Leader>j <Plug>(easymotion-j)
  map <Leader>k <Plug>(easymotion-k)

  " Copilot
  Plug 'github/copilot.vim'
" call plug#end()
""""" END Plugins """""""""""""""""""""
" NOTE: vim-plug configuration above is commented out - now using lazy.nvim
" See ~/.vim/lua/plugins/init.lua for plugin specs

" Note: LSP and Completion are auto-loaded from ~/.vim/plugin/lsp-setup.lua

" Set colorscheme 
if exists('+termguicolors')
  let &t_8f = "\<Esc>[38;2;%lu;%lu;%lum"
  let &t_8b = "\<Esc>[48;2;%lu;%lu;%lum"
  set termguicolors
endif

colorscheme spaceduck
let g:airline_theme = 'spaceduck'

""""""""""""""""""""""""""""""""""""""""""
" Key Mappings
""""""""""""""""""""""""""""""""""""""""""

" Trouble keybindings (LSP diagnostics viewer)
nnoremap <leader>xx :TroubleToggle<CR>
nnoremap <leader>xw :TroubleToggle workspace_diagnostics<CR>
nnoremap <leader>xd :TroubleToggle document_diagnostics<CR>
nnoremap <leader>xq :TroubleToggle quickfix<CR>
nnoremap <leader>xl :TroubleToggle loclist<CR>
nnoremap <leader>xr :TroubleToggle lsp_references<CR>

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
