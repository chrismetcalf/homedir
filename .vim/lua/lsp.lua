-- LSP Configuration
-- This file sets up Mason and LSP configurations
-- Updated for Neovim 0.11+ compatibility

-- Check if required plugins are available
local ok_mason, mason = pcall(require, "mason")
local ok_mason_lsp, mason_lsp = pcall(require, "mason-lspconfig")
local ok_cmp_lsp, cmp_nvim_lsp = pcall(require, "cmp_nvim_lsp")

if not (ok_mason and ok_mason_lsp and ok_cmp_lsp) then
  return
end

-- Setup Mason first
mason.setup({
  ui = {
    icons = {
      package_installed = "✓",
      package_pending = "➜",
      package_uninstalled = "✗"
    }
  }
})

-- Mason-lspconfig bridges mason.nvim and lspconfig
mason_lsp.setup({
  -- Automatically install these language servers
  ensure_installed = {
    "lua_ls",        -- Lua
    "pyright",       -- Python
    "ts_ls",         -- TypeScript/JavaScript (renamed from ts_server)
    "rust_analyzer", -- Rust
    -- "gopls",      -- Go (requires Go to be installed)
    "bashls",        -- Bash
    "jsonls",        -- JSON
    "yamlls",        -- YAML
  },
  automatic_installation = true,
})

-- LSP keybindings and options
local on_attach = function(client, bufnr)
  local opts = { noremap=true, silent=true, buffer=bufnr }

  -- Enable completion triggered by <c-x><c-o>
  vim.api.nvim_buf_set_option(bufnr, 'omnifunc', 'v:lua.vim.lsp.omnifunc')

  -- LSP Signature integration
  local ok_signature, lsp_signature = pcall(require, 'lsp_signature')
  if ok_signature then
    lsp_signature.on_attach({
      bind = true,
      handler_opts = {
        border = 'rounded'
      }
    }, bufnr)
  end

  -- Mappings using leader key
  vim.keymap.set('n', 'gD', vim.lsp.buf.declaration, opts)
  vim.keymap.set('n', 'gd', vim.lsp.buf.definition, opts)
  vim.keymap.set('n', 'K', vim.lsp.buf.hover, opts)
  vim.keymap.set('n', 'gi', vim.lsp.buf.implementation, opts)
  vim.keymap.set('n', '<leader>sh', vim.lsp.buf.signature_help, opts)
  vim.keymap.set('n', '<leader>wa', vim.lsp.buf.add_workspace_folder, opts)
  vim.keymap.set('n', '<leader>wr', vim.lsp.buf.remove_workspace_folder, opts)
  vim.keymap.set('n', '<leader>wl', function()
    print(vim.inspect(vim.lsp.buf.list_workspace_folders()))
  end, opts)
  vim.keymap.set('n', '<leader>D', vim.lsp.buf.type_definition, opts)
  vim.keymap.set('n', '<leader>rn', vim.lsp.buf.rename, opts)
  vim.keymap.set('n', '<leader>ca', vim.lsp.buf.code_action, opts)
  vim.keymap.set('n', 'gr', vim.lsp.buf.references, opts)
  vim.keymap.set('n', '<leader>e', vim.diagnostic.open_float, opts)
  vim.keymap.set('n', '[d', vim.diagnostic.goto_prev, opts)
  vim.keymap.set('n', ']d', vim.diagnostic.goto_next, opts)
  vim.keymap.set('n', '<leader>q', vim.diagnostic.setloclist, opts)
  vim.keymap.set('n', '<leader>lf', function() vim.lsp.buf.format { async = true } end, opts)
end

-- Configure diagnostic display
vim.diagnostic.config({
  virtual_text = true,
  signs = true,
  underline = true,
  update_in_insert = false,
  severity_sort = true,
})

-- Diagnostic signs
local signs = { Error = "✘", Warn = "▲", Hint = "⚑", Info = "»" }
for type, icon in pairs(signs) do
  local hl = "DiagnosticSign" .. type
  vim.fn.sign_define(hl, { text = icon, texthl = hl, numhl = hl })
end

-- Configure each language server using mason-lspconfig handlers
-- Compatible with Neovim 0.11+ and mason-lspconfig
local capabilities = cmp_nvim_lsp.default_capabilities()

-- Try to use setup_handlers if available (newer mason-lspconfig)
-- Otherwise fall back to manual setup
local has_handlers = pcall(function() return mason_lsp.setup_handlers end)

if has_handlers and mason_lsp.setup_handlers then
  -- Use the new handler-based approach
  mason_lsp.setup_handlers({
    -- Default handler for all servers
    function(server_name)
      local server_config = {
        on_attach = on_attach,
        capabilities = capabilities,
      }

      -- Server-specific settings
      if server_name == "lua_ls" then
        server_config.settings = {
          Lua = {
            diagnostics = { globals = {'vim'} },
            workspace = {
              library = vim.api.nvim_get_runtime_file("", true),
              checkThirdParty = false,
            },
            telemetry = { enable = false },
          },
        }
      elseif server_name == "rust_analyzer" then
        server_config.settings = {
          ['rust-analyzer'] = {
            checkOnSave = { command = "clippy" },
          },
        }
      end

      -- Use new Neovim 0.11 API if available, otherwise use lspconfig
      if vim.lsp.config then
        vim.lsp.config[server_name] = server_config
        vim.lsp.enable(server_name)
      else
        require('lspconfig')[server_name].setup(server_config)
      end
    end,
  })
else
  -- Fallback: Use new Neovim 0.11 vim.lsp.config API directly
  local servers = {
    lua_ls = {
      settings = {
        Lua = {
          diagnostics = { globals = {'vim'} },
          workspace = {
            library = vim.api.nvim_get_runtime_file("", true),
            checkThirdParty = false,
          },
          telemetry = { enable = false },
        },
      },
    },
    pyright = {},
    ts_ls = {},
    rust_analyzer = {
      settings = {
        ['rust-analyzer'] = {
          checkOnSave = { command = "clippy" },
        },
      },
    },
    -- gopls = {},  -- Requires Go to be installed
    bashls = {},
    jsonls = {},
    yamlls = {},
  }

  for server_name, server_settings in pairs(servers) do
    local config = vim.tbl_deep_extend('force', {
      on_attach = on_attach,
      capabilities = capabilities,
    }, server_settings)

    if vim.lsp.config then
      vim.lsp.config[server_name] = config
      vim.lsp.enable(server_name)
    else
      require('lspconfig')[server_name].setup(config)
    end
  end
end
