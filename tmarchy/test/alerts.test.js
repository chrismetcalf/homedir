// Alerting: the toast the ticker raises while you are working, and the sticky
// banner the screensaver holds while you are not.
//
// Everything here is pure. The delivery (display-message to every attached
// client) is verified live against a scratch tmux server, not here -- what
// these assertions pin is the part that decides WHETHER to say anything and
// WHAT, which is where the behaviour actually lives.
//
// Every assertion is sabotage-proved in the comment above it.
'use strict'

const test = require('node:test')
const assert = require('node:assert')
const a = require('../lib/alerts')

const NOW = 1_800_000_000_000

// --- the toast --------------------------------------------------------------

// Edge-triggered: an agent already waiting last tick must not be announced
// again, or a five-second ticker turns one question into a toast every five
// seconds forever. Sabotage: in newlyWaiting replace the filter body with
// `true` -- this fails.
test('only agents that were not already waiting are announced', () => {
  assert.deepStrictEqual(a.newlyWaiting(['@1'], ['@1', '@2']), ['@2'])
  assert.deepStrictEqual(a.newlyWaiting(['@1', '@2'], ['@1', '@2']), [])
  assert.deepStrictEqual(a.newlyWaiting([], ['@1']), ['@1'])
  // One that STOPS waiting simply leaves; it must alert again if it returns.
  assert.deepStrictEqual(a.newlyWaiting(['@1'], []), [])
  assert.deepStrictEqual(a.newlyWaiting([], ['@1']), ['@1'])
})

// The ticker is a fresh process each interval, so "last time" round-trips
// through a tmux option. Sabotage: in decodeState drop the `.filter(Boolean)`
// -- an unset option decodes to [''] instead of [], every id then looks new on
// the first tick, and this fails.
test('the remembered set survives a round trip, and unset means empty', () => {
  assert.deepStrictEqual(a.decodeState(a.encodeState(['@1', '@2'])), ['@1', '@2'])
  assert.deepStrictEqual(a.decodeState(''), [])
  assert.deepStrictEqual(a.decodeState('   '), [])
  assert.deepStrictEqual(a.decodeState(undefined), [])
  assert.deepStrictEqual(a.decodeState(a.encodeState([])), [])
})

// A notification that says something needs you without saying how to reach it
// makes you go looking, which is the work it was meant to save. Sabotage: in
// formatToast drop the `  —  prefix + ~` suffix -- this fails.
test('the toast names the agents and says how to reach them', () => {
  const one = a.formatToast(['otto'])
  assert.ok(one.includes('otto'), 'should name the agent')
  assert.ok(one.includes('prefix + ~'), 'should say how to get there')
  assert.ok(!one.includes('1 agent'), `singular should not be counted: ${one}`)

  const two = a.formatToast(['otto', 'config'])
  assert.ok(two.includes('2 agents'), 'plural should be counted')
  assert.ok(two.includes('otto') && two.includes('config'), 'should name both')

  assert.strictEqual(a.formatToast([]), null, 'nothing to say is null, not an empty toast')
})

// --- what the ticker decides ------------------------------------------------

// THE rule: scout unreadable means we learned nothing, and the only correct
// response to learning nothing is to change nothing. Sabotage: in announcePlan
// replace `if (!states) return null` with `if (!states) states = new Map()` --
// the remembered set is wiped, so the next successful tick re-announces every
// agent that had been waiting all along, and this fails.
test('a tick that could not read scout changes nothing and says nothing', () => {
  assert.strictEqual(a.announcePlan(null, ['@1'], new Map()), null)
})

// Sabotage: in announcePlan replace `nextState: encodeState(waiting)` with
// `nextState: encodeState(fresh)` -- an agent that keeps waiting drops out of
// the remembered set and re-announces on the very next tick, and this fails.
test('the remembered set is everything waiting, not just what was new', () => {
  const states = new Map([['@1', 'wait'], ['@2', 'busy'], ['@3', 'wait']])
  const plan = a.announcePlan(states, ['@1'], new Map([['@3', 'otto']]))
  assert.strictEqual(plan.nextState, '@1 @3', 'both waiters should be remembered')
  assert.ok(plan.text.includes('otto'), 'only the new one is announced')
  assert.ok(!plan.text.includes('@1'), 'the one already known must not be re-announced')

  // Fed its own output, the same state says nothing at all.
  const again = a.announcePlan(states, a.decodeState(plan.nextState), new Map())
  assert.strictEqual(again.text, null, 'a steady state should be silent')
  assert.strictEqual(again.nextState, '@1 @3', 'but still remembered')
})

// Only `wait` is worth interrupting for. Sabotage: in announcePlan replace
// `st === 'wait'` with `st` -- a busy agent raises a toast and this fails.
test('busy and done agents do not raise a toast', () => {
  const states = new Map([['@1', 'busy'], ['@2', 'done'], ['@3', 'idle']])
  const plan = a.announcePlan(states, [], new Map())
  assert.strictEqual(plan.text, null)
  assert.strictEqual(plan.nextState, '')
})

// --- the sticky banner ------------------------------------------------------

