-- Auto-pairs and Surround Configuration
-- Automatically close brackets, quotes, etc. and manage surrounding pairs

-- Autopairs setup
local ok_autopairs, autopairs = pcall(require, 'nvim-autopairs')
if ok_autopairs then
  autopairs.setup({
    check_ts = true, -- Enable treesitter integration
    ts_config = {
      lua = {'string'},  -- Don't add pairs in lua string treesitter nodes
      javascript = {'template_string'},
      java = false,      -- Don't check treesitter on java
    },
    disable_filetype = { 'TelescopePrompt', 'vim' },
    disable_in_macro = false,  -- Disable when recording or executing a macro
    disable_in_visualblock = false, -- Disable when insert after visual block mode
    disable_in_replace_mode = true,
    ignored_next_char = [=[[%w%%%'%[%"%.%`%$]]=],
    enable_moveright = true,
    enable_afterquote = true,  -- Add bracket pairs after quote
    enable_check_bracket_line = true,  -- Check bracket in same line
    enable_bracket_in_quote = true, -- Enable bracket in quote
    enable_abbr = false, -- Trigger abbreviation
    break_undo = true, -- Switch for basic rule break undo sequence
    check_comma = true,
    map_cr = true,
    map_bs = true,  -- Map the <BS> key
    map_c_h = false,  -- Map the <C-h> key to delete a pair
    map_c_w = false, -- Map <c-w> to delete a pair if possible
  })

  -- Integration with nvim-cmp
  local ok_cmp, cmp = pcall(require, 'cmp')
  if ok_cmp then
    local cmp_autopairs = require('nvim-autopairs.completion.cmp')
    cmp.event:on(
      'confirm_done',
      cmp_autopairs.on_confirm_done()
    )
  end

  -- Custom rules
  local Rule = require('nvim-autopairs.rule')
  local cond = require('nvim-autopairs.conds')

  -- Add spaces between parentheses
  autopairs.add_rules({
    Rule(' ', ' ')
      :with_pair(function(opts)
        local pair = opts.line:sub(opts.col - 1, opts.col)
        return vim.tbl_contains({ '()', '[]', '{}' }, pair)
      end),
    Rule('( ', ' )')
      :with_pair(function() return false end)
      :with_move(function(opts)
        return opts.prev_char:match('.%)') ~= nil
      end)
      :use_key(')'),
    Rule('{ ', ' }')
      :with_pair(function() return false end)
      :with_move(function(opts)
        return opts.prev_char:match('.%}') ~= nil
      end)
      :use_key('}'),
    Rule('[ ', ' ]')
      :with_pair(function() return false end)
      :with_move(function(opts)
        return opts.prev_char:match('.%]') ~= nil
      end)
      :use_key(']'),
  })

  -- Arrow functions in JavaScript/TypeScript
  autopairs.add_rules({
    Rule('%(.*%)%s*%=>$', ' {  }', { 'typescript', 'typescriptreact', 'javascript', 'javascriptreact' })
      :use_regex(true)
      :set_end_pair_length(2),
  })
end

-- Surround setup
local ok_surround, surround = pcall(require, 'nvim-surround')
if ok_surround then
  surround.setup({
    keymaps = {
      insert = '<C-g>s',
      insert_line = '<C-g>S',
      normal = 'ys',
      normal_cur = 'yss',
      normal_line = 'yS',
      normal_cur_line = 'ySS',
      visual = 'S',
      visual_line = 'gS',
      delete = 'ds',
      change = 'cs',
    },
    -- Configuration here, or leave empty to use defaults
    surrounds = {
      -- Custom surrounds can be added here
      -- Example: Add a custom surround for function calls
      ['f'] = {
        add = function()
          local result = require('nvim-surround.config').get_input('Enter function name: ')
          if result then
            return { { result .. '(' }, { ')' } }
          end
        end,
        find = function()
          return require('nvim-surround.config').get_selection({ motion = 'a(' })
        end,
        delete = '^(.- %b())().*()$',
        change = {
          target = '^.-([%(%)]?)().-([%(%)]?)()()$',
          replacement = function()
            local result = require('nvim-surround.config').get_input('Enter function name: ')
            if result then
              return { { result .. '(' }, { ')' } }
            end
          end,
        },
      },
    },
    aliases = {
      ['a'] = '>',
      ['b'] = ')',
      ['B'] = '}',
      ['r'] = ']',
      ['q'] = { '"', "'", '`' },
      ['s'] = { '}', ']', ')', '>', '"', "'", '`' },
    },
    highlight = {
      duration = 200,
    },
    move_cursor = 'begin',
    indent_lines = function(start, stop)
      local b = vim.bo
      -- Only re-indent the selection if a formatter is set up.
      if start < stop and (b.equalprg ~= '' or b.indentexpr ~= '' or b.cindent or b.smartindent or b.lisp) then
        vim.cmd(string.format('silent normal! %dG=%dG', start, stop))
      end
    end,
  })
end
