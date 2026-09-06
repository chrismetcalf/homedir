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
4. **`homedir-install`** — fetches the CLI tools the shell config expects (zoxide, eza, bat, lazygit, lazydocker, yazi), built for *this* platform, into `~/.local/bin`. Every `.zsh/rc/` fragment is guarded on its binary existing, so skipping this leaves a working but plainer shell rather than an error — which is exactly why nothing tells you it is missing.
5. **`bat cache --build`** — once per host, if bat is installed. bat compiles themes into `~/.cache/bat`; until then it *silently* falls back to its default theme.
6. **tmux → `prefix + I`** — tpm installs the tmux plugins (tmux-scout, etc.). Until tmux-scout is installed, the Claude hooks in `settings.json` no-op safely (they're guarded with `[ -f <script> ] && ...`), so a host without it won't throw `MODULE_NOT_FOUND`.

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
- **lualine.nvim**: statusline (`tokyonight` theme, globalstatus)
- **tokyonight.nvim** (folke): colorscheme, `night` style — byte-for-byte the same `#1a1b26`/`#c0caf5` as tmarchy's tokyo-night bar, which was the spec's one knowingly-accepted clash ("nvim will clash with a Tokyo Night bar"). Four styles ship: night, storm, moon, day. Switching tmarchy to another of its nine themes does **not** move nvim — that sync is a separate piece of work.
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
- **Prompt**: powerlevel10k (configured via `~/.p10k.zsh`, which is versioned here). Colours are Tokyo Night hex, matching tmarchy's tokyo-night bar and nvim's tokyonight-night — p10k accepts `#rrggbb` directly. They were 256-colour indices from the 2020 wizard run, mapped by **hue** rather than nearest RGB: an RGB match collapsed saturated darks into grey and turned the error red (colour 160) into `#545c7e`, which would have made a failed command look like ordinary dim text. **The prompt follows the tmarchy theme** (2026-09-05): the 66 colour assignments read ten `tm_*` variables sourced from `~/.local/state/tmarchy/current.p10k.zsh`, and the Tokyo Night hex above is now the *fallback* — what a host with no tmarchy state renders, which keeps a bare `source ~/.p10k.zsh` correct on its own. p10k resolves colours once at load, not per prompt, so a running shell keeps its colours until `exec zsh`. Values arrive **pre-converted**: p10k takes `#rrggbb` or a bare 0-255 index but not tmux's `colour214` spelling, so jewel is translated in `tmarchy-theme` rather than in a zsh config running under `setopt no_unset`, where a bad value fails the whole prompt instead of one segment.
- **Per-host HISTFILE** under `~/.zsh-history/$(hostname -s)`
- **Per-fragment rc files** under `.zsh/rc/` (numbered prefixes order the load: `00-oh-my-zsh`, then alphabetical, then `99-isomorphic-copy`)
- **NVM lazy-loaded** via wrapper functions in `.zsh/rc/nvm` (first call to `nvm`/`node`/`npm`/`npx` sources nvm.sh, then replaces itself with the real binary)
- **zsh-syntax-highlighting + zsh-autosuggestions**: fish-style coloring + history suggestions, as oh-my-zsh-custom plugins
- **Compile on save**: `.zshrc` runs `zcompile` async at end so subsequent loads are faster
- **Modern CLI kit** (`zoxide`, `eza`, `bat`), each in its own `.zsh/rc/` fragment and each **guarded on the binary existing**, because this repo deploys to several Linux distros, macOS and WSL while the binaries are installed per host. An unguarded `eval "$(zoxide init zsh)"` would print an error on every new shell of a host that lacks it.
  - **`zoxide` replaced autojump** (2026-09-04), including the oh-my-zsh `autojump` plugin. `j` is kept, and keeps *both* of the old function's behaviours: bare `j` opens an fzf picker, `j <query>` jumps. Plain `z` does not — bare `z` goes to `$HOME`. The old database was imported once with `zoxide import autojump`; that **merges**, so never re-run it on a host that already has one.
  - **`bat` is `batcat` on Debian/Ubuntu/WSL** — the name `bat` was taken by `bacula-console-qt`. `.zsh/rc/bat` resolves either name, so the file does not silently no-op on exactly the platform the rename exists for. `MANROFFOPT=-c` is set on Linux only: groff ≥ 1.23 needs it, and macOS's older groff errors on it.
  - **bat's theme is `tokyonight_night` — the FILENAME stem**, not the `<key>name</key>` inside the tmTheme (which is `TokyoNight` and does not work). bat **silently ignores an unknown theme name** and falls back, so getting this wrong looks like slightly-off colours forever rather than an error. The file is the official one from `folke/tokyonight.nvim`, carrying the same `#1a1b26`/`#c0caf5` as nvim, the bar and the prompt. A new host must run **`bat cache --build`** once; the compiled cache lives in `~/.cache/bat` and is deliberately not in this repo.
  - `ls`/`ll`/`la`/`lt` are `eza` with **`--icons=auto --color=auto`**, never the unconditional flags: `auto` means "only when stdout is a terminal", so `ls | grep` and `ls > file` stay parseable.
- **`y` opens yazi with a cwd handoff** (`.zsh/rc/yazi`): quit with **`q`** and the *shell* follows you to wherever you browsed. Lowercase: `Q` is "quit without outputting cwd-file", the key for deliberately *not* moving. `prefix + e` cannot do that — a popup has no way to move its parent pane without injecting a command into it, which is the hazard `tmux-gen` exists to guard against — so browsing-to-navigate lives in the shell function and glance-at-a-tree lives on the key.
- **`~/.zshrc.local`** (NOT in repo, chmod 600) holds per-host secrets + tmux auto-attach, and builds `$PATH`
- **PATH ⚠️ tmux caches its own**: the server captures `PATH` at start, and a tmux command that runs a binary *directly* — `new-window … "claude --remote-control %1"`, as the `+Agents → New vault session` entry does — never goes through a login shell, so it uses that cached copy rather than the one `.zshrc.local` builds. This silently ran a **stale root-owned `/usr/local/bin/claude` from June (2.1.169, predating Opus 5)** in those windows while every ordinary pane ran the current `~/.local/bin/claude`. `.tmux.conf` now prepends both `~/bin` and `~/.local/bin` to the server environment, each behind an idempotent guard so `prefix + r` is safe. Symptom to recognise: a tool behaving like an old version *only* when launched from a binding or menu.
- **PATH ⚠️ keep network mounts OUT of the front**: command resolution stats every earlier PATH entry before the match, so an NFS/automount dir (e.g. `/mnt/argabuthon/…/.opencode/bin`) early in PATH stalls *every* command when the mount is slow/remounting → multi-second lag box-wide. opencode is symlinked into `~/.local/bin` instead; `typeset -U path` dedupes. A running tmux server caches its env PATH from start, so clearing it there needs `tmux set-environment -g PATH …` (or a server restart)

## Tmux Configuration

- **tmarchy** — native status bar (`tmarchy/`, replaced tmux-powerline 2026-08-25). Loaded by an explicit `run-shell` AFTER tpm rather than as a tpm plugin (tpm load ordering has caused three separate incidents in this repo). Four layers:
  1. **`tmarchy/tmarchy.tmux`** — entry point. Restores the persisted theme from `~/.local/state/tmarchy/theme` (falls back to `tokyo-night` if the file is missing or names a theme that no longer exists), then sources `bar.conf`. Idempotent, safe on every `prefix + r`.
  2. **`tmarchy/bar.conf`** — the bar itself: `status-left`/`status-right`/tab formats. Every value is a tmux format string (`#{...}`) reading `@theme-*` and `@bar-*` options; the **only** shell-out in the whole file is one guarded `#()`.
  3. **`tmarchy/bin/tmarchy-tick-guard`** (invoked by that `#()`) **+ `tmarchy/bin/tmarchy-tick`** — the ticker. tmux re-runs that `#()` roughly once per `status-interval` **per attached client**, plus once per explicit `refresh-client -S` — pane output does not drive it (measured: idle and a pane in a tight echo loop both sit at 0.20/sec at interval 5; the 2.0 node spawns/sec that motivated the guard was 2 attached clients on powerline's `status-interval 1`, not a redraw storm). The guard is bash-builtins-only (no `date`/`cat`/test binary) and drops all but one call per `status-interval` (5s) **before node ever starts**; only a call that survives execs `tmarchy-tick`, which writes `@scout-state`/`@remote-host` per window and `@bar-*` globals (load, agents, branch, remote, battery) for `bar.conf` to read on the next redraw. A failed or skipped tick just leaves the previous values standing — one interval stale, never broken.
  4. **`tmarchy/lib/` + `tmarchy/segments.d/`** — the JS engine `tmarchy-tick` calls: `lib/context.js` (current pane's repo/branch/ssh context), `lib/scout.js` (per-window agent wait/busy/done state, same criteria as `tmux-scout-next-wait`), `lib/segments.js` (loads every `segments.d/*.js` exporting `name`/`enabled()`/`render(ctx)`; one segment's failure never takes another down), `lib/tmux.js` (the `set`/`show`/`refresh-client` wrapper).
  - **Governing invariant: node runs at most once per status-interval.** (Not "nothing forks a shell" — tmux does fork a shell for the guard on every invocation; that shell just exits on bash builtins before node ever starts.) This is what took status-bar forks from 7.7/sec under powerline to 0.5/sec under tmarchy — the tick guard above is what makes it hold even with several attached clients or a low interval.
  - **`@theme-*` vocabulary** — ten options per theme (`bg`, `fg`, `dim`, `accent`, `accent-alt`, `border`, `wait`, `busy`, `done`, `remote`), set once by `themes/<name>.conf` when the theme loads, never looked up per redraw. Nine themes ship: tokyo-night (default), catppuccin, everforest, gruvbox, kanagawa, nord, rose-pine, matte-black, jewel (the old tmux-powerline palette, kept for parity).
  - **The theme now moves nvim, bat and the fzf pickers too**, not just the bar (2026-09-05). Two surfaces need a *name*, not a palette: ten semantic colours describe a status bar and cannot express what a syntax highlighter does, so each `themes/<name>.conf` declares `@theme-nvim` and `@theme-bat` alongside its colours. Four map exactly (tokyo-night, catppuccin, gruvbox, nord all have real bat themes); the rest name the closest built-in and say so in the file. **`matte-black` and `jewel` need no nvim plugin at all** — Neovim's built-in `quiet` is near-monochrome and `retrobox` is the closest saturated dark.
    - `tmarchy-theme sync` generates `~/.local/state/tmarchy/current.sh` (sourced by `.zsh/rc/bat`), `current.lua` (read by `.vim/lua/tmarchy-theme.lua`), `current.p10k.zsh` (sourced by `.p10k.zsh`) and `~/.claude/themes/tmarchy.json` (the Claude Code CLI), **parsed from the theme file rather than from live tmux options** — switching must work with no server running, and a login shell on a host that has never started tmux still needs a theme. `tmarchy.tmux` calls it on every load, so a fresh checkout or a fallback-to-default cannot leave the shell and editor on a different theme than the bar. Written atomically: the shell *sources* `current.sh` on every login, so a half-written file is a broken login, not a wrong colour.
    - **`BAT_THEME` overrides `.config/bat/config`** (verified against an explicit `--theme`), which is the layering: the config file is the default for a host with no tmarchy state, the env var is the live value.
    - nvim falls back to `tokyonight-night` when the state file is missing, corrupt, or names an uninstalled scheme — all three tested. `:TmarchyTheme` repaints a running editor; otherwise the change lands on next launch. lualine is `theme = 'auto'` so it follows rather than pinning.
    - **`bin/tmarchy-theme-selftest` checks every declared bat theme actually exists**, because bat *silently* ignores an unknown theme and falls back. A typo in a mapping is otherwise invisible — the colours are merely wrong, never an error. Verified non-vacuous by breaking a mapping and confirming it fails.
    - **p10k and the Claude Code CLI follow the theme too** (2026-09-05), which completes the propagation. Both needed something the bar's vocabulary did not carry, so `@theme-*` went from ten options to **fourteen**: `info` (a secondary data colour), `accent-muted` (a tertiary accent), `alert` (a critical level above `busy`) and `fg-muted` (dimmer than `fg`, lighter than `dim`). A prompt draws distinctions a status bar does not — a load average merely high against one that is critical, a truncated path segment against its anchor — and collapsing those onto near neighbours would have made `DIR` and the load segments the same colour.
      - Each theme names its own four from its **published palette** rather than having them synthesised from the ten, for the same reason the original p10k colours were mapped by hue: derived values collapse saturated darks into grey. Three themes originally collided — everforest and rose-pine reused a hue already spent, gruvbox put `info` and `remote` on the same aqua — so the selftest now asserts `info`, `remote` and `done` are pairwise distinct **per theme**, since those three render on one prompt line.
      - Claude Code takes a *palette*, not a theme name, so unlike bat and nvim this one is **generated**: a fixed `custom:tmarchy` whose contents change, rather than nine JSONs with `settings.json` rewritten on each switch — `settings.json` is versioned and that would dirty the repo every time. `.claude/themes/tmarchy.json` is gitignored for the same reason; `tokyo-night.json` stays as the static hand-tuned option. Its six diff backgrounds are the one thing no semantic token carries — a *tint* of the background rather than a foreground — so they are derived by mixing `bg` toward `done`/`wait`, which is what gives all nine themes diff colours instead of only the one that was hand-picked.
      - jewel is 256-colour, so both new consumers need conversion its predecessors did not: `to_p10k` strips the prefix to a bare index, and `to_hex` resolves through the xterm-256 table because Claude Code themes are hex-only. Skipping jewel would have left one of the nine unable to move the CLI at all.
      - **The selftest sandboxes `CLAUDE_CONFIG_DIR` as well as `XDG_STATE_HOME`.** When the Claude output was first added, three of its five `sync` calls carried only the latter, so running the suite silently rewrote the real `~/.claude/themes/tmarchy.json` to whichever theme its loop ended on. Both are now exported once at the top rather than repeated per call site. `homedir-doctor` is what caught it.
  - **`prefix + ?` → `+Set` → `Theme…`** opens `bin/tmux-theme-pick` (see the scripts list below) to fuzzy-switch + persist via `tmarchy/bin/tmarchy-theme set <name>`; `tmarchy-theme current` / `tmarchy-theme list` report from the CLI. This replaced a dedicated top-level `+Theme` submenu that listed all nine as individual entries — one picker with a preview does the same job in one row instead of nine, and it stays correct as themes are added or removed since the picker globs the directory rather than needing a matching menu entry per theme (see "How to add a theme" in `tmarchy/README.md`, which no longer has a menu-entry step for the same reason). See `tmarchy/README.md` for the full layer breakdown, how to add a theme or segment, and the rollback procedure.
  - **The bar is narrower on the phone.** tmux expands status formats *per attached client*, so one session renders differently on each — the desktop (178 cols) keeps the full bar while ShellFish (50 cols) drops to a session glyph plus any quota warning, with window names truncated to 7 characters instead of 14. No clock: the phone has one. That is 3 columns of chrome against the desktop's 45, leaving ~47 of 50 for tabs. The branch is `#{?#{e|<:#{client_width},80},narrow,wide}` — and the **`e|` matters**: a bare `#{<:...}` compares as *strings*, so `"178" < "80"` is true and every client renders narrow. Also note `display-message -c <tty>` targets a client while `-t` targets a pane; using `-t` to test this reports the same width for both.
  - **SSH windows name themselves.** The remote host used to sit in `status-left` next to the session name, where one pane's ssh session read as a property of the whole session. `tmarchy/lib/ssh-name.js` now renames the *window* to the host instead, and the tab keeps its remote glyph. Detection scans **every pane** via `list-panes -a`, not the window's active pane — `#{pane_current_command}` on a `list-windows` reports only the active one, so an ssh in a background pane of a split got neither the glyph nor the rename (a window with two ssh panes names itself after the active one). It only takes over a window tmux is still auto-naming (`#{automatic-rename}` = 1); a window you named — or any agent worktree window, since `new-window -n` turns auto-rename off — is never touched. **Opt in with `set -g @tmarchy-ssh-rename always`** to have it take over named windows too: it then records the old name in `@tmarchy-ssh-prev` and puts it back verbatim when the session ends, leaving `automatic-rename` off (re-enabling it would let tmux rename the window to the running command moments later and destroy the name it just restored). A name containing a tab is refused rather than taken over, since it could not survive the round trip through the tab-separated window query — a name that cannot be given back must not be taken. The name it set is remembered in `@tmarchy-ssh-name`, which is what lets it hand the name back when the session ends (rename first, *then* restore `automatic-rename`, since renaming turns it off again). An ssh whose host cannot be resolved is skipped rather than treated as "not ssh", so one failed `/proc` walk cannot hand a name back mid-session.
  - **Plan-quota warning** (`tmarchy/segments.d/quota.js` + `tmarchy/bin/tmarchy-usage`): shows how close the account is to its Claude limits, and only past a per-bucket threshold — **`five_hour` at 60%**, everything else at 80%. The five-hour window warns earlier because it is the one that interrupts work already in progress; the weekly window is a planning number, so it holds out longer. Below the threshold it renders nothing — below that it renders nothing, so the normal state is an invisible slot. Data is `GET /api/oauth/usage` (the endpoint `/usage` uses), authenticated with the OAuth token in `~/.claude/.credentials.json`; the token is passed as a header from Node, never in argv where `ps` could read it. The fetch is **never** done inside the tick — that would stall every redraw on a slow network — so the tick spawns the refresher *detached* when the cache is stale (10 min) and reads only `~/.local/state/tmarchy/claude-usage.json`. No cron or timer to install. The endpoint is undocumented and may vanish: every failure writes `ok: false` and renders nothing. **`tmarchy-usage --doctor`** reports last fetch, HTTP status and parsed buckets — below the threshold a healthy quota and a broken refresher look identical, so that is the only way to tell them apart. Quota is account-scoped, so unlike the per-window agent state this is one global value.
- **tmux-scout** (qeesung/tmux-scout): tracks Claude Code / Codex / Gemini / etc. sessions
  - `prefix + \``: open session picker; `prefix + ~`: jump to the next agent pane awaiting input (`bin/tmux-scout-next-wait`)
  - `tmarchy/bin/tmarchy-tick` runs behind its rate guard, effectively once per `status-interval`, and sets `@scout-state` per window so window-status-format tints the whole tab text: **red=wait, orange=busy, teal=done**, dim/none=idle
  - **Wait detection** mirrors scout's own `needsAttention` (a permission/question prompt), NOT a `pendingToolUse`-age heuristic (that false-tinted any long-running tool). `needsAttention` only fires when the **`PermissionRequest` hook** is registered in `~/.claude/settings.json`; Claude Code binds hooks at session start, so sessions started before the hook won't fire it. A **pane-content fallback** in the tint scrapes each agent pane for Claude's live approval dialog (`❯ <n>.` selector + an "Esc to cancel"/"Tab to amend" footer) and tints wait regardless of hooks — dialog text merely quoted in scrollback is deliberately ignored. Same criteria in `tmux-scout-next-wait`.
- **Window sidebar** (`prefix + W`): per-window narrow left pane listing every window (index + name + scout-state color, active highlighted). `bin/tmux-window-sidebar` renders; `tmux-sidebar-{toggle,ensure,click,resize}` drive it. Follow hooks (`after-select-window`/`after-new-window`) add it to windows as you visit/create them; the `window-resized` hook re-pins width to `@sidebar-width` (24). Focus-safe (`split -d`), self-destructs if it becomes the last pane, and a row click switches windows (`MouseDown1Pane` over sidebar panes only).
- **Window tabs**: names truncated to 14 chars via `#{=/14/…:window_name}` in the theme so many long agent-worktree tabs stay readable before the bar scrolls.
- **`status-interval` = 5**: authoritatively set by `tmarchy/bar.conf`, which loads after tpm so it wins. `.tmux.conf` sets the same value once more, pre-tpm, purely as a fallback for a checkout that doesn't have tmarchy on disk yet — change both if it ever changes. (Historically tmux-powerline's `main.tmux` forced this back to its own default of 1 on every tpm load, which is what caused the 2026-08-21 fork storm; tmarchy doesn't load as a tpm plugin, so that reset can't happen.)
- **which-key menu** (`prefix + ?`): alexwforsythe/tmux-which-key — a labelled popup of every binding, drilling into submenus. The plugin's default trigger keys are both taken here: `prefix + Space` is `last-window`, and a root-table `C-Space` would swallow nvim-cmp's completion key inside every pane — hence `?`. The raw `list-keys -N` listing that key used to run is still in the menu under `+Keys`.
  - **Regrouped by verb, not by tmux noun** (2026-09-05): the old top-level menus (`+Windows`, `+Panes`, `+Sessions`, `+Tools`, …) sorted commands by which tmux object they touched, which meant "what I want to do" and "where it lives" were two different lookups. The ten top-level menus now are `+Go`, `+Open`, `+Move`, `+Set`, `+Copy`, `+New`, `+Ask`, `+Show`, `+Kill` and `+Agents` — nine verbs plus one deliberate exception. `+Agents` is a domain, not a tmux verb: the agent workflow (scout, the sidebar, worktree windows) is central enough to this config that grouping it by verb would have scattered it across `+Go`/`+Open`/`+Show` instead of leaving it as one place to look. A ten-key **favourites row** sits above the verbs for the commands used often enough to not want a submenu at all (see the `tmux-cmd` bullet below for how the palette dedupes its rows against the copy that lives inside a verb).
  - **Nothing was unbound.** Regrouping only changed which submenu advertises a command — every key that used to reach `+Windows > Last`, say, still runs the same binding; a demoted entry just stopped being *listed* under its old menu path. That is the whole reason the menu can be rolled back on its own: `git checkout <ref> -- .config/tmux/plugins/tmux-which-key/config.yaml && prefix + r` restores the old menu completely, and every direct key kept working the entire time it was gone, because the two were never coupled in the first place.
  - Config is **versioned at `.config/tmux/plugins/tmux-which-key/config.yaml`** (XDG mode via `@tmux-which-key-xdg-enable 1`), not in the gitignored `.tmux/plugins/` tree. The plugin regenerates `~/.local/share/tmux/plugins/tmux-which-key/init.tmux` from it on every load, so `prefix + r` picks up edits.
  - Two YAML traps when editing it: an unquoted scalar makes ` #{...}` a **comment** (silently truncating the command), and generated menu strings are single-quoted, so a `'%1'` inside a command **closes the string** — use `{ }` command blocks or double quotes instead. Both bit the first draft; the fixes are commented in place.
  - **`prefix + m` opens the same menu** (it replaced a hand-rolled `display-menu`), so the ShellFish snippet that sends `^A m` still works; the menu is centred (`position: C/C`) for thumb-tapping. That bind lives **after** the tpm line — `show-wk-menu-root` is a command-alias the plugin defines as it loads — and behind an `if-shell` file test, since an unguarded `bind m show-wk-menu-root` fails config parsing with `unknown command` on a host that hasn't run `prefix + I` yet.
- **`mode-keys` is set explicitly** (`setw -g mode-keys vi`), not inferred. tmux guesses it by looking for `vi` in `$EDITOR`/`$VISUAL` **in the server's environment at server start** — and that environment is frozen at startup, before `.zshrc` sets either. So despite `EDITOR=nvim` the server saw neither and defaulted to **emacs**, which silently left every `copy-mode-vi` binding unreachable: `V` (select-line), `v` (rectangle-toggle) and `y` (yank) did nothing, because tmux was consulting the `copy-mode` table instead. Same family as the stale-PATH bug — anything tmux reads from its own environment reflects server start, not your shell.
- **OSC 52 copy**: `@override_copy_command 'tmux load-buffer -w -'` routes every yank through tmux's buffer + OSC 52 to the host terminal clipboard (Tabby, ShellFish)
- **Keybindings**:
  - `prefix + r`: reload `.tmux.conf`
  - `prefix + |` / `prefix + -`: vertical / horizontal split
  - `prefix + ?` (or `prefix + m`): which-key menu (every binding, labelled) · `prefix + /`: describe a single key
  - **`prefix + Escape` dismisses an overlay** — and reaches exactly one of the two kinds, which is a property of tmux rather than a gap. A **dropdown** popup runs `tmux attach-session`, so it contains a second *client* that handles the prefix; this detaches it, closing the popup while the process keeps running. A **one-shot** popup runs the program directly and tmux has no `popup` key table, so the keystroke never reaches tmux at all — measured on a scratch server with a control (binding fires with no popup open, does not fire with one open). lazygit and yazi are dismissed with `q`. From an ordinary pane the key runs `display-popup -C`, which closes an orphaned popup and is a verified no-op otherwise, so it is always safe to press.
  - `prefix + ?` → `+Overlays` (top-level key `o`) collects all four overlays, so they are discoverable and reachable from the `prefix + p` palette too. The menu entries **open** rather than toggle — a toggle's job is closing an overlay you are already inside, and the menu cannot be opened from in there.
  - `prefix + B` / `prefix + D`: drop-down btop / lazydocker overlays (toggle — any dropdown key closes whichever is open). `D` takes over tmux's default `choose-client`
  - `prefix + G` / `prefix + e`: lazygit / yazi popups, opened in the **calling pane's directory**. One-shot, not dropdowns — see `tmux-popup` below
  - `prefix + p`: command palette (cmd-P style) — every menu command in one fuzzy list. Takes over tmux's default `previous-window`, which `C-p` still does
  - `prefix + S`: fuzzy-pick a host and ssh to it (Enter = new window named for the host, Ctrl-V = split)
  - `prefix + W`: toggle window sidebar · `prefix + ~`: next agent pane awaiting input · `prefix + b`: break pane to its own window
  - `prefix + g`: ask Claude for a shell command, inserted at the prompt without running it
  - `prefix + u`: fzf picker over sessions, windows and panes together, navigation only
  - `<C-h/j/k/l>`: pane nav (with vim-tmux-navigator)
- **Dark theme**: all `*-style` options explicitly set to `bg=colour235` so activity/bell flags don't flip to white
- `renumber-windows on`, `detach-on-destroy off`

## Scripts in `bin/`

Utility scripts on `$PATH` (via `.zsh/rc/exports`). Notable ones:

- **`gitfix`**: re-runnable symlink installer. Walks `.homedir/`, `.homedir/.ssh/`, `.homedir/.config/` and links matching entries into `~/`, `~/.ssh/`, `~/.config/`. Uses `dircombine` (Joey Hess, perl) which maintains a `known` file per source dir to clean up stale links on re-run. Skips `.git`, `.gitignore`, `.gitmodules`, `.svn`, `_darcs`.
- **`install-neovim`**: downloads latest Neovim release into `~/bin/nvim` (Linux x86_64/arm64 tarballs, macOS x86_64/arm64).
- **`.claude/themes/tokyo-night.json`**: a custom Claude Code theme, so the CLI matches the bar, nvim, fzf and the prompt. Claude Code reads local themes from `~/.claude/themes/*.json` (which is this directory — `~/.claude` is a gitfix symlink into the repo), schema `{name, base: "dark"|"light", overrides: {token: "#hex"}}`, and they appear in `/theme` alongside the presets. This is the right answer instead of `dark-ansi`: that theme uses the **terminal's** 16 ANSI colours, so it looks correct only if the terminal's own palette is Tokyo Night — true for Rio now, but ShellFish carries its own and ignores an OSC 4 repaint (tested). A custom theme carries its colours itself and so works on every client. The visible effect is small and that is inherent: `base: "dark"` supplies everything that fills the screen, and the tokens a theme can override are narrow accents (errors, permission prompts, plan mode, diff backgrounds). Only tokens confirmed to exist in the binary are set — a batch of plausible generic names (`text`, `accent`, `muted`, `link`, `selection`) changed nothing when tried, so they are not real tokens and were removed rather than left in as noise. `.gitignore` needs the `!.claude/themes/` exception, since `.claude/*` is ignored by default — with a second, narrower rule re-ignoring `tmarchy.json`, which `tmarchy-theme sync` generates. `settings.json` now names `custom:tmarchy`, so this file is the static fallback rather than the active theme; an absent or unknown theme name is **ignored silently**, which is why `homedir-doctor` checks that the generated one exists and is not stale.
- **`claude-restore-plugins`**: reinstall Claude Code plugins on a new machine. Only `.claude/settings.json` (enabledPlugins + marketplaces), `.claude/skills/`, and the `settings.json` hook scripts (`.claude/hooks/deletion-circuit-breaker.sh`, `.claude/shellfish-notify.sh`) are versioned; the marketplace plugin files under `.claude/plugins/` aren't, so this re-adds the custom marketplaces and `claude plugin install`s each one. Run after `gitfix` on a fresh checkout. ("restore my plugins" → run this.)
- **`homedir-doctor`**: report what is wrong with this host's checkout — **report only**, it never installs, links or edits. That separation is the point: a doctor that mutates is one you hesitate to run, and hesitating is how a host stays broken. Every FAIL names the command that fixes it (`gitfix`, `submodule update`, `prefix + I`, `homedir-install`, `bat cache --build`). `--quiet` prints problems only; exit 1 if anything FAILED, warnings alone are exit 0. The checks are the incidents this file already documents, turned executable: uninitialised submodules, **`~/bin/lib/` unreachable** (the one that leaves `prefix + p` empty while every other check passes), missing gitfix links, network mounts on `$PATH`, `mode-keys` guessed as emacs, the tmux server PATH missing `~/.local/bin` (the stale-`claude` bug), tpm plugins not installed, tmarchy not loaded, a slow `tmarchy-tick`, lazydocker < 0.25, an unbuilt bat cache, `/tmp` bloat, and disk pressure.
- **`homedir-install`**: fetch the CLI tools this repo's config depends on, built for **this** platform, into `~/.local/bin`. `--list` shows installed vs available; bare invocation installs only what is missing; `--all` updates everything. Platform is normalised on two axes because upstreams disagree on all of them — the same CPU is `x86_64` on Linux and `arm64` on macOS, and the archives spell it `Linux` (lazydocker) or `linux` (lazygit), gnu or musl, `.tar.gz` or `.zip` — so each tool's asset pattern is spelled out rather than templated. Binaries are located by **searching the extracted tree by name**, since some ship at the root and some inside a versioned directory. Checksums are verified **where upstream publishes a flat `checksums.txt`** (lazygit and lazydocker do; zoxide and yazi do not) and the result is printed per tool as `verified`/`unverified` rather than implying a check that did not happen; a mismatch refuses to install. Scope deliberately excludes fzf, ripgrep, btop and git (every package manager has them) and neovim (`install-neovim` owns that). **eza publishes no macOS binary** — it says so and points at Homebrew.
- **`setup_osx`**: macOS `defaults write` bootstrap (Sonoma/Sequoia idioms; sections for UI, keyboard, trackpad, Dock, Finder, etc.)
- **`tmarchy/bin/tmarchy-tick`** (renamed from `bin/tmux-scout-window-tint`, now lives under `tmarchy/` with the rest of the bar): the ticker behind `tmarchy/bar.conf`'s guarded `#()`. Reads `~/.tmux-scout/status.json` via scout's own sync/render libs and now writes both `@scout-state` per window (wait = scout `needsAttention` or a live approval dialog scraped from the pane) and the `@bar-*` globals (load, agents, branch, remote, battery) that `bar.conf` renders. **`tmux-scout-next-wait`** (`prefix + ~`, still in `bin/`): jump to the next agent pane awaiting input.
- **`tmux-window-sidebar`** + **`tmux-sidebar-{toggle,ensure,click,resize}`**: the `prefix + W` window sidebar — render loop, per-window spawn/teardown, click-to-switch, and resize re-pin.
- **`tmux-gen`**: `prefix + g` popup that asks Claude for a shell command and **inserts it at the prompt without running it**. Toolless by construction (`--disallowed-tools Read Bash Glob …`), so the query has no filesystem access; context is just the pane's cwd and branch. The system prompt is load-bearing, not cosmetic — without it `claude -p` takes 20–41s and answers as an agent that cannot run things; with it, 5–6.5s and one clean line. `prefix + Enter` is reserved for the Otto-backed sibling, which is blocked on the [[Otto Ask API]] endpoint.
  The safety gate rejects any `[[:cntrl:]]` byte, not just newline: a newline-only guard was insufficient because CR submits a line exactly like Enter, and an ESC byte reaches readline's dispatcher — `ESC` then `C-e` is `shell-expand-line`, which performs command substitution with no keypress and leaves no visible trace; C-o executes, and C-u/BS silently discard the prefix the user just read, approving one command and running another. Insertion goes through `send-keys -l --`: without `-l` tmux reads tokens as key names, and without `--` a command starting with `-` parses as flags (`-R` was verified to silently reset the pane's terminal). `bin/tmux-gen-selftest` covers all of this against stub fixtures and never calls the real Claude — `CLAUDE_BIN` used to resolve at source time while the harness exported `TMUX_GEN_CLAUDE` later, so every run silently billed a real query; it's resolved at call time now. The canary test is the point: it stubs the model into replying `rm -rf <file>`, drives the real flow, presses Enter, and asserts the file survives, with a barrier command proving the target shell does execute submitted lines — an earlier version of that harness passed against a sabotaged tool because the target pane had no shell reading input.