// STICKY is the whole point: you were not there. An agent that asked at 02:14
// and gave up at 02:20 still happened, and a banner tracking live state would
// have erased it before you got back. Sabotage: in stickyUpdate return only the
// entries that are currently waiting -- this fails.
test('an agent that stops waiting stays in the banner, marked resolved', () => {
  let s = a.stickyUpdate([], [{ key: '%1', label: 'otto' }], NOW)
  assert.strictEqual(s.length, 1)
  assert.strictEqual(s[0].active, true)

  // otto resolves, config asks.
  s = a.stickyUpdate(s, [{ key: '%2', label: 'config' }], NOW + 60000)
  assert.strictEqual(s.length, 2, 'otto must not be dropped')
  const otto = s.find((e) => e.key === '%1')
  assert.strictEqual(otto.active, false, 'otto should be marked resolved')
  assert.strictEqual(otto.since, NOW, 'otto keeps the time it FIRST asked')
  assert.strictEqual(s.find((e) => e.key === '%2').active, true)
})

// The timestamp is when it first asked, not when it was last seen -- "otto 4m"
// has to mean "has been wanting you for four minutes". Sabotage: in
// stickyUpdate replace `found.active = true; continue` with
// `found.active = true; found.since = now; continue` -- this fails.
test('an agent that keeps waiting keeps its original timestamp', () => {
  let s = a.stickyUpdate([], [{ key: '%1', label: 'otto' }], NOW)
  for (let i = 1; i <= 5; i++) {
    s = a.stickyUpdate(s, [{ key: '%1', label: 'otto' }], NOW + i * 60000)
  }
  assert.strictEqual(s.length, 1, 'the same agent must not be added twice')
  assert.strictEqual(s[0].since, NOW, 'the clock runs from when it first asked')
})

// Keyed by pane, not by label: two worktrees of one repo share a basename, and
// merging them would report one agent where two had asked. Sabotage: in
// stickyUpdate key the Map on `e.label` instead of `e.key` -- this fails.
test('two agents in the same directory are two entries', () => {
  const s = a.stickyUpdate([], [
    { key: '%1', label: 'otto' },
    { key: '%2', label: 'otto' },
  ], NOW)
  assert.strictEqual(s.length, 2, 'same label, different panes, two entries')
})

// The header counts what HAS needed you. Sabotage: in bannerTitle count only
// `sticky.filter((e) => e.active)` -- after every agent gives up the banner
// reads "0 agents" over a list of two names, and this fails.
test('the title counts everything that has needed you, not just what still does', () => {
  const s = [{ key: '%1', label: 'otto', since: NOW, active: false },
    { key: '%2', label: 'config', since: NOW, active: false }]
  assert.ok(a.bannerTitle(s).includes('2'), 'both should still be counted')
  assert.ok(a.bannerTitle([s[0]]).includes('AN AGENT'), 'one reads as singular')
  assert.strictEqual(a.bannerTitle([]), null, 'no alerts means no banner')
})

// Newest first: on a screen you glance at, the thing that just happened is the
// thing you are looking for. Sabotage: in bannerEntries reverse the comparator
// to `a.since - b.since` -- this fails.
test('banner entries are newest first', () => {
  const s = [{ key: '%1', label: 'old', since: NOW, active: false },
    { key: '%2', label: 'new', since: NOW + 60000, active: true }]
  assert.deepStrictEqual(a.bannerEntries(s, NOW + 60000).map((e) => e.text),
    ['new 0s', 'old 1m'])
})

// A silently truncated list is worse than a short one: the title's count would
// not match what you can see, and the agent you were looking for might be one
// of the ones cut off. Sabotage: in bannerLine delete the `if (hidden > 0)`
// block -- the overflow is dropped with nothing to say so, and this fails.
test('a banner too narrow for every entry says how many it hid', () => {
  const entries = ['alpha 1m', 'bravo 2m', 'charlie 3m', 'delta 4m']
    .map((text) => ({ text, active: false }))
  const line = a.bannerLine(entries, 24)
  assert.ok(/\+\d/.test(line), `should say how many were hidden: ${line}`)
  // Wide enough for all of them: no marker at all.
  assert.ok(!/\+\d/.test(a.bannerLine(entries, 80)), 'nothing hidden, nothing said')
})

// The marker has to be BUDGETED for rather than appended -- the first version
// appended it and pushed the text straight through the right edge of the box,
// at exactly the widths where the list was almost fitting. Swept rather than
// spot-checked for that reason. Sabotage: in bannerLine return
// `all.text + ' · +' + (list.length - all.shown)` when something is hidden
// (the append-afterwards version) -- this fails at several widths.
test('the banner line never overflows its box, at any width', () => {
  const make = (n) => Array.from({ length: n }, (_, i) =>
    ({ text: `agent-${i} ${i}m`, active: false }))
  for (const count of [1, 2, 3, 4, 8, 12]) {
    for (let inner = 6; inner <= 80; inner++) {
      const line = a.bannerLine(make(count), inner)
      assert.ok(line.length <= inner - 2,
        `${count} entries at inner=${inner}: length ${line.length} > room ${inner - 2} (${line})`)
    }
  }
})

// Sabotage: in ago replace `if (s < 60) return` with `if (s < 0) return` --
// a fresh alert reads "0m" instead of "3s" and this fails.
test('elapsed time picks a unit that fits the column', () => {
  assert.strictEqual(a.ago(3000), '3s')
  assert.strictEqual(a.ago(90000), '2m')
  assert.strictEqual(a.ago(3 * 3600 * 1000), '3h')
  assert.strictEqual(a.ago(-5), '0s')
})
