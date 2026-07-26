---
name: ios-clip
description: Copy text or a file's contents to the iOS/iPadOS clipboard when this session runs in a Secure ShellFish terminal. Use when the user says "copy this to my clipboard", "copy to clipboard", "pbcopy", "put this on my clipboard", "copy the script/file to my phone/iPad", or "send this to my clipboard". Works from inside Claude Code by writing an OSC 52 escape straight to the tmux client tty (or $SSH_TTY). NOT for saving into the vault (use clip), NOT for the macOS/laptop clipboard.
---

# iOS Clipboard (Secure ShellFish)

Copy arbitrary text or a file's contents to the **iOS/iPadOS clipboard** of the Secure ShellFish app the user is connected through. This only works when the current Claude Code session is running inside a **ShellFish** terminal — it writes the OSC 52 clipboard escape sequence directly to the terminal, bypassing Claude Code's stdout capture.

## When it works / when it doesn't
- ✅ Interactive session opened from Secure ShellFish on iPhone/iPad (the normal case for this box).
- ❌ The otto-vault relay / voice / queue bot, `cron`, or any headless run — there is no iOS clipboard. The script detects this and exits non-zero with a clear message; relay that to the user instead of pretending it copied.

## Instructions
1. Run the bundled script:
   - **A file's contents:** `bash ~/.claude/skills/ios-clip/scripts/ios-clip.sh "<path>"`
   - **Literal text:** `bash ~/.claude/skills/ios-clip/scripts/ios-clip.sh --text "the text"`
   - **Piped text:** `<some command> | bash ~/.claude/skills/ios-clip/scripts/ios-clip.sh`
2. The script picks the right terminal automatically: the **tmux client tty** (`tmux display-message -p '#{client_tty}'`) when inside tmux, otherwise a writable `$SSH_TTY`. It prints a one-line confirmation with the byte count and the tty it used.
3. **Confirm to the user what was copied** (per the always-confirm rule), e.g. "Copied the roster-refresh script to your iOS clipboard." The paste is invisible from the server side — if the user reports nothing pasted or truncated output, it's likely an OSC 52 size cap (the script warns above ~74 KB base64); fall back to printing the content in a code block or offering the file via the ShellFish file browser.

## How it works (for debugging)
- OSC 52 is the terminal "set clipboard" escape: `ESC ] 52 ; c ; <base64> BEL`.
- Inside tmux it must be wrapped in DCS passthrough (`ESC P tmux; …`) with the inner `ESC` doubled, and tmux needs `allow-passthrough on` (already set on this box).
- Writing to the tty (not stdout) is what lets it work from a captured Claude Code tool call. `LC_TERMINAL` is *not* propagated into tmux here, so Secure ShellFish's own `~/.shellfishrc` `pbcopy` function isn't defined in-session — this skill reimplements the same escape directly, which is why it works regardless.
