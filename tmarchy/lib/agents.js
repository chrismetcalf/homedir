// External agent providers -- how something that is NOT a tmux pane gets onto
// tmarchy's agent surfaces.
//
// scout answers "what agents are running in this tmux server", which is the
// right question for anything with a pane and useless for anything without
// one: a containerised relay, a queue runner, a daemon on another host. Rather
// than teach tmarchy about each of those, it reads a drop directory:
//
//   ~/.local/state/tmarchy/agents.d/<producer>.json
//
//   { "generatedAt": 1789400000000, "ttlMs": 30000,
//     "agents": [ { "key": "goal:hf-manpack", "label": "hf-manpack",
//                   "state": "wait", "subagents": 0, "pane": null,
//                   "agentType": "claude" } ] }
//
// Whoever owns the agents owns the producer. tmarchy never learns their names.
//
// Four rules make this safe to point at code this repo does not control:
//
//   1. THE TTL IS MANDATORY. A file with no fresh `generatedAt` is ignored,
//      not trusted. A producer that dies must decay to nothing on its own,
//      because tmarchy has no way to check whether it is still alive -- and a
//      phantom agent is not a cosmetic bug: it pins the screensaver's breath,
//      raises an alert banner, and reports work that is not happening. This
//      repo has already paid for the other choice; scout's activeSubagents
//      never clears, and 19 of 20 records claiming to be running were on
//      sessions that had ended (see subagentCount).
//
//   2. JSON, NEVER CODE. tmarchy's own extension points are JS modules
//      (segments.d), and this deliberately is not: a JS drop-in gives anything
//      that can write the directory a foothold inside the frame loop, where
//      the worst a malformed JSON file can do is render a wrong row. It also
//      lets a producer be bash, python, or a cron job in another repo.
//
//   3. THE FILENAME IS THE IDENTITY. `producer` comes from the file's stem,
//      never from a field inside it, and every key is prefixed with it. A file
//      therefore cannot claim to be another producer, and a provider key can
//      never collide with a tmux pane id -- which matters because the key IS
//      what the screensaver's click handler resolves.
//
//   4. NOTHING FROM A PROVIDER REACHES A COMMAND LINE UNVALIDATED. `pane` is
//      the only field that does, and it must look exactly like a tmux pane id.
//      There is deliberately no field for "a command to run to reach me": that
//      would reintroduce rule 2 through the side door.
'use strict'

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const DIR = path.join('.local', 'state', 'tmarchy', 'agents.d')

// The four states every tmarchy surface already understands. A provider
// supplies its own -- it does not go through sessionState(), which reads
// scout's record shape -- so this list is the contract, not an implementation
// detail of scout.
const STATES = new Set(['wait', 'busy', 'done', 'idle'])

// A producer may pick its own freshness, within a ceiling. The ceiling is what
// stops `ttlMs: 999999999` from being a way to opt out of rule 1.
const MAX_TTL_MS = 10 * 60 * 1000
// ...and this is the other half of the same hole: a `generatedAt` far in the
// future never expires. Allow a little clock skew, reject the rest.
const FUTURE_SKEW_MS = 60 * 1000

const MAX_FILES = 16               // a bounded directory read on a 2s tick
const MAX_RECORDS = 64             // per file
const LABEL_MAX = 48

const PRODUCER_RE = /^[a-z0-9][a-z0-9_-]{0,23}$/
const KEY_RE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$/
const TYPE_RE = /^[A-Za-z0-9_-]{1,24}$/
// A tmux pane id and nothing else. This value is passed to `tmux -t`.
const PANE_RE = /^%\d+$/

// An icon is SINGLE-COLUMN or it is refused. The saver draws into a fixed
// character grid, so a double-width glyph -- CJK, and most emoji -- overflows
// every row it lands on and shoves the panel sideways. That is the same
// failure the rain renderer hit with full-width katakana, and it reads as a
// layout bug rather than a width bug, which is why it is worth being strict
// about here rather than at the point of drawing.
//
// Allowlisted rather than blocklisted: the set of wide characters is a moving
// target that grows with every Unicode release, while the set of things worth
// putting in a 1-column slot does not. ASCII, arrows, maths operators,
// geometric shapes, and the two Private Use Areas where Nerd Font lives --
// which is where every glyph this repo already uses sits.
const ICON_RANGES = [
  [0x21, 0x7e],                      // printable ASCII, space excluded
  [0x2190, 0x21ff], [0x2200, 0x22ff], // arrows, maths
  [0x25a0, 0x25fc], [0x25ff, 0x25ff], // geometric shapes; 25FD/25FE are wide
  [0xe000, 0xf8ff],                  // BMP private use
  [0xf0000, 0xffffd],                // plane 15 private use (Nerd Font MDI)
]

