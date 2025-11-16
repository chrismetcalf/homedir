-- Bootstrap lazy.nvim
-- This file automatically installs lazy.nvim if it's not already installed

local lazypath = vim.fn.stdpath("data") .. "/lazy/lazy.nvim"
if not vim.loop.fs_stat(lazypath) then
  vim.fn.system({
    "git",
    "clone",
    "--filter=blob:none",
    "https://github.com/folke/lazy.nvim.git",
    "--branch=stable", -- latest stable release
    lazypath,
  })
end
vim.opt.rtp:prepend(lazypath)

-- Set leader key before loading plugins (it's already set in .vimrc, but we need it here too)
vim.g.mapleader = ","
vim.g.maplocalleader = ","

-- Setup lazy.nvim
require("lazy").setup("plugins", {
  -- Configuration options
  defaults = {
    lazy = false, -- Don't lazy load by default (we can enable for specific plugins)
    version = nil, -- Don't use version by default
  },
  install = {
    -- Install missing plugins on startup
    missing = true,
    -- Try to load one of these colorschemes when starting an installation during startup
    colorscheme = { "spaceduck", "habamax" },
  },
  checker = {
    -- Automatically check for plugin updates
    enabled = false,
    notify = false,
  },
  change_detection = {
    -- Automatically check for config file changes and reload the ui
    enabled = true,
    notify = false,
  },
  performance = {
    rtp = {
      -- Disable some rtp plugins
      disabled_plugins = {
        "gzip",
        "matchit",
        "matchparen",
        "netrwPlugin",
        "tarPlugin",
        "tohtml",
        "tutor",
        "zipPlugin",
      },
    },
  },
  ui = {
    -- The lazy.nvim UI
    border = "rounded",
    icons = {
      cmd = " ",
      config = "",
      event = "",
      ft = " ",
      init = " ",
      import = " ",
      keys = " ",
      lazy = "󰒲 ",
      loaded = "●",
      not_loaded = "○",
      plugin = " ",
      runtime = " ",
      source = " ",
      start = "",
      task = "✔ ",
      list = {
        "●",
        "➜",
        "★",
        "‒",
      },
    },
  },
})
