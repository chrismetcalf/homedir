-- Plugin specifications for lazy.nvim.
-- Default is lazy = true (see lazy-bootstrap.lua); plugins below opt out via
-- lazy = false when they need to load at startup (e.g. statusline, colorscheme,
-- always-on keybinds). Everything else loads on event/cmd/keys/ft.

return {
  ---------------------------------------------------------------------------
  -- Color schemes
  ---------------------------------------------------------------------------
  { "vim-scripts/Colour-Sampler-Pack", lazy = true },
  { "NLKNguyen/papercolor-theme",      lazy = true },
  {
    "pineapplegiant/spaceduck",
    branch = "main",
    lazy = false,
    priority = 1000, -- ensure colorscheme is available before plugins
  },

  ---------------------------------------------------------------------------
  -- Statusline / icons / startup screen (eager)
  ---------------------------------------------------------------------------
  {
    "nvim-lualine/lualine.nvim",
    dependencies = { "nvim-tree/nvim-web-devicons" },
    lazy = false,
    opts = {
      options = {
        theme = 'jellybeans',
        icons_enabled = true,
        section_separators = { left = '', right = '' },
        component_separators = { left = '', right = '' },
        globalstatus = true, -- single statusline shared across splits
      },
      sections = {
        lualine_a = { 'mode' },
        lualine_b = { 'branch', 'diff', 'diagnostics' },
        lualine_c = { { 'filename', path = 1 } },
        lualine_x = { 'encoding', 'fileformat', 'filetype' },
        lualine_y = { 'progress' },
        lualine_z = { 'location' },
      },
      extensions = { 'fugitive', 'nvim-tree', 'trouble', 'lazy' },
    },
  },
  { "nvim-tree/nvim-web-devicons", lazy = true }, -- pulled in by deps
  { "mhinz/vim-startify",              lazy = false }, -- splash screen

  ---------------------------------------------------------------------------
  -- Navigation / tmux (eager keybinds)
  ---------------------------------------------------------------------------
  { "christoomey/vim-tmux-navigator",  lazy = false }, -- C-h/j/k/l bindings
  { "tmux-plugins/vim-tmux",           ft  = "tmux" },
  { "tmux-plugins/vim-tmux-focus-events", lazy = false },

  ---------------------------------------------------------------------------
  -- File / fuzzy navigation
  ---------------------------------------------------------------------------
  { "junegunn/fzf", lazy = true }, -- dep
  {
    "junegunn/fzf.vim",
    dependencies = { "junegunn/fzf" },
    cmd = { "Buffers", "GFiles", "Files", "Ag", "Helptags", "Commands", "Lines" },
    keys = {
      { "<leader>b", ":Buffers<CR>",  desc = "FZF buffers" },
      { "<leader>f", ":GFiles<CR>",   desc = "FZF git files" },
      { "<leader>F", ":Files<CR>",    desc = "FZF all files" },
      { "<leader>a", ":Ag<CR>",       desc = "FZF Ag search" },
      { "<leader>h", ":Helptags<CR>", desc = "FZF help tags" },
      { "<leader>c", ":Commands<CR>", desc = "FZF commands" },
      { "<leader>l", ":Lines<CR>",    desc = "FZF lines" },
    },
  },
  {
    "pechorin/any-jump.vim",
    cmd = { "AnyJump", "AnyJumpVisual", "AnyJumpBack", "AnyJumpLastResults" },
    keys = {
      { "<leader>aj",  ":AnyJump<CR>",            desc = "AnyJump" },
      { "<leader>aj",  ":AnyJumpVisual<CR>",      mode = "x", desc = "AnyJump (visual)" },
      { "<leader>ajb", ":AnyJumpBack<CR>",        desc = "AnyJump back" },
      { "<leader>ajl", ":AnyJumpLastResults<CR>", desc = "AnyJump last results" },
    },
    init = function() vim.g.any_jump_disable_default_keybindings = 1 end,
  },
  {
    "nvim-tree/nvim-tree.lua",
    dependencies = { "nvim-tree/nvim-web-devicons" },
    cmd = { "NvimTreeToggle", "NvimTreeFindFile", "NvimTreeOpen", "NvimTreeClose" },
    config = function() require('nvim-tree-config') end,
    keys = {
      { "<leader>n",  ":NvimTreeToggle<CR>",   desc = "Toggle NvimTree" },
      { "<leader>nf", ":NvimTreeFindFile<CR>", desc = "Find file in NvimTree" },
    },
  },

  ---------------------------------------------------------------------------
  -- Git
  ---------------------------------------------------------------------------
  {
    "lewis6991/gitsigns.nvim",
    dependencies = { "nvim-lua/plenary.nvim" },
    event = { "BufReadPre", "BufNewFile" },
    config = function() require('git-config') end,
  },
  {
    "sindrets/diffview.nvim",
    dependencies = { "nvim-lua/plenary.nvim" },
    cmd = { "DiffviewOpen", "DiffviewClose", "DiffviewFileHistory" },
    keys = {
      { "<leader>dv", ":DiffviewOpen<CR>",          desc = "Open Diffview" },
      { "<leader>dc", ":DiffviewClose<CR>",         desc = "Close Diffview" },
      { "<leader>dh", ":DiffviewFileHistory<CR>",   desc = "File History" },
      { "<leader>df", ":DiffviewFileHistory %<CR>", desc = "Current File History" },
    },
  },
  { "tpope/vim-fugitive",      cmd = { "Git", "Gstatus", "Gblame", "Gdiff", "Gcommit", "Gpush", "Gpull" } },
  { "tpope/vim-rhubarb",       dependencies = { "tpope/vim-fugitive" }, cmd = { "GBrowse" } },
  { "tpope/vim-git",           ft = { "gitcommit", "gitrebase", "gitconfig" } },
  { "rhysd/git-messenger.vim", cmd = "GitMessenger", keys = { { "<leader>gm", ":GitMessenger<CR>", desc = "Git Messenger" } } },
  { "timcharper/gitosis.vim",  ft = { "gitosis" } },
  {
    "mattn/gist-vim",
    dependencies = { "mattn/webapi-vim" },
    cmd = "Gist",
    init = function()
      vim.g.gist_open_browser_after_post = 1
      vim.g.gist_show_privates = 1
      vim.g.gist_detect_filetype = 1
      vim.g.gist_clip_command = 'pbcopy'
      vim.g.github_user = "chrismetcalf"
    end,
  },
  { "mattn/webapi-vim", lazy = true }, -- dep

  ---------------------------------------------------------------------------
  -- LSP + completion
  ---------------------------------------------------------------------------
  { "neovim/nvim-lspconfig",     event = { "BufReadPre", "BufNewFile" } },
  { "williamboman/mason.nvim",   cmd = { "Mason", "MasonInstall", "MasonUninstall", "MasonUpdate" }, build = ":MasonUpdate", opts = {} },
  {
    "williamboman/mason-lspconfig.nvim",
    dependencies = { "williamboman/mason.nvim", "neovim/nvim-lspconfig" },
    event = { "BufReadPre", "BufNewFile" },
    config = function() require('lsp') end,
  },
  { "nvim-lua/plenary.nvim", lazy = true }, -- pulled in by deps

  { "L3MON4D3/LuaSnip", event = "InsertEnter" },
  {
    "hrsh7th/nvim-cmp",
    event = { "InsertEnter", "CmdlineEnter" },
    dependencies = {
      "L3MON4D3/LuaSnip",
      "hrsh7th/cmp-nvim-lsp",
      "hrsh7th/cmp-buffer",
      "hrsh7th/cmp-path",
      "hrsh7th/cmp-cmdline",
      "saadparwaiz1/cmp_luasnip",
      "zbirenbaum/copilot-cmp",
    },
    config = function() require('completion') end,
  },
  { "hrsh7th/cmp-nvim-lsp", lazy = true },
  { "hrsh7th/cmp-buffer",   lazy = true },
  { "hrsh7th/cmp-path",     lazy = true },
  { "hrsh7th/cmp-cmdline",  lazy = true },
  { "saadparwaiz1/cmp_luasnip", lazy = true },

  ---------------------------------------------------------------------------
  -- Editing helpers
  ---------------------------------------------------------------------------
  {
    "windwp/nvim-autopairs",
    event = "InsertEnter",
    dependencies = { "hrsh7th/nvim-cmp" },
    config = function() require('autopairs-surround-config') end,
  },
  { "kylechui/nvim-surround",   event = "VeryLazy", opts = {} },
  { "tpope/vim-endwise",        event = "InsertEnter" },
  { "tpope/vim-commentary",     keys = { { "gc", mode = { "n", "x", "o" } } }, cmd = "Commentary" },
  { "tpope/vim-repeat",         event = "VeryLazy" },
  { "tpope/vim-speeddating",    event = "VeryLazy" },
  { "tpope/vim-eunuch",         cmd = { "Remove", "Delete", "Move", "Rename", "Chmod", "Mkdir", "Cfind", "Clocate", "Lfind", "Llocate", "SudoEdit", "SudoWrite" } },
  { "tpope/vim-vinegar",        keys = { "-" } },
  { "tpope/vim-tbone",          cmd = { "Tmux", "Tyank", "Tput", "Twrite", "Tattach" } },
  { "tpope/vim-dispatch",       cmd = { "Make", "Dispatch", "Start", "Spawn", "Focus", "Copen" } },
  { "tpope/vim-jdaddy",         ft = "json" },
  { "tpope/vim-bundler",        ft = "ruby", cmd = "Bundle" },
  { "tpope/vim-rake",           ft = "ruby", cmd = "Rake" },
  { "tpope/vim-rvm",            ft = "ruby" },
  { "godlygeek/tabular",        cmd = { "Tabularize", "AddTabularPattern", "AddTabularPipeline" } },
  { "airblade/vim-rooter",      event = "BufReadPre" },
  { "junegunn/goyo.vim",        cmd = "Goyo" },
  { "gcmt/wildfire.vim",        event = "VeryLazy" },
  { "AndrewRadev/splitjoin.vim", keys = { "gS", "gJ" } },
  {
    "lukas-reineke/indent-blankline.nvim",
    main = "ibl",
    event = { "BufReadPost", "BufNewFile" },
    opts = {
      indent = { char = "│" },
      scope = { enabled = true, show_start = false, show_end = false },
    },
  },
  { "arthurxavierx/vim-caser",  keys = { "gc" }, cmd = { "CaserSnakeCase", "CaserCamelCase" } },
  { "rizzatti/funcoo.vim",      lazy = true }, -- dep
  {
    "junegunn/vim-easy-align",
    keys = {
      { "ga", "<Plug>(EasyAlign)", mode = { "n", "x" }, desc = "EasyAlign" },
    },
  },
  {
    "easymotion/vim-easymotion",
    keys = {
      { "s",        "<Plug>(easymotion-overwin-f2)" },
      { "<leader>j", "<Plug>(easymotion-j)" },
      { "<leader>k", "<Plug>(easymotion-k)" },
    },
    init = function()
      vim.g.EasyMotion_do_mapping = 0
      vim.g.EasyMotion_smartcase = 1
    end,
  },
  { "RRethy/vim-illuminate", event = { "BufReadPost", "BufNewFile" } },

  ---------------------------------------------------------------------------
  -- Syntax / filetype-specific
  ---------------------------------------------------------------------------
  { "vim-scripts/vim-json-bundle", ft = "json" },
  { "honza/dockerfile.vim",        ft = "dockerfile" },
  {
    "plasticboy/vim-markdown",
    ft = "markdown",
    init = function()
      vim.g.vim_markdown_folding_disabled = 1
      vim.g.vim_markdown_frontmatter = 1
    end,
  },
  { "kevinhui/vim-docker-tools", cmd = { "DockerToolsOpen", "DockerToolsClose", "DockerToolsToggle" } },

  ---------------------------------------------------------------------------
  -- Testing / REPL / undo
  ---------------------------------------------------------------------------
  { "benmills/vimux", cmd = { "VimuxPromptCommand", "VimuxRunCommand", "VimuxRunLastCommand", "VimuxInspectRunner" } },
  {
    "janko/vim-test",
    dependencies = { "benmills/vimux" },
    cmd = { "TestNearest", "TestFile", "TestSuite", "TestLast", "TestVisit" },
    keys = {
      { "<leader>tn", ":TestNearest<CR>", desc = "Test nearest" },
      { "<leader>tf", ":TestFile<CR>",    desc = "Test file" },
      { "<leader>ta", ":TestSuite<CR>",   desc = "Test suite" },
      { "<leader>tt", ":TestLast<CR>",    desc = "Test last" },
    },
    init = function() vim.g['test#strategy'] = 'vimux' end,
  },
  { "rhysd/reply.vim",  cmd = { "Repl", "ReplAuto", "ReplStop" } },
  { "sjl/gundo.vim",    cmd = { "GundoToggle", "GundoShow", "GundoHide" }, keys = { { "<leader>G", ":GundoToggle<CR>", desc = "Toggle Gundo" } } },

  ---------------------------------------------------------------------------
  -- Misc
  ---------------------------------------------------------------------------
  {
    "tell-k/vim-browsereload-mac",
    cmd = { "ChromeReload", "FirefoxReload", "SafariReload" },
    keys = { { "<leader>r", ":ChromeReload<CR>", desc = "Chrome reload" } },
    init = function() vim.g.returnApp = "kitty" end,
  },
  -- Copilot: lua port with native nvim-cmp integration.
  {
    "zbirenbaum/copilot.lua",
    cmd = "Copilot",
    event = "InsertEnter",
    opts = {
      suggestion = { enabled = false }, -- handled via cmp
      panel = { enabled = false },
    },
  },
  {
    "zbirenbaum/copilot-cmp",
    dependencies = { "zbirenbaum/copilot.lua" },
    event = "InsertEnter",
    config = function() require("copilot_cmp").setup() end,
  },

  ---------------------------------------------------------------------------
  -- Modern essentials
  ---------------------------------------------------------------------------
  -- Treesitter: better syntax highlighting + folding + text objects.
  -- Replaces vim-polyglot for the languages it knows about.
  {
    "nvim-treesitter/nvim-treesitter",
    -- Pin to master: nvim-treesitter's main branch (default since late 2024)
    -- restructured the module layout and removed nvim-treesitter.configs,
    -- which most setups (including this one) call setup() through.
    branch = "master",
    build = ":TSUpdate",
    event = { "BufReadPost", "BufNewFile" },
    cmd = { "TSInstall", "TSUpdate", "TSBufEnable", "TSBufDisable", "TSEnable", "TSDisable" },
    dependencies = { "nvim-treesitter/nvim-treesitter-textobjects" },
    config = function()
      require("nvim-treesitter.configs").setup({
        ensure_installed = {
          "bash", "dockerfile", "go", "json", "lua", "markdown", "markdown_inline",
          "python", "ruby", "rust", "toml", "tsx", "typescript", "vim", "vimdoc", "yaml",
        },
        auto_install = true,
        -- tmux parser's release tarball is malformed upstream; auto_install
        -- chokes on it whenever a .tmux.conf is opened. Skip it.
        ignore_install = { "tmux" },
        highlight = { enable = true, additional_vim_regex_highlighting = false },
        indent = { enable = true },
        textobjects = {
          select = {
            enable = true,
            lookahead = true,
            keymaps = {
              ["af"] = "@function.outer", ["if"] = "@function.inner",
              ["ac"] = "@class.outer",    ["ic"] = "@class.inner",
              ["aa"] = "@parameter.outer",["ia"] = "@parameter.inner",
              ["al"] = "@loop.outer",     ["il"] = "@loop.inner",
            },
          },
          move = {
            enable = true,
            set_jumps = true,
            goto_next_start     = { ["]m"] = "@function.outer", ["]]"] = "@class.outer" },
            goto_previous_start = { ["[m"] = "@function.outer", ["[["] = "@class.outer" },
          },
        },
      })
    end,
  },
  { "nvim-treesitter/nvim-treesitter-textobjects", branch = "master", lazy = true },

  -- conform.nvim: format-on-save with per-filetype formatters.
  {
    "stevearc/conform.nvim",
    event = { "BufWritePre" },
    cmd = { "ConformInfo", "Format" },
    keys = {
      { "<leader>lf", function() require("conform").format({ async = true, lsp_fallback = true }) end, desc = "Format buffer" },
    },
    opts = {
      formatters_by_ft = {
        lua        = { "stylua" },
        python     = { "ruff_format", "black" },
        javascript = { "prettierd", "prettier", stop_after_first = true },
        typescript = { "prettierd", "prettier", stop_after_first = true },
        json       = { "prettierd", "prettier", stop_after_first = true },
        yaml       = { "prettierd", "prettier", stop_after_first = true },
        markdown   = { "prettierd", "prettier", stop_after_first = true },
        ruby       = { "rubocop" },
        rust       = { "rustfmt" },
        go         = { "gofmt" },
        sh         = { "shfmt" },
      },
      format_on_save = { timeout_ms = 500, lsp_fallback = true },
    },
  },

  -- which-key.nvim: modern lua rewrite of vim-which-key. Auto-discovers the
  -- leader bindings via lazy.nvim's keys = {...} desc fields.
  {
    "folke/which-key.nvim",
    event = "VeryLazy",
    opts = {},
    init = function()
      vim.o.timeout = true
      vim.o.timeoutlen = 300
    end,
  },
}
