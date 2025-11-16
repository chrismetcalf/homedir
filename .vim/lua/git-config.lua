-- Git Integration Configuration
-- This file sets up gitsigns and diffview

-- Gitsigns setup
local ok_gitsigns, gitsigns = pcall(require, 'gitsigns')
if ok_gitsigns then
  gitsigns.setup({
    signs = {
      add          = { text = '+' },
      change       = { text = '~' },
      delete       = { text = '_' },
      topdelete    = { text = '‾' },
      changedelete = { text = '~' },
      untracked    = { text = '┆' },
    },
    signcolumn = true,  -- Toggle with `:Gitsigns toggle_signs`
    numhl      = false, -- Toggle with `:Gitsigns toggle_numhl`
    linehl     = false, -- Toggle with `:Gitsigns toggle_linehl`
    word_diff  = false, -- Toggle with `:Gitsigns toggle_word_diff`
    watch_gitdir = {
      interval = 1000,
      follow_files = true
    },
    attach_to_untracked = true,
    current_line_blame = false, -- Toggle with `:Gitsigns toggle_current_line_blame`
    current_line_blame_opts = {
      virt_text = true,
      virt_text_pos = 'eol', -- 'eol' | 'overlay' | 'right_align'
      delay = 1000,
      ignore_whitespace = false,
    },
    current_line_blame_formatter = '<author>, <author_time:%Y-%m-%d> - <summary>',
    sign_priority = 6,
    update_debounce = 100,
    status_formatter = nil, -- Use default
    max_file_length = 40000,
    preview_config = {
      -- Options passed to nvim_open_win
      border = 'single',
      style = 'minimal',
      relative = 'cursor',
      row = 0,
      col = 1
    },
    on_attach = function(bufnr)
      local gs = package.loaded.gitsigns

      local function map(mode, l, r, opts)
        opts = opts or {}
        opts.buffer = bufnr
        vim.keymap.set(mode, l, r, opts)
      end

      -- Navigation
      map('n', ']c', function()
        if vim.wo.diff then return ']c' end
        vim.schedule(function() gs.next_hunk() end)
        return '<Ignore>'
      end, {expr=true})

      map('n', '[c', function()
        if vim.wo.diff then return '[c' end
        vim.schedule(function() gs.prev_hunk() end)
        return '<Ignore>'
      end, {expr=true})

      -- Actions
      map('n', '<leader>hs', gs.stage_hunk)
      map('n', '<leader>hr', gs.reset_hunk)
      map('v', '<leader>hs', function() gs.stage_hunk {vim.fn.line('.'), vim.fn.line('v')} end)
      map('v', '<leader>hr', function() gs.reset_hunk {vim.fn.line('.'), vim.fn.line('v')} end)
      map('n', '<leader>hS', gs.stage_buffer)
      map('n', '<leader>hu', gs.undo_stage_hunk)
      map('n', '<leader>hR', gs.reset_buffer)
      map('n', '<leader>hp', gs.preview_hunk)
      map('n', '<leader>hb', function() gs.blame_line{full=true} end)
      map('n', '<leader>tb', gs.toggle_current_line_blame)
      map('n', '<leader>hd', gs.diffthis)
      map('n', '<leader>hD', function() gs.diffthis('~') end)
      map('n', '<leader>td', gs.toggle_deleted)

      -- Text object
      map({'o', 'x'}, 'ih', ':<C-U>Gitsigns select_hunk<CR>')
    end
  })
end