- **`tmux-goto`**: `prefix + u` popup listing sessions, windows and panes in one fzf picker — no category to choose first. Rows carry a Nerd Font glyph plus a `[sess]`/`[win]`/`[pane]` tag — the glyph to scan by, the tag because a glyph cannot be typed, so a query can still be narrowed by typing `win`; pane rows show the running command (with worktree-named windows that is the recognisable part) and window rows carry tmarchy's `@scout-state` only when it is worth reacting to — `wait`/`busy`/`done` each get a glyph, the word, and the whole row tinted in that theme's `@theme-wait`/`busy`/`done` (read live, so switching theme switches the picker); unset and `idle` render nothing, so the marked rows stand out. Pane rows inherit their window's state, since scout marks the window but the agent is a pane. Colours are emitted as ANSI (fzf runs `--ansi`) and handle both the `#rrggbb` themes and jewel's `colourNNN`, degrading to no colour rather than a broken escape. The target id is field 1 and hidden from display via fzf's `--with-nth=2..`, so a window name containing spaces cannot break the action, and `act_on` dispatches on a hidden kind field (field 2, also hidden by `--with-nth=3..`) rather than the target's first character or any display text — a session may legally be named `@release`, and the display now leads with a glyph. The previously-active window is pinned to the top and the places you already are (current window, its pane, current session) are omitted, so `prefix + u` then Enter is a toggle back to where you just were — alt-tab, essentially. Navigation only by design: `prefix + F` keeps tmux-fzf's nine modes for commands, keybindings and processes.
- **`bin/lib/tmux-theme.sh`**: shared access to the live theme, sourced by `tmux-goto`, `tmux-ssh`, `tmux-cmd` and `tmux-keys` (which each carried their own copy of `ansi_for` before). Two jobs: `ansi_for` turns a `@theme-*` value into an SGR escape for row text, and **`fzf_theme_opts` builds fzf's `--color` from the same values** — before this, the pickers coloured their own rows but fzf's chrome (prompt, pointer, selected-row highlight, border) stayed at its defaults, so any of the nine themes sat under a green-and-white picker. Note `fzf_colour` is separate from `ansi_for`: fzf takes `#rrggbb` or a bare 0-255 number and does **not** understand tmux's `colour214` spelling, and one unparseable value makes fzf reject the *entire* `--color` argument rather than just that key — which would silently strip every colour on the jewel theme. Read at call time, so a theme switch applies on the next popup with nothing to reload.
- **`bin/lib/tmux-frecency.sh`**: shared "most used first" ranking, sourced by `tmux-goto`, `tmux-ssh` and `tmux-cmd`. Each records what you pick in `~/.local/state/tmarchy/<tool>-frecency` (`key<TAB>count<TAB>last-used`) and sorts rows by count × a weight that decays with age (100/60/30/10/3 by hour/day/week/month/older). The steep curve is deliberate: a flatter one let fifty uses from two months ago outrank three today. Two non-obvious parts — with an *empty* query fzf does no scoring at all and shows input order, so sorting the input **is** the ranking when the popup opens; and every caller passes **`--tiebreak=index`** because fzf's default of `length` would otherwise rank equal-scoring matches by row width and silently undo the sort. Keys must be stable across restarts, so `tmux-goto` keys on `win:<session>:<name>` rather than the ephemeral `@2`. Entries unused for 90 days are pruned on write, and `frecency_path` resolves `TMUX_FRECENCY_DIR` at **call** time — capturing it at source time is what once pointed `tmux-gen`'s tests at the real billed `claude`.
- **`tmux-dropdown`**: `tmux-dropdown <_session> <command…>` — the mechanism behind `prefix + B` (btop) and `prefix + D` (lazydocker). Not `b`; that is `break-pane`, and `D` displaces tmux's default `choose-client`. Each tool runs in its **own detached session** (`_btop`, `_docker`) rather than in the popup command, so the process survives between glances: a popup running the command directly would start a fresh one every toggle, losing whatever state it has built up — btop's history graphs, lazydocker's selected container — and paying startup each time. The popup only attaches a second client. The leading `_` is enforced by the script, not merely conventional: it is what both the toggle condition and the picker's filter key off, and a session named without it is hidden from neither. Two tmux quirks it works around: attaching from inside another client needs `TMUX=` cleared ("sessions should be nested with care"), and this tmux accepts the `=name` exact-match target for `has-session` but **rejects it for `set-option`**. A session whose name starts with `_` is treated as infrastructure and hidden from `tmux-goto`'s picker — it is somewhere you summon, not somewhere you navigate to.

  **A popup client can wander, and that used to strand it.** A popup is an ordinary tmux client, so every prefix binding still works inside it — including the ones that change session. One stray key moves it off `_docker`, and because `detach-on-destroy off` is set globally, tmux keeps such a client alive by *switching* it to another session rather than detaching: the popup silently becomes a second view of `main`, rendering the whole session inside a 90%-size box. Worse, the toggle then could not close it, since `#{m:_*,#{session_name}}` was false. The fix is a registry: `tmux-dropdown` records its own tty in the global `@dropdown-clients` before attaching and removes it on `EXIT HUP INT TERM`, the toggle bindings detach on *session is a dropdown **or** client is a registered dropdown client*, and a `client-session-changed` hook detaches such a client the moment it lands somewhere that is not a `_` session, so the nested render never appears at all. Entries are stored space-**padded** because the bindings match with the pattern `* $tty *` — without the padding `/dev/pts/2` matches inside `/dev/pts/24` and the wrong client gets detached. Stale entries are pruned against `list-clients` on every registration, since a dropdown killed with `SIGKILL` skips the trap and pts numbers get reused.

  **lazydocker must be ≥ 0.25.** 0.24.1 built its Docker event-stream client without `client.FromEnv`, so it fell back to API 1.25 and every open drew an error modal: `client version 1.25 is too old. Minimum supported API version is 1.44`. `DOCKER_API_VERSION` does **not** fix it — the variable reaches the process (verified in `/proc/<pid>/environ`) but never that client, which setting `1.30` and watching the error still name `1.25` proves. Upgrading to 0.25.2 was the fix; the old binary is kept at `~/.local/bin/lazydocker.0.24.1.bak`. Note the binary *does* contain the string `DOCKER_API_VERSION`, so grepping it is not evidence the variable is honoured.