// Icons BY AGENT TYPE, for agents that do not name their own. scout records
// carry an agentType too, so this reaches tmux panes as well as providers --
// a Codex pane and a Claude pane stop looking identical.
//
// `claude` is deliberately ABSENT. It is very nearly every row on this host,
// and an icon that appears on every row distinguishes nothing; falling through
// to the state glyph keeps that slot carrying information. The glyphs below
// are chosen for being distinct and for being already proven to render in this
// repo's terminals, not for iconography -- swap them freely.
const TYPE_ICONS = {
  codex: '\u{f0633}',    // command
  gemini: '\u{f018d}',   // console
}

function normaliseIcon(raw) {
  if (typeof raw !== 'string') return null
  const cps = [...raw]
  if (cps.length !== 1) return null
  const cp = cps[0].codePointAt(0)
  return ICON_RANGES.some(([lo, hi]) => cp >= lo && cp <= hi) ? raw : null
}

// What to draw for one agent: its own icon, else one for its kind, else
// whatever the caller was going to draw anyway (the state glyph). An agent
// that names an unusable icon falls back rather than being dropped -- an icon
// is cosmetic, exactly like a label.
function iconFor(agent, fallback) {
  if (!agent) return fallback
  return normaliseIcon(agent.icon) || TYPE_ICONS[agent.agentType] || fallback
}

function providerDir(home) {
  return path.join(home || os.homedir(), DIR)
}

// Labels are drawn into a character grid AND passed to `tmux display-message`
// for the toast, so a control byte here is the same class of problem tmux-gen
// guards against at the prompt. Strip rather than reject: a label is cosmetic,
// and dropping an otherwise-good record over one stray byte loses information
// the operator actually wanted.
function sanitiseLabel(raw) {
  if (typeof raw !== 'string') return ''
  return raw
    .replace(/[\x00-\x1f\x7f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, LABEL_MAX)
}

// One record -> a normalised agent, or null if it cannot be trusted. Unlike a
// label, these fields are structural: a bad state or a missing key would
// render as something false, so such a record is dropped.
function normaliseAgent(raw, producer) {
  if (!raw || typeof raw !== 'object') return null
  if (typeof raw.key !== 'string' || !KEY_RE.test(raw.key)) return null
  if (!STATES.has(raw.state)) return null
  const label = sanitiseLabel(raw.label)
  if (!label) return null

  const subagents = Number.isInteger(raw.subagents) && raw.subagents >= 0
    ? Math.min(raw.subagents, 99) : 0
  const pane = typeof raw.pane === 'string' && PANE_RE.test(raw.pane) ? raw.pane : null
  const agentType = typeof raw.agentType === 'string' && TYPE_RE.test(raw.agentType)
    ? raw.agentType : null

  return {
    // Prefixed here rather than trusted from the file -- see rule 3.
    key: `${producer}:${raw.key}`,
    label, state: raw.state, subagents, pane, agentType, producer,
    icon: normaliseIcon(raw.icon),
  }
}

// One file's text -> its agents. Never throws: a producer writing garbage must
// cost its own rows and nothing else, because the alternative is one bad file
// blanking the whole agent list.
function parseProvider(text, producer, now = Date.now()) {
  let doc
  try { doc = JSON.parse(text) } catch { return [] }
  if (!doc || typeof doc !== 'object') return []

  const at = doc.generatedAt
  const ttl = doc.ttlMs
  if (!Number.isFinite(at) || !Number.isFinite(ttl) || ttl <= 0) return []
  if (at > now + FUTURE_SKEW_MS) return []            // cannot expire; refuse
  if (now > at + Math.min(ttl, MAX_TTL_MS)) return [] // stale

  if (!Array.isArray(doc.agents)) return []
  const out = []
  const seen = new Set()
  for (const raw of doc.agents.slice(0, MAX_RECORDS)) {
    const a = normaliseAgent(raw, producer)
    // A producer listing one agent twice would double it in every count that
    // sums -- the breath, the subagent rollup -- so the first wins.
    if (a && !seen.has(a.key)) { seen.add(a.key); out.push(a) }
  }
  return out
}

function producerFor(file) {
  if (!file.endsWith('.json')) return null
  const stem = file.slice(0, -'.json'.length)
  return PRODUCER_RE.test(stem) ? stem : null
}

// The whole directory. A missing directory is the normal case -- no producers
// installed -- and yields nothing, exactly like a producer that has expired.
function readProviders({ home, now = Date.now(), dir } = {}) {
  const base = dir || providerDir(home)
  let files
  try { files = fs.readdirSync(base) } catch { return [] }
  const out = []
  for (const file of files.sort().slice(0, MAX_FILES)) {
    const producer = producerFor(file)
    if (!producer) continue
    let text
    try { text = fs.readFileSync(path.join(base, file), 'utf8') } catch { continue }
    out.push(...parseProvider(text, producer, now))
  }
  return out
}

module.exports = {
  readProviders, parseProvider, normaliseAgent, sanitiseLabel, producerFor, providerDir,
  normaliseIcon, iconFor, TYPE_ICONS, ICON_RANGES,
  STATES, MAX_TTL_MS, FUTURE_SKEW_MS, MAX_FILES, MAX_RECORDS, LABEL_MAX, DIR,
}
