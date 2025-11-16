-- LSP UI Enhancements Configuration
-- Better UI for LSP interactions with dressing, lsp_signature, and trouble

-- Dressing setup - Better UI for vim.ui.select and vim.ui.input
local ok_dressing, dressing = pcall(require, 'dressing')
if ok_dressing then
  dressing.setup({
    input = {
      -- Set to false to disable the vim.ui.input implementation
      enabled = true,

      -- Default prompt string
      default_prompt = 'Input:',

      -- Can be 'left', 'right', or 'center'
      title_pos = 'left',

      -- When true, <Esc> will close the modal
      insert_only = true,

      -- When true, input will start in insert mode.
      start_in_insert = true,

      -- These are passed to nvim_open_win
      border = 'rounded',
      -- 'editor' and 'win' will default to being centered
      relative = 'cursor',

      -- These can be integers or a float between 0 and 1 (e.g. 0.4 for 40%)
      prefer_width = 40,
      width = nil,
      -- min_width and max_width can be a list of mixed types.
      -- min_width = {20, 0.2} means "the greater of 20 columns or 20% of total"
      max_width = { 140, 0.9 },
      min_width = { 20, 0.2 },

      buf_options = {},
      win_options = {
        -- Disable line wrapping
        wrap = false,
        -- Indicator for when text exceeds window
        list = true,
        listchars = 'precedes:…,extends:…',
        -- Increase this for more context
        sidescrolloff = 0,
      },

      -- Set to `false` to disable
      mappings = {
        n = {
          ['<Esc>'] = 'Close',
          ['<CR>'] = 'Confirm',
        },
        i = {
          ['<C-c>'] = 'Close',
          ['<CR>'] = 'Confirm',
          ['<Up>'] = 'HistoryPrev',
          ['<Down>'] = 'HistoryNext',
        },
      },

      override = function(conf)
        -- This is the config that will be passed to nvim_open_win.
        -- Change values here to customize the layout
        return conf
      end,

      -- see :help dressing_get_config
      get_config = nil,
    },
    select = {
      -- Set to false to disable the vim.ui.select implementation
      enabled = true,

      -- Priority list of preferred vim.select implementations
      backend = { 'telescope', 'fzf_lua', 'fzf', 'builtin', 'nui' },

      -- Trim trailing `:` from prompt
      trim_prompt = true,

      -- Options for telescope selector
      telescope = nil,

      -- Options for fzf selector
      fzf = {
        window = {
          width = 0.5,
          height = 0.4,
        },
      },

      -- Options for fzf-lua
      fzf_lua = {
        -- winopts = {
        --   height = 0.5,
        --   width = 0.5,
        -- },
      },

      -- Options for nui Menu
      nui = {
        position = '50%',
        size = nil,
        relative = 'editor',
        border = {
          style = 'rounded',
        },
        buf_options = {
          swapfile = false,
          filetype = 'DressingSelect',
        },
        win_options = {
          winblend = 0,
        },
        max_width = 80,
        max_height = 40,
        min_width = 40,
        min_height = 10,
      },

      -- Options for built-in selector
      builtin = {
        -- Display numbers for options and set up keymaps
        show_numbers = true,
        -- These are passed to nvim_open_win
        border = 'rounded',
        -- 'editor' and 'win' will default to being centered
        relative = 'editor',

        buf_options = {},
        win_options = {
          cursorline = true,
          cursorlineopt = 'both',
        },

        -- These can be integers or a float between 0 and 1 (e.g. 0.4 for 40%)
        -- the min_ and max_ options can be a list of mixed types.
        -- max_width = {140, 0.8} means "the lesser of 140 columns or 80% of total"
        width = nil,
        max_width = { 140, 0.8 },
        min_width = { 40, 0.2 },
        height = nil,
        max_height = 0.9,
        min_height = { 10, 0.2 },

        -- Set to `false` to disable
        mappings = {
          ['<Esc>'] = 'Close',
          ['<C-c>'] = 'Close',
          ['<CR>'] = 'Confirm',
        },

        override = function(conf)
          -- This is the config that will be passed to nvim_open_win.
          -- Change values here to customize the layout
          return conf
        end,
      },

      -- Used to override format_item. See :help dressing-format
      format_item_override = {},

      -- see :help dressing_get_config
      get_config = nil,
    },
  })
end

