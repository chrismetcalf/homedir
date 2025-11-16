-- NvimTree Configuration
-- Modern file explorer for Neovim

local ok, nvim_tree = pcall(require, 'nvim-tree')
if not ok then
  return
end

-- Disable netrw (vim's built-in file explorer) in favor of nvim-tree
vim.g.loaded_netrw = 1
vim.g.loaded_netrwPlugin = 1

-- Enable 24-bit color
vim.opt.termguicolors = true

nvim_tree.setup({
  -- Automatically update the tree when files change
  auto_reload_on_write = true,

  -- Disable netrw completely
  disable_netrw = true,
  hijack_netrw = true,

  -- Update the focused file on `BufEnter`
  update_focused_file = {
    enable = true,
    update_root = false,
    ignore_list = {},
  },

  -- Show LSP diagnostics in the tree
  diagnostics = {
    enable = true,
    show_on_dirs = false,
    icons = {
      hint = "",
      info = "",
      warning = "",
      error = "",
    },
  },

  -- Git integration
  git = {
    enable = true,
    ignore = false,
    show_on_dirs = true,
    timeout = 400,
  },

  -- Filesystem watchers
  filesystem_watchers = {
    enable = true,
    debounce_delay = 50,
  },

  -- View options
  view = {
    width = 30,
    side = 'left',
    preserve_window_proportions = false,
    number = false,
    relativenumber = false,
    signcolumn = 'yes',
  },

  -- Renderer options
  renderer = {
    add_trailing = false,
    group_empty = false,
    highlight_git = true,
    full_name = false,
    highlight_opened_files = 'none',
    root_folder_label = ':~:s?$?/..?',
    indent_width = 2,
    indent_markers = {
      enable = true,
      inline_arrows = true,
      icons = {
        corner = "└",
        edge = "│",
        item = "│",
        bottom = "─",
        none = " ",
      },
    },
    icons = {
      webdev_colors = true,
      git_placement = 'before',
      padding = ' ',
      symlink_arrow = ' ➛ ',
      show = {
        file = true,
        folder = true,
        folder_arrow = true,
        git = true,
      },
      glyphs = {
        default = '',
        symlink = '',
        bookmark = '',
        folder = {
          arrow_closed = '',
          arrow_open = '',
          default = '',
          open = '',
          empty = '',
          empty_open = '',
          symlink = '',
          symlink_open = '',
        },
        git = {
          unstaged = '✗',
          staged = '✓',
          unmerged = '',
          renamed = '➜',
          untracked = '★',
          deleted = '',
          ignored = '◌',
        },
      },
    },
    special_files = { 'Cargo.toml', 'Makefile', 'README.md', 'readme.md', 'package.json' },
    symlink_destination = true,
  },

  -- File filters
  filters = {
    dotfiles = false,
    custom = { '.git', 'node_modules', '.cache' },
    exclude = {},
  },

  -- Actions
  actions = {
    use_system_clipboard = true,
    change_dir = {
      enable = true,
      global = false,
      restrict_above_cwd = false,
    },
    expand_all = {
      max_folder_discovery = 300,
      exclude = {},
    },
    open_file = {
      quit_on_open = false,
      resize_window = true,
      window_picker = {
        enable = true,
        chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890',
        exclude = {
          filetype = { 'notify', 'packer', 'qf', 'diff', 'fugitive', 'fugitiveblame' },
          buftype = { 'nofile', 'terminal', 'help' },
        },
      },
    },
    remove_file = {
      close_window = true,
    },
  },

  -- Trash configuration (requires trash-cli)
  trash = {
    cmd = 'trash',
    require_confirm = true,
  },

  -- Tab behavior
  tab = {
    sync = {
      open = false,
      close = false,
      ignore = {},
    },
  },

  -- Notification configuration
  notify = {
    threshold = vim.log.levels.INFO,
  },

  -- Log configuration
  log = {
    enable = false,
    truncate = false,
    types = {
      all = false,
      profile = false,
      config = false,
      copy_paste = false,
      diagnostics = false,
      git = false,
      watcher = false,
    },
  },
})

-- Auto-close nvim-tree when it's the last window
vim.api.nvim_create_autocmd('QuitPre', {
  callback = function()
    local tree_wins = {}
    local floating_wins = {}
    local wins = vim.api.nvim_list_wins()
    for _, w in ipairs(wins) do
      local bufname = vim.api.nvim_buf_get_name(vim.api.nvim_win_get_buf(w))
      if bufname:match('NvimTree_') ~= nil then
        table.insert(tree_wins, w)
      end
      if vim.api.nvim_win_get_config(w).relative ~= '' then
        table.insert(floating_wins, w)
      end
    end
    if #wins - #floating_wins - #tree_wins == 1 then
      -- Should quit, so we close all invalid windows.
      for _, w in ipairs(tree_wins) do
        vim.api.nvim_win_close(w, true)
      end
    end
  end,
})