- **`tmux-popup`**: `tmux-popup <command…>` — the sibling of `tmux-dropdown`, behind `prefix + G` (lazygit) and `prefix + e` (yazi). The difference is process lifetime, and it is the whole reason there are two scripts. `tmux-dropdown` keeps the process alive in its own `_` session because btop's history graphs and lazydocker's selected container **accumulate**, and both are global, so one instance is the right number. lazygit and yazi are scoped to a **directory**: a persistent `_lazygit` would pin itself to whichever repo it first opened in and show that one forever, and there is nothing to preserve anyway — a git status and a directory listing re-read from disk in milliseconds. So these are born and die with the overlay. All `tmux-popup` itself adds is the missing-binary message: without it a fresh checkout that lacks the tool flashes the popup open and shut with nothing to read, which looks like a broken keybinding rather than a missing package.

  **`-d '#{pane_current_path}'` is not optional.** A `display-popup` without it opens in `$HOME` no matter which pane you pressed the key in (verified) — for a per-repo tool that is wrong in the way that looks like it worked. Note `list-keys` renders the binding's `~` as `\~`; that is display escaping only, and the tilde does resolve (verified by running the binding's exact quoting and checking the popup's cwd).

- **`tmux-cmd`**: `prefix + p` command palette. **`tmux-cmd --doctor`** reports each stage's row count when the palette comes up empty — the usual cause on a new host is `bin/lib/` not being linked yet (it is a recently added subdirectory, so `bin/gitfix` needs a re-run), which leaves `frecency_sort` undefined and yields zero rows while the config, python3 and yaml checks all still pass. Flattens the which-key `config.yaml` into one fuzzy list (**88** commands). So something four levels deep is one search away; each row shows its key so the keys get learned rather than replaced, and a glyph saying what the command *does* — cog for config, bin for a kill, plus for a new window, arrow for navigation, pencil for something that prompts first, clipboard, info, tool — comes from the row's **declared verb**, the first segment of its menu path (`Go`/`Open`/`Move`/`Set`/`Copy`/`New`/`Ask`/`Show`/`Kill`/`Agents`) rather than from guessing at the command text. That is a change in *how* the glyph is chosen, not in what it draws for existing rows: `resizep` and `swapp` drew the navigate glyph under the old text-matching heuristic and still draw it now, because they are declared under `Move`, which maps to the same navigate glyph — the same answer, arrived at because it was declared rather than because a text match happened to agree. `class_for`, the old classify-by-command-text heuristic, remains in the code as a defensive fallback for a favourites-row entry with no verb of its own — with the shipped config every one of the ten favourites dedupes against its twin inside a verb, so every row carries a declared verb and `class_for` never actually runs; it stays in place for the day a new favourite is added without a matching verb entry. Sourcing the *menu config* rather than `list-keys` is deliberate — the config is already curated and labelled, and both read the same file so the palette cannot drift from the menu. Two traps it handles: commands run by writing them to a file `tmux source-file` reads (never `eval` — several contain `\;` separators and `%%` placeholders a shell would mangle), and a bare `#{...}` in that file would be a **comment**, so bare formats are quoted at flatten time. It runs via `run-shell -b` so the popup has closed before a command that opens its own popup fires.

  The command count moved from 97 to 88, for two independent reasons. The nine per-theme `+Theme` entries collapsed into one `Theme…` row that opens `tmux-theme-pick`, and `flatten_menu` now dedupes rows by command string, which folds the ten-row favourites strip against its twin inside a verb — a dedupe that also caught something the old count had been hiding: `last-window` already appeared twice in the pre-verb config too, once top-level and once under `+Windows > Last`, so 97 had only ever been 96 *distinct* commands.
