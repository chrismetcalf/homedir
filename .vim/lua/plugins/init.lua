-- Plugin specifications for lazy.nvim
-- Migrated from vim-plug configuration

return {
  -- Color Schemes
  { "vim-scripts/Colour-Sampler-Pack" },
  { "NLKNguyen/papercolor-theme" },
  { "sheerun/vim-polyglot" },
  {
    "pineapplegiant/spaceduck",
    branch = "main",
    priority = 1000, -- Load colorscheme early
  },

  -- ChromeReload
  {
    "tell-k/vim-browsereload-mac",
    config = function()
      vim.g.returnApp = "kitty"
      vim.keymap.set('n', '<leader>r', ':ChromeReload<CR>', { noremap = true })
    end,
  },

  -- FZF
  { "junegunn/fzf" },
  {
    "junegunn/fzf.vim",
    dependencies = { "junegunn/fzf" },
    config = function()
      vim.keymap.set('n', '<leader>b', ':Buffers<CR>', { noremap = true })
      vim.keymap.set('n', '<leader>f', ':GFiles<CR>', { noremap = true })
      vim.keymap.set('n', '<leader>F', ':Files<CR>', { noremap = true })
      vim.keymap.set('n', '<leader>a', ':Ag<CR>', { noremap = true })
      vim.keymap.set('n', '<leader>h', ':Helptags<CR>', { noremap = true })
      vim.keymap.set('n', '<leader>c', ':Commands<CR>', { noremap = true })
      vim.keymap.set('n', '<leader>l', ':Lines<CR>', { noremap = true })
    end,
  },

  -- AnyJump
  {
    "pechorin/any-jump.vim",
    config = function()
      vim.g.any_jump_disable_default_keybindings = 1
      vim.keymap.set('n', '<leader>aj', ':AnyJump<CR>', { noremap = true })
      vim.keymap.set('x', '<leader>aj', ':AnyJumpVisual<CR>', { noremap = true })
      vim.keymap.set('n', '<leader>ajb', ':AnyJumpBack<CR>', { noremap = true })
      vim.keymap.set('n', '<leader>ajl', ':AnyJumpLastResults<CR>', { noremap = true })
    end,
  },

  -- File Explorer
  { "nvim-tree/nvim-web-devicons" },
  {
    "nvim-tree/nvim-tree.lua",
    dependencies = { "nvim-tree/nvim-web-devicons" },
    config = function()
      require('nvim-tree-config')
    end,
    keys = {
      { "<leader>n", ":NvimTreeToggle<CR>", desc = "Toggle NvimTree" },
      { "<leader>nf", ":NvimTreeFindFile<CR>", desc = "Find file in NvimTree" },
    },
  },

  -- Gundo
  {
    "sjl/gundo.vim",
    cmd = { "GundoToggle", "GundoShow", "GundoHide" },
    keys = {
      { "<leader>G", ":GundoToggle<CR>", desc = "Toggle Gundo" },
    },
  },

  -- Funcoo is a Dependency
  { "rizzatti/funcoo.vim" },

  -- Modern Git Integration
  {
    "lewis6991/gitsigns.nvim",
    dependencies = { "nvim-lua/plenary.nvim" },
    event = { "BufReadPre", "BufNewFile" },
    config = function()
      require('git-config')
    end,
  },
  {
    "sindrets/diffview.nvim",
    dependencies = { "nvim-lua/plenary.nvim" },
    cmd = { "DiffviewOpen", "DiffviewClose", "DiffviewFileHistory" },
    keys = {
      { "<leader>dv", ":DiffviewOpen<CR>", desc = "Open Diffview" },
      { "<leader>dc", ":DiffviewClose<CR>", desc = "Close Diffview" },
      { "<leader>dh", ":DiffviewFileHistory<CR>", desc = "File History" },
      { "<leader>df", ":DiffviewFileHistory %<CR>", desc = "Current File History" },
    },
  },

  -- Gist
  { "mattn/webapi-vim" },
  {
    "mattn/gist-vim",
    dependencies = { "mattn/webapi-vim" },
    config = function()
      vim.g.gist_open_browser_after_post = 1
      vim.g.gist_show_privates = 1
      vim.g.gist_detect_filetype = 1
      vim.g.gist_clip_command = 'pbcopy'
      vim.g.github_user = "chrismetcalf"
    end,
  },

  -- vim-airline
  {
    "vim-airline/vim-airline",
    dependencies = { "vim-airline/vim-airline-themes" },
    config = function()
      vim.g.airline_powerline_fonts = 1
      vim.g.airline_theme = 'spaceduck'
      vim.g['airline#extensions#bufferline#enabled'] = 1
    end,
  },
  { "vim-airline/vim-airline-themes" },

  -- Misc fun stuff
  { "timcharper/gitosis.vim" },
  { "rhysd/git-messenger.vim" },
  { "godlygeek/tabular" },
  { "airblade/vim-rooter" },
  { "junegunn/goyo.vim" },
  { "gcmt/wildfire.vim" },
  { "AndrewRadev/splitjoin.vim" },
  { "Yggdroot/indentLine" },

  -- vim-test
  { "benmills/vimux" },
  {
    "janko/vim-test",
    dependencies = { "benmills/vimux" },
    config = function()
      vim.g['test#strategy'] = 'vimux'
      vim.keymap.set('n', '<leader>tn', ':TestNearest<CR>', { noremap = true })
      vim.keymap.set('n', '<leader>tf', ':TestFile<CR>', { noremap = true })
      vim.keymap.set('n', '<leader>ta', ':TestSuite<CR>', { noremap = true })
      vim.keymap.set('n', '<leader>tt', ':TestLast<CR>', { noremap = true })
    end,
  },

  -- tpope is my spirit animal
  { "tpope/vim-endwise" },
  { "tpope/vim-repeat" },
  { "tpope/vim-git" },
  { "tpope/vim-fugitive" },
  { "tpope/vim-rhubarb" },
  { "tpope/vim-eunuch" },
  { "tpope/vim-commentary" },
  { "tpope/vim-rake" },
  { "tpope/vim-rvm" },
  { "tpope/vim-tbone" },
  { "tpope/vim-dispatch" },
  { "tpope/vim-speeddating" },
  { "tpope/vim-jdaddy" },
  { "tpope/vim-vinegar" },

  -- Easy Align
  {
    "junegunn/vim-easy-align",
    config = function()
      vim.keymap.set('x', 'ga', '<Plug>(EasyAlign)', {})
      vim.keymap.set('n', 'ga', '<Plug>(EasyAlign)', {})
    end,
  },

  -- Capitalization
  { "arthurxavierx/vim-caser" },

  -- Syntax
  { "vim-scripts/vim-json-bundle" },
  { "honza/dockerfile.vim" },
  { "tpope/vim-bundler" },

  -- Markdown
  {
    "plasticboy/vim-markdown",
    config = function()
      vim.g.vim_markdown_folding_disabled = 1
      vim.g.vim_markdown_frontmatter = 1
    end,
  },

  -- Docker
  { "kevinhui/vim-docker-tools" },

  -- LSP Configuration
  { "neovim/nvim-lspconfig" },
  {
    "williamboman/mason.nvim",
    build = ":MasonUpdate",
  },
  {
    "williamboman/mason-lspconfig.nvim",
    dependencies = { "williamboman/mason.nvim", "neovim/nvim-lspconfig" },
    config = function()
      require('lsp')
    end,
  },

  -- LSP UI Enhancements (moved to plugins/ui.lua for better organization)
  { "nvim-lua/plenary.nvim" },

  -- Modern Completion - order matters!
  {
    "L3MON4D3/LuaSnip",
    event = "InsertEnter",
  },
  {
    "hrsh7th/nvim-cmp",
    event = "InsertEnter",
    dependencies = {
      "L3MON4D3/LuaSnip",
      "hrsh7th/cmp-nvim-lsp",
      "hrsh7th/cmp-buffer",
      "hrsh7th/cmp-path",
      "hrsh7th/cmp-cmdline",
      "saadparwaiz1/cmp_luasnip",
    },
    config = function()
      require('completion')
    end,
  },
  { "hrsh7th/cmp-nvim-lsp" },
  { "hrsh7th/cmp-buffer" },
  { "hrsh7th/cmp-path" },
  { "hrsh7th/cmp-cmdline" },
  { "saadparwaiz1/cmp_luasnip" },

  -- Auto-pairs and Surround
  {
    "windwp/nvim-autopairs",
    event = "InsertEnter",
    dependencies = { "hrsh7th/nvim-cmp" },
    config = function()
      require('autopairs-surround-config')
    end,
  },
  {
    "kylechui/nvim-surround",
    event = "VeryLazy",
    opts = {}, -- Config is in autopairs-surround-config.lua, but opts triggers setup
  },

  -- Tmux
  { "christoomey/vim-tmux-navigator" },
  { "tmux-plugins/tpm" },
  { "tmux-plugins/vim-tmux" },
  { "tmux-plugins/vim-tmux-focus-events" },

  -- incsearch
  {
    "haya14busa/incsearch.vim",
    config = function()
      vim.keymap.set('', '/', '<Plug>(incsearch-forward)', {})
      vim.keymap.set('', '?', '<Plug>(incsearch-backward)', {})
      vim.keymap.set('', 'g/', '<Plug>(incsearch-stay)', {})
    end,
  },

  -- illuminates word matches in movement modes
  { "RRethy/vim-illuminate" },

  -- Keymapping pop-up
  {
    "liuchengxu/vim-which-key",
    config = function()
      vim.keymap.set('n', '<leader>', ':WhichKey \',\'<CR>', { noremap = true, silent = true })
    end,
  },

  -- REPL magic
  { "rhysd/reply.vim" },

  -- Startup screen, why not?
  { "mhinz/vim-startify" },

  -- DevIcons always needs to be last
  { "ryanoasis/vim-devicons" },

  -- EasyMotion
  {
    "easymotion/vim-easymotion",
    config = function()
      vim.g.EasyMotion_do_mapping = 0
      vim.keymap.set('n', 's', '<Plug>(easymotion-overwin-f2)', {})
      vim.g.EasyMotion_smartcase = 1
      vim.keymap.set('', '<Leader>j', '<Plug>(easymotion-j)', {})
      vim.keymap.set('', '<Leader>k', '<Plug>(easymotion-k)', {})
    end,
  },

  -- Copilot
  { "github/copilot.vim" },
}
