// Plan usage: the five-hour number, always, on a wide client.
//
// The sibling of quota.js, and deliberately a separate segment rather than a
// second mode of that one. quota.js is the WARNING: bar.conf paints @bar-quota
// with @theme-wait and an alert glyph without checking anything, because by
// construction nothing reaches that slot unless it wants attention. Folding an
// always-on number into the same option would break that guarantee -- the slot
// would sometimes mean "look at this" and sometimes mean "here is a number",
// and the colour could no longer be decided by the option alone.
//
// Two segments keep both promises: @bar-quota still only ever means attention,
// and @bar-usage is plain furniture that bar.conf renders dim, alongside load
// and battery.
//
// Width is bar.conf's decision, not this segment's. The option is always set;
// bar.conf shows it only on the wide branch (client_width >= 80) and only when
// @bar-quota is unset, so a warning is never doubled by the number it warns
// about. A segment cannot make that call itself -- tmux expands status formats
// per attached client, so the same tick feeds a 178-column desktop and a
// 50-column phone at once, and only the format string sees which is which.
//
// No refresh here. quota.js owns the fetch and runs on the same tick, so this
// reads the cache it maintains; spawning a second refresher would double the
// API traffic to no purpose.
'use strict'

const fs = require('node:fs')
const { fiveHour, readCache, enabled } = require('./quota')

module.exports = {
  name: 'usage',
  enabled,
  render: () => fiveHour(readCache()),
}