- **`tmux-theme-pick`**: the fifth fzf picker (alongside `tmux-goto`, `tmux-ssh`, `tmux-cmd`, `tmux-gen`), reachable at `prefix + ? → +Set → Theme…`. It is the only one of the five with a **preview pane** — a list of nine theme names says nothing about what you'd be choosing, so the preview renders a swatch of each theme's `bg`/`fg`/`accent`/`wait`/`busy`/`done`. The swatch is read straight from `tmarchy/themes/<name>.conf`, not from live tmux options, for the same reason `tmarchy-theme sync` parses the file instead of querying tmux: it has to work with no server running. It applies **on Enter only** — wiring the preview to apply on cursor-move as well would repaint the whole bar once per row while just browsing.
- **`tmux-ssh`**: `prefix + S` popup that fuzzy-finds a host and opens an SSH session — Enter in a new window named for the host, Ctrl-V in a split. Hosts are merged from three sources, in precedence order: `~/.ssh/config` (following its `Include` — one level, with globs and `~` expanded, since ssh accepts both and a `conf.d/*.conf` layout would otherwise contribute nothing silently; the real entries here live in the out-of-repo `config.local`), `tailscale status`, and `~/.ssh/known_hosts`. Precedence matters — a config entry may carry a user, port or `ProxyJump`, and a tailscale node knows its OS and online state, both of which a bare known_hosts name loses. **`known_hosts` is per-host**: Debian/Ubuntu set `HashKnownHosts yes` in `/etc/ssh/ssh_config`, which turns every name into `|1|…` and makes the file useless (42 of 43 entries here), but macOS leaves it off, so on those machines it is a real source and sometimes the only one. It handles comma-separated aliases, `[host]:port`, and `@cert-authority`/`@revoked` markers. **`tmux-ssh --doctor`** reports each source's count when the list comes up empty. A config entry wins over the same tailscale name, since it may carry a user, port or `ProxyJump`. Offline tailscale nodes are listed but dimmed. The host is validated against `[A-Za-z0-9._@-]` before it reaches a command line — it is pasted into `ssh <host>`, so a crafted config or node name must not be able to append a second command.
- **`tmux-keys`**: lists only the bindings this config adds, by diffing the live server against a throwaway stock one (`-L` + `-f /dev/null`) rather than hardcoding a baseline, so it survives tmux upgrades. `list-keys` shows ~314 bindings of which ~262 are tmux's own. Grouped by whether `.tmux.conf` binds the key rather than by whether the command mentions a plugin path — tmux-pain-control's `resize-pane -L 5` and tmux-sensible's second reload key are indistinguishable from config bindings by their text. Reachable at `prefix + ?` → `+Keys` → `Custom bindings only`.
- **`tmux-askpass`**: `SUDO_ASKPASS` helper — asks for the sudo password in a tmux popup. Exported from `.zsh/rc/exports`, and sudo consults it **automatically whenever there is no terminal to prompt on**: a `! sudo …` from Claude Code, a keybinding, any non-interactive context (`-A` forces it even when a terminal exists). Three things it gets right, each of which was wrong before and would have bitten the first time it ran: the shebang is at byte 0 (a leading tab meant `sudo -A`, which execs the helper directly, could not run it); the FIFO carrying the password lives in a `0700` dir **and** is created under `umask 077`, because `mkfifo` honours umask and the umask here is `002` — a bare `mkfifo` made it `0664`, world-readable, for a sudo password; and the read is wrapped in `timeout` (`ASKPASS_TIMEOUT`, default 120s), because if the popup never launches nothing opens the write end and a bare `cat` wedges sudo forever with no prompt on screen. The prompt runs from a generated script file rather than an inline tmux string — a popup command is a shell string inside a tmux string inside the helper.
- **`ha`, `ha-service`**: Home Assistant CLI wrappers (use env vars from `~/.zshrc.local`)
- **`pushover`**: simple notification wrapper (used by `rsnapshot-wrapper.sh`)
- **`update-keys`**: pull authorized_keys from GitHub
- **`merge-tmux`**: combine all tmux sessions into "main"
- **`pi-system-status`**, **`ping-monitor*`**, **`sshscan`**, **`set-time-from-nmea-ip`**: misc system tools

