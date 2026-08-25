const test = require('node:test')
const assert = require('node:assert')
const { parsePmset, parsePiSugar, icon } = require('../segments.d/battery')

test('parses a percentage out of pmset output', () => {
  const out = '-InternalBattery-0 (id=123)\t87%; discharging; 4:21 remaining present: true'
  assert.strictEqual(parsePmset(out), 87)
})

test('returns null for pmset output with no battery', () => {
  assert.strictEqual(parsePmset('Now drawing from AC Power'), null)
})

test('parses a PiSugar percentage', () => {
  assert.strictEqual(parsePiSugar('battery: 63.5'), 63)
})

test('returns null for an unparseable PiSugar reply', () => {
  assert.strictEqual(parsePiSugar('no battery here'), null)
})

test('icon reflects charge level', () => {
  assert.strictEqual(icon(95), '󰂁')
  assert.strictEqual(icon(55), '󰁽')
  assert.strictEqual(icon(5), '󱃍')
})
