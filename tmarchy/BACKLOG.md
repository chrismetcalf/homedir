# tmarchy backlog

Ideas not yet built. The original design doc's "Deferred" table
(`docs/superpowers/specs/2026-08-25-tmarchy-design.md`) holds the items that
were scoped out at the start — layout presets, agent-aware navigation, the
keybinding overhaul. This file is for what came up afterwards.

---

## Claude Code plan quota in the bar

Show how close the account is to its plan limit — the numbers `/usage` reports —
so "am I about to get cut off" is visible without leaving what you are doing.

**This is not the context window.** An earlier draft of this item aimed at
`context_window.used_percentage` from the statusLine payload, because that data
arrives for free. It answers a different question: how full *this session's*
context is, not how much of the *plan allowance* is left. The statusLine payload
has no quota field at all — no allowance, no reset time. Wanting the `/usage`
numbers means going to the same place `/usage` goes.

### Where the numbers come from

`GET /api/oauth/usage`, authenticated with the OAuth token Claude Code stores in
`~/.claude/.credentials.json` (mode 600, holds `accessToken` / `refreshToken`).
The response is bucketed:

```
five_hour              utilization, resets_at, remaining, remaining_percentage
seven_day              (same shape)
seven_day_opus         (same shape)
seven_day_sonnet       (same shape)
seven_day_oauth_apps
seven_day_overage_included
```

`five_hour` is the one that bites mid-session; `seven_day` is the one that ends a
week early. A single number should probably be whichever is further along, with
the other available on hover or in the picker.

### Constraints, in the order they will bite

**Never do network I/O inside the tick.** `tmarchy-tick` runs once per
`status-interval` and the bar renders from what it wrote. An HTTP call in that
path stalls every redraw when the network is slow — the same failure the battery
segment is already commented about avoiding with `execFileSync`. A separate
refresher (cron, systemd timer, or a detached spawn) must write a cache file, and
the segment must only ever read that file.

**Poll on the order of minutes, not seconds.** Quota moves slowly and this is
someone else's API. A five-second poll would be both abusive and pointless;
5–10 minutes is plenty, and the cache file's mtime is the staleness check.

**The endpoint is internal.** It is not in the public API docs — it was found by
strings-ing the CLI binary. It can change or vanish without notice, so a failed
or unparseable response must render nothing and leave the previous value alone,
exactly as the tick already treats a failed scout read. Never let it break the
bar.

**The token must not reach a command line.** `~/.claude/.credentials.json` is
mode 600 for a reason. Anything that puts the bearer token in argv exposes it to
every `ps` on the box; pass it through a header file or stdin. And it expires —
the refresher should treat a 401 as "no data this round" rather than trying to
implement the refresh flow itself, and let Claude Code refresh it in the normal
course of being used.

### Shape

- A refresher script writing `~/.local/state/tmarchy/claude-usage.json`.
- `tmarchy/segments.d/quota.js` reading that file, honouring its mtime, following
  the segment contract (`name` / `enabled()` / `render(ctx)`).
- A `@bar-quota` global rendered by `bar.conf`, tinted through `@theme-busy` and
  `@theme-wait` past thresholds, the way `@scout-state` already colours tabs.

### Open question

Whether this belongs in the bar at all, or in a notification. Quota is not
something you act on continuously — it matters at two moments: when it is nearly
gone, and when it resets. A permanent number may be noise where a warning past
80% would not be.
