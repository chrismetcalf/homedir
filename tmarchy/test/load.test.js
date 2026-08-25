const test = require('node:test')
const assert = require('node:assert')
const load = require('../segments.d/load')

test('load is named for its @bar- option', () => {
  assert.strictEqual(load.name, 'load')
})

test('load renders a two-decimal number', () => {
  assert.match(load.render({}), /^\d+\.\d{2}$/)
})
