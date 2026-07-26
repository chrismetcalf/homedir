# Claude Code - Homedir Configuration Documentation

This document contains comprehensive information about the homedir configuration managed by Claude Code.

## Overview

This is a dotfiles repository that manages shell, editor, and development environment configurations. The setup is designed to work across multiple systems and includes automated linking via `gitfix`.

## New machine setup

A fresh checkout needs more than `git pull` — submodules and per-host plugins are not auto-populated. Run these in order:

1. **Clone with submodules** (or initialize them in an existing clone):
   ```
   git clone --recurse-submodules <repo> ~/.homedir
   # existing clone:
   git -C ~/.homedir submodule update --init --recursive
   ```
   Submodules include `.oh-my-zsh`, `.oh-my-zsh-custom/plugins/zsh-syntax-highlighting`, `.oh-my-zsh-custom/plugins/zsh-autosuggestions`, `.oh-my-zsh-custom/themes/powerlevel10k`, `.tmux/plugins/tpm`, and the `bin/*.git` tools. Skipping this is what causes `[oh-my-zsh] plugin '...' not found` and a missing powerlevel10k prompt.
2. **`bin/gitfix`** — symlinks repo contents into `~/`, `~/.ssh/`, `~/.config/`.
3. **`claude-restore-plugins`** — reinstalls Claude Code plugins. Only `.claude/settings.json` (enabledPlugins + marketplaces), `.claude/skills/`, and the hook scripts `settings.json` points at (`.claude/hooks/`, `.claude/shellfish-notify.sh`) are versioned; the plugin files under `.claude/plugins/` are per-host. ("restore my plugins" maps here.)
4. **tmux → `prefix + I`** — tpm installs the tmux plugins (tmux-scout, etc.). Until tmux-scout is installed, the Claude hooks in `settings.json` no-op safely (they're guarded with `[ -f <script> ] && ...`), so a host without it won't throw `MODULE_NOT_FOUND`.

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
│   │   └── autopairs-surround-config.lua
│   └── spell/      # Spell check dictionaries (en.utf-8.add)
├── .zsh/           # Zsh configuration
├── bin/            # User scripts and utilities
├── .vimrc          # Main Vim configuration
├── .zshrc          # Zsh configuration
├── .tmux.conf      # Tmux configuration
└── CLAUDE.md       # Symlinked to ~/CLAUDE.md for Claude Code sessions
```

## Neovim Configuration

### Plugin Manager: lazy.nvim

Plugins are managed by **lazy.nvim**. The default in `lazy-bootstrap.lua` is `lazy = true` — each plugin opts out via `lazy = false` or opts in to a specific trigger (`event`/`cmd`/`keys`/`ft`). Of ~70 declared plugins, only ~8 load at startup; the rest fire on demand. Startup is ~40 ms cold.

Plugin specs live in `.vim/lua/plugins/init.lua` (main) and `.vim/lua/plugins/ui.lua` (LSP UI). Larger config blocks for individual plugins live in their own modules under `.vim/lua/` and are `require`'d from the spec's `config` function.

### Clipboard via OSC 52

`.vimrc` wires `vim.g.clipboard` to neovim's built-in `vim.ui.clipboard.osc52` provider, so every `y/d/c` pushes to the host terminal's clipboard over SSH. Works on Tabby (Mac/Win) and ShellFish (iOS). No `xclip`/`pbcopy` required — pure terminal escape sequence.

### Key Plugins

#### Core
- **nvim-lspconfig + Mason** (`+ mason-lspconfig`): LSP support; servers auto-installed
- **nvim-treesitter** (pinned to `master` branch): syntax, indent, folding
  - **nvim-treesitter-textobjects**: `vif`/`vac`/`vaa`/`val` for inner/around function/class/parameter/loop, `]m`/`[m` to jump between functions
  - `auto_install = true`, `ignore_install = { "tmux" }` (broken upstream tarball)
- **nvim-cmp**: completion engine; sources:
  - `copilot` (via copilot-cmp)
  - `nvim_lsp`, `luasnip`, `path`, `buffer`, `cmdline`
- **LuaSnip**: snippet engine

#### File Navigation
- **nvim-tree.lua**: file explorer (`<leader>n` toggle, `<leader>nf` find current file)
- **FZF + fzf.vim**: fuzzy finder
  - `<leader>f`: Git files
  - `<leader>F`: All files
  - `<leader>b`: Buffers
  - `<leader>a`: Ag search
  - `<leader>h`: Help tags
  - `<leader>c`: Commands

#### Git
- **gitsigns.nvim**: gutter signs + interactive staging
  - `]c`/`[c`: navigate hunks
  - `<leader>hs`: stage hunk; `<leader>hr`: reset; `<leader>hp`: preview; `<leader>hb`: blame line
- **diffview.nvim**: full diff viewer
  - `<leader>dv` open, `<leader>dc` close, `<leader>dh` file history, `<leader>df` current file history
- **vim-fugitive** + **vim-rhubarb**: `:Git ...` and GitHub `GBrowse`
- **git-messenger.vim**: `<leader>gm` for blame popup

#### LSP UI
- **trouble.nvim**: diagnostics viewer
  - `<leader>xx`/`xw`/`xd`/`xq`/`xl`/`xr`
- **dressing.nvim**: better `vim.ui.select` / `vim.ui.input`
- **lsp_signature.nvim**: function signatures while typing
- **conform.nvim**: format on save (stylua, prettierd, ruff, rubocop, rustfmt, gofmt, shfmt). `<leader>lf` to format manually.

#### Editing
- **nvim-autopairs**: bracket/quote autoclose (cmp-aware)
- **nvim-surround**: `ys{motion}{char}` add, `ds{char}` delete, `cs{old}{new}` change
- **vim-commentary**: `gc` to comment/uncomment
- **vim-easy-align**: `ga` to align
- **vim-illuminate**: highlight word matches under cursor
- **incsearch / hlsearch**: native (no plugin)

#### Visual
- **lualine.nvim**: statusline (`jellybeans` theme, globalstatus)
- **spaceduck**: colorscheme
- **nvim-web-devicons**: file icons
- **indent-blankline.nvim**: indent guides (treesitter-aware, replaces indentLine)
- **vim-devicons**: lualine icons

#### Other
- **vim-test** (+ vimux): `<leader>tn`/`tf`/`ta`/`tt` for nearest/file/suite/last
- **gundo.vim**: `<leader>G` undo tree
- **vim-tmux-navigator**: seamless `<C-h/j/k/l>` across tmux+vim panes
- **easymotion**: `s{char}{char}` jump
- **folke/which-key.nvim**: keybind popup (`VeryLazy`, auto-discovers `desc` from lazy keys)
- **copilot.lua + copilot-cmp**: Copilot suggestions inline in nvim-cmp menu (replaces copilot.vim)

### LSP servers (Mason auto-installs)

- `lua_ls`, `pyright`, `ts_ls`, `rust_analyzer`, `bashls`, `jsonls`, `yamlls`
- `gopls` is commented out; uncomment if Go is installed

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

- **Oh-My-Zsh** framework, custom plugins in `.oh-my-zsh-custom/`
- **Prompt**: powerlevel10k (configured via `~/.p10k.zsh`)
- **Per-host HISTFILE** under `~/.zsh-history/$(hostname -s)`
- **Per-fragment rc files** under `.zsh/rc/` (numbered prefixes order the load: `00-oh-my-zsh`, then alphabetical, then `99-isomorphic-copy`)
- **NVM lazy-loaded** via wrapper functions in `.zsh/rc/nvm` (first call to `nvm`/`node`/`npm`/`npx` sources nvm.sh, then replaces itself with the real binary)
- **zsh-syntax-highlighting + zsh-autosuggestions**: fish-style coloring + history suggestions, as oh-my-zsh-custom plugins
- **Compile on save**: `.zshrc` runs `zcompile` async at end so subsequent loads are faster
- **`~/.zshrc.local`** (NOT in repo, chmod 600) holds per-host secrets + tmux auto-attach, and builds `$PATH`
- **PATH ⚠️ keep network mounts OUT of the front**: command resolution stats every earlier PATH entry before the match, so an NFS/automount dir (e.g. `/mnt/argabuthon/…/.opencode/bin`) early in PATH stalls *every* command when the mount is slow/remounting → multi-second lag box-wide. opencode is symlinked into `~/.local/bin` instead; `typeset -U path` dedupes. A running tmux server caches its env PATH from start, so clearing it there needs `tmux set-environment -g PATH …` (or a server restart)

## Tmux Configuration

- **tmux-powerline** theme: `.config/tmux-powerline/themes/chrismetcalf.sh`
  - Jewel-tone palette aligned with tmux-scout state colors
  - Custom segments: `tmux_scout` (silent ticker), `rainbarf`
- **tmux-scout** (qeesung/tmux-scout): tracks Claude Code / Codex / Gemini / etc. sessions
  - `prefix + \``: open session picker; `prefix + ~`: jump to the next agent pane awaiting input (`bin/tmux-scout-next-wait`)
  - `bin/tmux-scout-window-tint` runs every status-interval and sets `@scout-state` per window so window-status-format tints the whole tab text: **red=wait, orange=busy, teal=done**, dim/none=idle
  - **Wait detection** mirrors scout's own `needsAttention` (a permission/question prompt), NOT a `pendingToolUse`-age heuristic (that false-tinted any long-running tool). `needsAttention` only fires when the **`PermissionRequest` hook** is registered in `~/.claude/settings.json`; Claude Code binds hooks at session start, so sessions started before the hook won't fire it. A **pane-content fallback** in the tint scrapes each agent pane for Claude's live approval dialog (`❯ <n>.` selector + an "Esc to cancel"/"Tab to amend" footer) and tints wait regardless of hooks — dialog text merely quoted in scrollback is deliberately ignored. Same criteria in `tmux-scout-next-wait`.
- **Window sidebar** (`prefix + W`): per-window narrow left pane listing every window (index + name + scout-state color, active highlighted). `bin/tmux-window-sidebar` renders; `tmux-sidebar-{toggle,ensure,click,resize}` drive it. Follow hooks (`after-select-window`/`after-new-window`) add it to windows as you visit/create them; the `window-resized` hook re-pins width to `@sidebar-width` (24). Focus-safe (`split -d`), self-destructs if it becomes the last pane, and a row click switches windows (`MouseDown1Pane` over sidebar panes only).
- **Window tabs**: names truncated to 14 chars via `#{=/14/…:window_name}` in the theme so many long agent-worktree tabs stay readable before the bar scrolls.
- **`status-interval` = 5**: tmux-powerline's `main.tmux` forces it to its own default (1) as tpm loads it, which restacks status renders faster than they finish (fork storm → box-wide lag). `.tmux.conf` **re-asserts `set -g status-interval 5` AFTER the tpm line** so it wins.
- **OSC 52 copy**: `@override_copy_command 'tmux load-buffer -w -'` routes every yank through tmux's buffer + OSC 52 to the host terminal clipboard (Tabby, ShellFish)
- **Keybindings**:
  - `prefix + r`: reload `.tmux.conf`
  - `prefix + |` / `prefix + -`: vertical / horizontal split
  - `prefix + W`: toggle window sidebar · `prefix + ~`: next agent pane awaiting input · `prefix + b`: break pane to its own window · `prefix + m`: tappable (ShellFish) action menu
  - `<C-h/j/k/l>`: pane nav (with vim-tmux-navigator)
- **Dark theme**: all `*-style` options explicitly set to `bg=colour235` so activity/bell flags don't flip to white
- `renumber-windows on`, `detach-on-destroy off`

## Scripts in `bin/`

Utility scripts on `$PATH` (via `.zsh/rc/exports`). Notable ones:

- **`gitfix`**: re-runnable symlink installer. Walks `.homedir/`, `.homedir/.ssh/`, `.homedir/.config/` and links matching entries into `~/`, `~/.ssh/`, `~/.config/`. Uses `dircombine` (Joey Hess, perl) which maintains a `known` file per source dir to clean up stale links on re-run. Skips `.git`, `.gitignore`, `.gitmodules`, `.svn`, `_darcs`.
- **`install-neovim`**: downloads latest Neovim release into `~/bin/nvim` (Linux x86_64/arm64 tarballs, macOS x86_64/arm64).
- **`claude-restore-plugins`**: reinstall Claude Code plugins on a new machine. Only `.claude/settings.json` (enabledPlugins + marketplaces), `.claude/skills/`, and the `settings.json` hook scripts (`.claude/hooks/deletion-circuit-breaker.sh`, `.claude/shellfish-notify.sh`) are versioned; the marketplace plugin files under `.claude/plugins/` aren't, so this re-adds the custom marketplaces and `claude plugin install`s each one. Run after `gitfix` on a fresh checkout. ("restore my plugins" → run this.)
- **`setup_osx`**: macOS `defaults write` bootstrap (Sonoma/Sequoia idioms; sections for UI, keyboard, trackpad, Dock, Finder, etc.)
- **`tmux-scout-window-tint`**: ticker (reads `~/.tmux-scout/status.json` via scout's own sync/render libs) that sets `@scout-state` per window; wait = scout `needsAttention` or a live approval dialog scraped from the pane. **`tmux-scout-next-wait`** (`prefix + ~`): jump to the next agent pane awaiting input.
- **`tmux-window-sidebar`** + **`tmux-sidebar-{toggle,ensure,click,resize}`**: the `prefix + W` window sidebar — render loop, per-window spawn/teardown, click-to-switch, and resize re-pin.
- **`tmux-askpass`**: tmux popup for sudo password prompts
- **`ha`, `ha-service`**: Home Assistant CLI wrappers (use env vars from `~/.zshrc.local`)
- **`pushover`**: simple notification wrapper (used by `rsnapshot-wrapper.sh`)
- **`update-keys`**: pull authorized_keys from GitHub
- **`merge-tmux`**: combine all tmux sessions into "main"
- **`pi-system-status`**, **`ping-monitor*`**, **`sshscan`**, **`set-time-from-nmea-ip`**: misc system tools

Submodules under `bin/` (named `*.git/`): `ansiweather.git`, `multi-git-status.git`, `isomorphic-copy.git`. Top-level symlinks `ansiweather` and `mgitstatus` invoke the binaries inside.

## Gitfix

`gitfix` symlinks repo contents into `~/`:
- `.ssh/` and `.config/` are kept as real dirs; individual entries from `.homedir/.ssh/` and `.homedir/.config/` are linked into them (so non-repo files like `~/.ssh/known_hosts` coexist).
- Everything else in `.homedir/` is symlinked top-level (`~/.zsh → .homedir/.zsh`, `~/.vim → .homedir/.vim`, etc.).
- `~/CLAUDE.md → .homedir/CLAUDE.md` so Claude Code sessions started from `~/` pick up this doc.

## Out-of-repo files referenced by this setup

- `~/.zshrc.local` — per-host secrets + tmux auto-attach (chmod 600)
- `~/.shellfish-secrets` — Secure ShellFish push key/user, sourced by `.zsh/rc/shellfishrc` (chmod 600)
- `~/.shellfishrc` — Secure ShellFish's own shell integration, dropped in by the app's installer; sourced from `.zshrc` behind a `test -e` guard (chmod 700)
- `~/.ssh/config.local` — per-host SSH overrides, `Include`d from `.ssh/config` (chmod 600)
- `~/.ssh/sockets/` — ControlMaster sockets (chmod 700)
- `~/.ssh/id_rsa`, `~/.ssh/id_ed25519` — keys (never committed; `.gitignore` defensively blocks `.ssh/id_*`)

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

### Terminal / prompt feels laggy

On a big box, interactive lag is usually **process-spawn latency, not CPU** (`time bash ~/.tmux/plugins/tmux-powerline/powerline.sh right` taking seconds at ~0% CPU = blocked on I/O). Three usual causes, in order:

1. **`/tmp` bloat** — `ls -1 /tmp | wc -l`. Otto's goal/relay + test suite leak empty `goal-*` temp dirs; tens of thousands make every temp-file op O(n) slow. Clear stale ones: `find /tmp -maxdepth 1 -name 'goal-*' -mmin +60 -exec rm -rf {} +`.
2. **NFS automount in `$PATH`** — `echo $PATH | tr : '\n' | grep /mnt`. A slow/remounting NFS dir early in PATH stalls every command lookup (negative-lookup stats). Keep such dirs out of PATH (see Zsh Configuration); a running tmux server also needs `tmux set-environment -g PATH …`.
3. **tmux status fork-storm** — many transient `sh`/`node` children under `tmux: server`. If `status-interval` is 1 and a render takes >1s (from #1/#2), renders stack and feed back. Fix live: `tmux set -g status-interval 5` (already pinned in `.tmux.conf` after tpm).