Submodules under `bin/` (named `*.git/`): `ansiweather.git`, `isomorphic-copy.git`, `recordstream.git`. The top-level symlink `ansiweather` invokes the binary inside.

`multi-git-status.git` and its `mgitstatus` symlink were **dropped 2026-09-05**: upstream `fboender/multi-git-status` is gone from GitHub (404 anonymously, which git surfaces as the misleading `could not read Username for 'https://github.com'` rather than a not-found error). No local objects survived under `.git/modules/`, so the submodule could not be initialised on any fresh checkout — don't re-add it without a working fork URL.

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

## Claude Code permission rules: `//` is the absolute one

`~/.claude/settings.json` is **user** settings, and there a `/path` pattern
anchors at `~/.claude/`, not the filesystem root — so `Read(/opt/otto/.env)`
resolved to `~/.claude/opt/otto/.env`, a path that does not exist, and matched
nothing. Ten rules were inert this way, including `Edit(/opt/otto/scripts/**)`,
which had been treated as the reason Otto's scripts were off limits. Verified by
reading the very file `Read(/home/krezel/.claude/settings.json)` claimed to deny.

The four shapes ([docs](https://code.claude.com/docs/en/permissions)):

| Pattern | Anchored at |
| --- | --- |
| `//path` | filesystem root — the only true absolute |
| `~/path` | home directory |
| `/path` | the **settings source** (`~/.claude/` for user settings) |
| `path`, `./path` | current directory |

Bare filenames follow gitignore semantics, so `Read(.env)` and `Read(**/.env)`
are equivalent — and both stop at the current directory. Neither would cover
`/opt/otto/.env` from a session started elsewhere. `Read(//**/.env)` is the
blanket rule, and it is what this repo now uses.

Bash rules are unaffected: `Bash(cat /opt/otto/.env:*)` is a command-prefix
pattern, not a path.

## Vendored skill dependencies

`.claude/skills/baoyu-*/scripts/` are third-party skills with their own
`package.json`. They are the repo's only dependency surface, and the only thing
Dependabot can flag.

`baoyu-url-to-markdown` pinned `defuddle` at `^0.17.0`, which a high-severity XSS
advisory covers (`<= 0.19.0`, fixed in 0.19.1). Bumped to `^0.19.1`. Note that a
caret on a `0.x` version means `>=0.19.1 <0.20.0`, so the old `^0.17.0` could
*never* have reached the fix on its own no matter how often it was reinstalled.

**`bun.lock` still pins 0.17.0 and was deliberately not hand-edited.** `bun` is
not installed on this host, and 0.19.1 moved its optional-dependency ranges
(`temml ^0.13.1` → `^0.13.3`, `mathml-to-latex ^1.5.0` → `^1.8.0`), so a correct
lock needs that subtree re-resolved rather than one line rewritten. The lock is a
cache, not an override: bun re-resolves when it conflicts with the manifest
range, which `^0.19.1` now does. Run `bun install` in that directory on a machine
that has bun to regenerate it.

**The exposure was theoretical, not live.** That skill's `node_modules` does not
exist — nothing was ever installed — and its `SKILL.md` resolves `${BUN}` at
runtime and suggests installing Bun when it is absent. So the vulnerable version
was a string in a manifest, never code on disk. Nothing to regenerate unless the
skill is actually used, at which point a fresh `bun install` resolves `^0.19.1`.

Being vendored, an upstream skill update may revert this.

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

On a big box, interactive lag is usually **process-spawn latency, not CPU** (`time tmarchy/bin/tmarchy-tick` taking noticeably long at ~0% CPU = blocked on I/O). Three usual causes, in order:

1. **`/tmp` bloat** — `ls -1 /tmp | wc -l`. Otto's **test suite** leaks them — not the relay, despite the names. `vitest` fixtures call `mkdtempSync(path.join(tmpdir(), '<prefix>-'))` at 346 sites across `/opt/otto/tests/*.mjs` and most never remove them, so every suite run leaves up to ~346 dirs behind. The prefixes are named after what each test exercises (`gov-` ← `relay-governor.test.mjs`, `creds-` ← `relay-credentials.test.mjs`), which is exactly what makes them look like relay runtime artifacts. Nine of them dominate: `sup- crl- creds- rrlock- rr- gov- cr- og- goal-`. 219k entries had accumulated by 2026-08-29 (40% of inodes); sweeping those older than two days removed 133k. Tens of thousands make every temp-file op O(n) slow. Sweep with an age filter so anything still in use is left alone:
   `for p in sup crl creds rrlock rr gov cr og goal; do find /tmp -maxdepth 1 -user "$USER" -mmin +2880 -name "$p-*" -exec rm -rf {} +; done`
   Note `/tmp` is **tmpfs (RAM)**, so this is never the cause of a full *disk* — and rsnapshot already excludes these, with its `snapshot_root` on the NAS (`/mnt/vogsphere/…`), so they never reached a backup either. Sweeping is a symptom fix; the upstream one (an `after()` hook per fixture) is queued as the otto-build project **Test Suite Leaks tmp Fixture Directories**.
2. **NFS automount in `$PATH`** — `echo $PATH | tr : '\n' | grep /mnt`. A slow/remounting NFS dir early in PATH stalls every command lookup (negative-lookup stats). Keep such dirs out of PATH (see Zsh Configuration); a running tmux server also needs `tmux set-environment -g PATH …`.
3. **A slow `tmarchy-tick`** — many transient `node` children under `tmux: server`, or the bar visibly stuttering. The tmux-powerline cause of this (its per-window `#()` callout resetting `status-interval` to 1 on every tpm load — 1,180 forks/sec at 73% idle CPU, the 2026-08-21 incident) is gone: tmarchy loads after tpm, not as a tpm plugin, so nothing resets its `status-interval 5`, and `tmarchy/bin/tmarchy-tick-guard` (bash builtins only, no `date`/`cat`/test binary) caps the ticker to one node spawn per interval *before* node ever starts — tmux still re-runs the guard's `#()` roughly once per interval per attached client (plus once per explicit `refresh-client -S`; pane output doesn't move this at all), but almost all of those calls now exit in the guard without ever touching node. So the check now is simply **whether the tick itself is slow**: `time tmarchy/bin/tmarchy-tick` (should be well under a second) and `pgrep -fc tmarchy-tick` (should be 0 or 1 concurrent, never a pile-up — `ps -eo comm,etimes | grep -c tmarchy-tick` doesn't work here, since `comm` for a `#!/usr/bin/env node` script reports as `node`, so that always reads 0 regardless of what's running). If it's genuinely slow, suspect a segment in `tmarchy/segments.d/` doing something expensive, not the guard.
