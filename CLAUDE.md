# Claude Code - Homedir Configuration Documentation

This document contains comprehensive information about the homedir configuration managed by Claude Code.

## Overview

This is a dotfiles repository that manages shell, editor, and development environment configurations. The setup is designed to work across multiple systems and includes automated linking via `gitfix`.

## Directory Structure

```
.homedir/
├── .vim/           # Neovim/Vim configuration
│   ├── lua/        # Lua configuration files
│   │   ├── plugins/         # Plugin specifications (lazy.nvim)
│   │   ├── lazy-bootstrap.lua
│   │   ├── lsp.lua
│   │   ├── completion.lua
│   │   ├── git-config.lua
│   │   ├── nvim-tree-config.lua
│   │   ├── autopairs-surround-config.lua
│   │   └── lsp-ui-config.lua
│   ├── plugin/     # Plugin initialization
│   └── spell/      # Spell check dictionaries
├── .zsh/           # Zsh configuration
├── bin/            # User scripts and utilities
├── .vimrc          # Main Vim configuration
├── .zshrc          # Zsh configuration
├── .tmux.conf      # Tmux configuration
└── CLAUDE.md       # This file (excluded from gitfix)
```

## Neovim Configuration

### Plugin Manager: lazy.nvim

The configuration uses **lazy.nvim** (migrated from vim-plug) for plugin management with the following benefits:
- Lazy-loading for faster startup
- Better dependency management
- Auto-installation on first run
- Uses `opts` over `config` where possible (best practice)

### Key Plugins

#### Core Functionality
- **nvim-lspconfig + Mason**: LSP support with automatic language server installation
- **nvim-cmp**: Completion engine with multiple sources:
  - cmp-nvim-lsp: LSP completions
  - cmp-buffer: Buffer completions
  - cmp-path: Path completions
  - cmp-cmdline: Command-line completions
  - cmp_luasnip: Snippet completions
- **LuaSnip**: Snippet engine

#### File Navigation
- **nvim-tree.lua**: Modern file explorer (`<leader>n` to toggle)
- **FZF + fzf.vim**: Fuzzy finder
  - `<leader>f`: Git files
  - `<leader>F`: All files
  - `<leader>b`: Buffers
  - `<leader>a`: Ag search

#### Git Integration
- **gitsigns.nvim**: Git signs in gutter with interactive staging
  - `]c`/`[c`: Navigate hunks
  - `<leader>hs`: Stage hunk
  - `<leader>hr`: Reset hunk
  - `<leader>hp`: Preview hunk
  - `<leader>hb`: Blame line
- **diffview.nvim**: Advanced diff viewing
  - `<leader>dv`: Open diffview
  - `<leader>dh`: File history
- **vim-fugitive**: Git commands
- **vim-rhubarb**: GitHub integration

#### LSP UI Enhancements
- **trouble.nvim**: Better diagnostics viewer
  - `<leader>xx`: Toggle Trouble
  - `<leader>xw`: Workspace diagnostics
  - `<leader>xd`: Document diagnostics
  - `<leader>xr`: LSP references
- **dressing.nvim**: Better UI for vim.ui.select and vim.ui.input
- **lsp_signature.nvim**: Function signatures while typing

#### Editing Enhancement
- **nvim-autopairs**: Auto-close brackets/quotes (integrated with nvim-cmp)
- **nvim-surround**: Surround text objects
  - `ys{motion}{char}`: Add surrounding
  - `ds{char}`: Delete surrounding
  - `cs{old}{new}`: Change surrounding
- **vim-commentary**: Comment/uncomment with `gc`
- **vim-easy-align**: Align text with `ga`

#### Visual
- **vim-airline**: Status line
- **spaceduck**: Color scheme
- **nvim-web-devicons**: File icons
- **indent Line**: Indent guides

#### Other
- **vim-test**: Test runner integration with Vimux
- **gundo.vim**: Undo tree visualization (`<leader>G`)
- **vim-tmux-navigator**: Seamless tmux/vim navigation
- **easymotion**: Fast cursor movement (`s{char}{char}`)
- **copilot.vim**: GitHub Copilot integration