-- LSP Signature setup - Show function signatures as you type
local ok_signature, lsp_signature = pcall(require, 'lsp_signature')
if ok_signature then
  lsp_signature.setup({
    debug = false, -- set to true to enable debug logging
    log_path = vim.fn.stdpath('cache') .. '/lsp_signature.log', -- log dir when debug is on
    verbose = false, -- show debug line number

    bind = true, -- This is mandatory, otherwise border config won't get registered.
    doc_lines = 10, -- will show two lines of comment/doc(if there are more than two lines in doc, will be truncated);
    max_height = 12, -- max height of signature floating_window
    max_width = 80, -- max_width of signature floating_window
    wrap = true, -- allow doc/signature text wrap inside floating_window, useful if your lsp return doc/sig is too long

    floating_window = true, -- show hint in a floating window, set to false for virtual text only mode

    floating_window_above_cur_line = true, -- try to place the floating above the current line when possible Note:
    floating_window_off_x = 1, -- adjust float windows x position.
    floating_window_off_y = 0, -- adjust float windows y position. e.g -2 move window up 2 lines; 2 move down 2 lines

    close_timeout = 4000, -- close floating window after ms when laster parameter is entered
    fix_pos = false,  -- set to true, the floating window will not auto-close until finish all parameters
    hint_enable = true, -- virtual hint enable
    hint_prefix = ' ', -- Panda for parameter, NOTE: for the terminal not support emoji, might crash
    hint_scheme = 'String',
    hint_inline = function() return false end, -- should the hint be inline(nvim 0.10 only)?  default no
    hi_parameter = 'LspSignatureActiveParameter', -- how your parameter will be highlight
    handler_opts = {
      border = 'rounded'   -- double, rounded, single, shadow, none, or a table of borders
    },

    always_trigger = false, -- sometime show signature on new line or in middle of parameter can be confusing, set it to false for #58

    auto_close_after = nil, -- autoclose signature float win after x sec, disabled if nil.
    extra_trigger_chars = {}, -- Array of extra characters that will trigger signature completion, e.g., {"(", ","}
    zindex = 200, -- by default it will be on top of all floating windows, set to <= 50 send it to bottom

    padding = '', -- character to pad on left and right of signature can be ' ', or '|'  etc

    transparency = nil, -- disabled by default, allow floating win transparent value 1~100
    shadow_blend = 36, -- if you using shadow as border use this set the opacity
    shadow_guibg = 'Black', -- if you using shadow as border use this set the color e.g. 'Green' or '#121212'
    timer_interval = 200, -- default timer check interval set to lower value if you want to reduce latency
    toggle_key = nil, -- toggle signature on and off in insert mode,  e.g. toggle_key = '<M-x>'
    toggle_key_flip_floatwin_setting = false, -- true: toggle float setting after toggle key pressed

    select_signature_key = nil, -- cycle to next signature, e.g. '<M-n>' function overloading
    move_cursor_key = nil, -- imap, use nvim_set_current_win to move cursor between current win and floating
  })
end

-- Trouble setup - Better diagnostics viewer
local ok_trouble, trouble = pcall(require, 'trouble')
if ok_trouble then
  trouble.setup({
    position = 'bottom', -- position of the list can be: bottom, top, left, right
    height = 10, -- height of the trouble list when position is top or bottom
    width = 50, -- width of the list when position is left or right
    icons = true, -- use devicons for filenames
    mode = 'workspace_diagnostics', -- 'workspace_diagnostics', 'document_diagnostics', 'quickfix', 'lsp_references', 'loclist'
    severity = nil, -- nil (ALL), vim.diagnostic.severity.ERROR, WARN, INFO, HINT
    fold_open = '', -- icon used for open folds
    fold_closed = '', -- icon used for closed folds
    group = true, -- group results by file
    padding = true, -- add an extra new line on top of the list
    action_keys = { -- key mappings for actions in the trouble list
      -- map to {} to remove a mapping, for example:
      -- close = {},
      close = 'q', -- close the list
      cancel = '<esc>', -- cancel the preview and get back to your last window / buffer / cursor
      refresh = 'r', -- manually refresh
      jump = {'<cr>', '<tab>'}, -- jump to the diagnostic or open / close folds
      open_split = { '<c-x>' }, -- open buffer in new split
      open_vsplit = { '<c-v>' }, -- open buffer in new vsplit
      open_tab = { '<c-t>' }, -- open buffer in new tab
      jump_close = {'o'}, -- jump to the diagnostic and close the list
      toggle_mode = 'm', -- toggle between 'workspace' and 'document' diagnostics mode
      switch_severity = 's', -- switch 'diagnostics' severity filter level to HINT / INFO / WARN / ERROR
      toggle_preview = 'P', -- toggle auto_preview
      hover = 'K', -- opens a small popup with the full multiline message
      preview = 'p', -- preview the diagnostic location
      close_folds = {'zM', 'zm'}, -- close all folds
      open_folds = {'zR', 'zr'}, -- open all folds
      toggle_fold = {'zA', 'za'}, -- toggle fold of current file
      previous = 'k', -- previous item
      next = 'j' -- next item
    },
    indent_lines = true, -- add an indent guide below the fold icons
    auto_open = false, -- automatically open the list when you have diagnostics
    auto_close = false, -- automatically close the list when you have no diagnostics
    auto_preview = true, -- automatically preview the location of the diagnostic. <esc> to close preview and go back to last window
    auto_fold = false, -- automatically fold a file trouble list at creation
    auto_jump = {'lsp_definitions'}, -- for the given modes, automatically jump if there is only a single result
    signs = {
      -- icons / text used for a diagnostic
      error = '',
      warning = '',
      hint = '',
      information = '',
      other = '',
    },
    use_diagnostic_signs = false -- enabling this will use the signs defined in your lsp client
  })
end
