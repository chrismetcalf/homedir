// Alerting on the events worth interrupting for -- today, an agent that needs
// an answer.
//
// TWO SURFACES, TWO DETECTORS, ONE CLASSIFIER. That split is forced rather than
// chosen: tmux stops expanding status formats entirely while a client is
// locked, so tmarchy-tick does not run during the screensaver (measured -- 4
// ticks in 4s unlocked, 0 in 5s locked). The one moment you are most likely to
// miss an agent is therefore the one moment the ticker cannot tell you about
// it. So the tick raises the toast while you are working, the screensaver
// watches for itself while it is up, and both ask the same sessionState() in
// lib/scout.js what "needs attention" means.
//
// The two behave differently ON PURPOSE:
//
//   - the toast is EDGE-triggered and transient. You are sitting there; a
//     status-line flash is enough, and repeating it every five seconds for an
//     agent you have already seen is how a notification becomes wallpaper.
//
//   - the banner is STICKY. You were not sitting there. An agent that asked at
//     02:14 and gave up at 02:20 still happened, and a banner that tracked live
//     state would have erased it before you got back. Entries are therefore
//     never removed while the saver runs -- they go dim when they resolve -- and
//     the whole list dies when you dismiss the saver, because dismissing it is
//     you acknowledging them.
'use strict'

// --- shared: what changed ---------------------------------------------------

// Ids waiting now that were not waiting last time.
function newlyWaiting(prev, next) {
  const seen = new Set(prev || [])
  return (next || []).filter((id) => !seen.has(id))
}

// The tick is a fresh process each interval, so "last time" has to live
// somewhere tmux can hold it. Space-separated window ids in a global option.
function encodeState(ids) { return (ids || []).join(' ') }
function decodeState(raw) { return (raw || '').trim().split(/\s+/).filter(Boolean) }

// --- the toast --------------------------------------------------------------

// Names the agents and says how to reach them. A notification that tells you
// something needs attention without telling you how to get there makes you go
// looking, which is the work it was supposed to save.
// TWO spaces after the warning sign, not one. tmux counts bare U+26A0 as a
// single column (measured: cursor_x=1; it is U+26A0+VS16 that takes two), so
// the box arithmetic is right either way -- but terminals draw the glyph wider
// than that cell, and with a single space the text sits on top of it. This is
// cosmetic and deliberate; it is not a stray space.
function formatToast(names) {
  const list = (names || []).filter(Boolean)
  if (!list.length) return null
  const head = list.length === 1 ? 'agent needs you' : `${list.length} agents need you`
  return `⚠  ${head}: ${list.join(', ')}  —  prefix + ~`
}

// The whole decision the ticker makes, as a pure function: what to remember,
// and what (if anything) to say. It lives here rather than in the tick so the
// one rule that matters can actually be tested -- `states === null` means scout
// was unreadable this interval, and the only correct response to learning
// nothing is to change nothing. Writing an empty set there would make the next
// successful tick re-announce every agent that had been waiting all along.
function announcePlan(states, previous, windowNames) {
  if (!states) return null
  const waiting = [...states.entries()].filter(([, st]) => st === 'wait').map(([id]) => id)
  const fresh = newlyWaiting(previous, waiting)
  const names = fresh.map((id) => (windowNames && windowNames.get(id)) || id)
  return { nextState: encodeState(waiting), text: fresh.length ? formatToast(names) : null }
}

// --- the sticky banner ------------------------------------------------------

// Fold the current waiters into the accumulated list. Entries are added once,
// keep their original timestamp, and are only ever marked inactive -- never
// dropped. `label` may change (a window gets renamed); the FIRST one is kept,
// since that is the name it had when it asked you.
function stickyUpdate(sticky, waiting, now = Date.now()) {
  const out = (sticky || []).map((e) => ({ ...e, active: false }))
  const byKey = new Map(out.map((e) => [e.key, e]))
  for (const w of waiting || []) {
    const found = byKey.get(w.key)
    if (found) { found.active = true; continue }
    const entry = { key: w.key, label: w.label, since: now, active: true }
    out.push(entry)
    byKey.set(w.key, entry)
  }
  return out
}

// Compact enough to sit on one line next to several others.
function ago(ms) {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return `${s}s`
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m`
  return `${Math.round(m / 60)}h`
}

// Header counts what HAS needed you, not what still does: after an agent gives
// up, "0 agents need you" over a list of two names would be a banner arguing
// with itself.
function bannerTitle(sticky) {
  const n = (sticky || []).length
  if (!n) return null
  return n === 1 ? '⚠  AN AGENT NEEDED YOU' : `⚠  ${n} AGENTS NEEDED YOU`
}

// Newest first: on a screen you glance at, the thing that just happened is the
// thing you are looking for.
function bannerEntries(sticky, now = Date.now()) {
  return [...(sticky || [])]
    .sort((a, b) => b.since - a.since)
    .map((e) => ({ text: `${e.label} ${ago(now - e.since)}`, active: e.active }))
}

// Fit as many entries as the width allows, OLDEST dropped first, and say how
// many went. A silently truncated list is worse than a short one: the count in
// the title would not match what you can see, and you would have no way to tell
// that the agent you were looking for was one of the ones cut off.
function bannerLine(entries, inner) {
  const list = entries || []
  const room = inner - 2

  const fit = (limit) => {
    let text = ''
    let shown = 0
    for (const e of list) {
      const next = shown === 0 ? e.text : `${text} \u00b7 ${e.text}`
      if (next.length > limit) break
      text = next
      shown++
    }
    return { text, shown }
  }

  const all = fit(room)
  if (all.shown === list.length) return all.text

  // The marker has to be BUDGETED for, not appended: adding " · +2" to a line
  // that already filled its width is what pushed the text through the right
  // edge of the box. Reserving room can itself drop another entry and change
  // the count, so this settles rather than assuming one pass is enough --
  // monotonic (a longer marker can only hide more), so it converges, and the
  // bound is belt and braces.
  let hidden = list.length - all.shown
  for (let guard = 0; guard <= list.length; guard++) {
    const marker = ` \u00b7 +${hidden}`
    const r = fit(room - marker.length)
    const next = list.length - r.shown
    if (!r.shown) return `+${list.length}`.slice(0, room)
    if (next === hidden) return r.text + marker
    hidden = next
  }
  return `+${list.length}`.slice(0, room)
}

module.exports = {
  newlyWaiting, encodeState, decodeState, formatToast, announcePlan,
  stickyUpdate, bannerTitle, bannerEntries, bannerLine, ago,
}