-- Diffview setup
local ok_diffview, diffview = pcall(require, 'diffview')
if ok_diffview then
  diffview.setup({
    diff_binaries = false,    -- Show diffs for binaries
    enhanced_diff_hl = false, -- See ':h diffview-config-enhanced_diff_hl'
    git_cmd = { "git" },      -- The git executable followed by default args.
    use_icons = true,         -- Requires nvim-web-devicons
    icons = {                 -- Only applies when use_icons is true.
      folder_closed = "",
      folder_open = "",
    },
    signs = {
      fold_closed = "",
      fold_open = "",
    },
    view = {
      -- Configure the layout and behavior of different types of views.
      default = {
        -- Config for changed files, and staged files in diff views.
        layout = "diff2_horizontal",
      },
      merge_tool = {
        -- Config for conflicted files in diff views during a merge or rebase.
        layout = "diff3_horizontal",
        disable_diagnostics = true,
      },
      file_history = {
        -- Config for changed files in file history views.
        layout = "diff2_horizontal",
      },
    },
    file_panel = {
      listing_style = "tree",             -- One of 'list' or 'tree'
      tree_options = {                    -- Only applies when listing_style is 'tree'
        flatten_dirs = true,              -- Flatten dirs that only contain one single dir
        folder_statuses = "only_folded",  -- One of 'never', 'only_folded' or 'always'.
      },
      win_config = {                      -- See ':h diffview-config-win_config'
        position = "left",
        width = 35,
      },
    },
    file_history_panel = {
      log_options = {   -- See ':h diffview-config-log_options'
        git = {
          single_file = {
            diff_merges = "combined",
          },
          multi_file = {
            diff_merges = "first-parent",
          },
        },
      },
      win_config = {    -- See ':h diffview-config-win_config'
        position = "bottom",
        height = 16,
      },
    },
    commit_log_panel = {
      win_config = {},  -- See ':h diffview-config-win_config'
    },
    default_args = {    -- Default args prepended to the arg-list for the listed commands
      DiffviewOpen = {},
      DiffviewFileHistory = {},
    },
    hooks = {},         -- See ':h diffview-config-hooks'
    keymaps = {
      disable_defaults = false, -- Disable the default keymaps
      view = {
        -- The `view` bindings are active in the diff buffers, only when the current
        -- tabpage is a Diffview.
        ["<tab>"]      = false, -- Open the file in a new split in the previous tabpage
        ["<s-tab>"]    = false, -- Open the file in a new split in the previous tabpage
        ["gf"]         = false, -- Open the file in a new split in the previous tabpage
        ["<C-w><C-f>"] = false, -- Open the file in a new split
        ["<C-w>gf"]    = false, -- Open the file in a new tabpage
        ["]c"]         = false, -- Open the commit log panel.
        ["[c"]         = false, -- Open the commit log panel.
      },
      file_panel = {
        ["j"]             = false, -- Bring the cursor to the next file entry
        ["<down>"]        = false, -- Bring the cursor to the next file entry
        ["k"]             = false, -- Bring the cursor to the previous file entry
        ["<up>"]          = false, -- Bring the cursor to the previous file entry
        ["<cr>"]          = false, -- Open the diff for the selected entry.
        ["o"]             = false, -- Open the diff for the selected entry.
        ["<2-LeftMouse>"] = false, -- Open the diff for the selected entry.
        ["-"]             = false, -- Toggle the staged status of the selected entry.
        ["S"]             = false, -- Stage all entries.
        ["U"]             = false, -- Unstage all entries.
        ["X"]             = false, -- Restore entry to the state on the left side.
        ["R"]             = false, -- Refresh the entries in the file list.
        ["L"]             = false, -- Open the commit log panel.
        ["<c-b>"]         = false, -- Scroll the view up
        ["<c-f>"]         = false, -- Scroll the view down
        ["<tab>"]         = false, -- Select next entry
        ["<s-tab>"]       = false, -- Select previous entry
        ["gf"]            = false, -- Open the file in a new split in the previous tabpage
        ["<C-w><C-f>"]    = false, -- Open the file in a new split
        ["<C-w>gf"]       = false, -- Open the file in a new tabpage
        ["i"]             = false, -- Jump to the file's entry in the file list
        ["f"]             = false, -- Jump to the file
        ["<leader>e"]     = false, -- Focus the file panel
        ["<leader>b"]     = false, -- Toggle file panel focus
      },
      file_history_panel = {
        ["g!"]            = false, -- Options
        ["<C-A-d>"]       = false, -- Open the diff for the selected entry.
        ["y"]             = false, -- Copy the commit hash of the entry under the cursor
        ["L"]             = false, -- Open the commit log panel.
        ["zR"]            = false, -- Expand all folds
        ["zM"]            = false, -- Collapse all folds
        ["j"]             = false, -- Bring the cursor to the next file entry
        ["<down>"]        = false, -- Bring the cursor to the next file entry
        ["k"]             = false, -- Bring the cursor to the previous file entry
        ["<up>"]          = false, -- Bring the cursor to the previous file entry
        ["<cr>"]          = false, -- Open the diff for the selected entry.
        ["o"]             = false, -- Open the diff for the selected entry.
        ["<2-LeftMouse>"] = false, -- Open the diff for the selected entry.
        ["<c-b>"]         = false, -- Scroll the view up
        ["<c-f>"]         = false, -- Scroll the view down
        ["<tab>"]         = false, -- Select next entry
        ["<s-tab>"]       = false, -- Select previous entry
        ["gf"]            = false, -- Open the file in a new split in the previous tabpage
        ["<C-w><C-f>"]    = false, -- Open the file in a new split
        ["<C-w>gf"]       = false, -- Open the file in a new tabpage
        ["<leader>e"]     = false, -- Focus the file panel
        ["<leader>b"]     = false, -- Toggle file panel focus
      },
      option_panel = {
        ["<tab>"] = false, -- Select next entry
        ["q"]     = false, -- Close the panel
      },
    },
  })

  -- Keybindings for diffview
  vim.keymap.set('n', '<leader>dv', ':DiffviewOpen<CR>', { noremap = true, silent = true, desc = 'Open Diffview' })
  vim.keymap.set('n', '<leader>dc', ':DiffviewClose<CR>', { noremap = true, silent = true, desc = 'Close Diffview' })
  vim.keymap.set('n', '<leader>dh', ':DiffviewFileHistory<CR>', { noremap = true, silent = true, desc = 'File History' })
  vim.keymap.set('n', '<leader>df', ':DiffviewFileHistory %<CR>', { noremap = true, silent = true, desc = 'Current File History' })
end