### LSP Configuration

Language servers are auto-installed via Mason for:
- Lua (lua_ls)
- Python (pyright)
- TypeScript/JavaScript (ts_server)
- Rust (rust_analyzer)
- Go (gopls)
- Bash (bashls)
- JSON (jsonls)
- YAML (yamlls)

### Key Mappings

Leader key: `,`

#### LSP
- `gd`: Go to definition
- `gD`: Go to declaration
- `K`: Hover documentation
- `gi`: Go to implementation
- `gr`: Go to references
- `<leader>rn`: Rename
- `<leader>ca`: Code action
- `<leader>sh`: Signature help
- `[d` / `]d`: Previous/next diagnostic

#### File Navigation
- See FZF mappings above
- `<leader>n`: Toggle file tree
- `<leader>nf`: Find current file in tree

#### Git
- See gitsigns and diffview mappings above

#### Window Navigation
- `<C-h/j/k/l>`: Navigate windows
- `<C-left/right/up/down>`: Navigate windows (arrows)

#### Custom
- `jj`: Exit insert mode
- `jjw`: Exit and save
- `<leader>w`: Quick save
- `<leader><space>`: Clear search highlight
- `<leader>sp`: Toggle spell check

## Zsh Configuration

- Oh-My-Zsh framework
- Custom aliases and functions
- Git integration in prompt

## Tmux Configuration

- Powerline theme
- Vi-mode bindings
- Pane navigation synchronized with Vim

## Scripts in `bin/`

Various utility scripts for development and system management.

## Gitfix Integration

The `gitfix` script creates symlinks from this repo to the home directory.

**Note**: `CLAUDE.md` should be excluded from gitfix linking as it's documentation only.

## Recent Changes

### 2025-11-16: Lazy.nvim Migration
- Migrated from vim-plug to lazy.nvim
- Configured lazy-loading for ~70+ plugins
- Improved startup time with event-based loading
- Moved LSP UI configs to use `opts` instead of `config`
- Created separate plugin files for better organization:
  - `plugins/init.lua`: Main plugin specs
  - `plugins/ui.lua`: UI enhancement plugins (trouble, dressing, lsp_signature)

### Recent Enhancements
- Added modern git integration (gitsigns, diffview)
- Replaced gitgutter with gitsigns
- Added nvim-tree as modern file explorer
- Added auto-pairs and nvim-surround
- Added LSP UI enhancements (trouble, dressing, lsp_signature)
- Added command-line completion (cmp-cmdline)
- Fixed LSP keybinding conflict (`<C-k>`)

## Troubleshooting

### Neovim Plugin Issues

If plugins aren't loading:
1. Open Neovim and run `:Lazy` to see plugin status
2. Run `:Lazy sync` to update/install plugins
3. Check `~/.local/share/nvim/lazy/` for plugin directories

### LSP Not Working

1. Open Neovim and run `:LspInfo` to see LSP status
2. Run `:Mason` to check/install language servers
3. Check logs with `:LspLog`

### Completion Not Working

1. Verify nvim-cmp is loaded: `:lua print(vim.inspect(require('cmp')))`
2. Check completion sources in insert mode with `<C-Space>`

## Backup

A backup of the pre-lazy.nvim configuration exists at:
- `.vimrc.backup-lazy`

To restore vim-plug:
1. Restore the backup
2. Uncomment the Plug statements
3. Run `:PlugInstall`

## Performance

With lazy.nvim, Neovim startup time should be significantly faster:
- Plugins load on-demand
- LSP loads only for relevant file types
- Completion loads only in insert mode
- Git plugins load only for git repositories

To check startup time:
```bash
nvim --startuptime startup.log +quit && tail -20 startup.log
```

## Future Improvements

Potential additions:
- Treesitter for better syntax highlighting
- Telescope as a modern alternative to FZF
- Friendly-snippets collection
- Format-on-save for LSP
