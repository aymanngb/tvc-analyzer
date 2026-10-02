const { test } = require('node:test')
const assert = require('node:assert/strict')
const { PROVIDERS, PROVIDER_IDS, DEFAULT_PROVIDER, getProvider } = require('./index')

test('registers all three providers under their ids', () => {
  assert.deepEqual(Object.keys(PROVIDERS).sort(), ['anthropic', 'gemini', 'openai'])
  assert.deepEqual(PROVIDER_IDS.sort(), ['anthropic', 'gemini', 'openai'])
})

test('defaults to anthropic', () => {
  assert.equal(DEFAULT_PROVIDER, 'anthropic')
})

test('getProvider returns the matching adapter', () => {
  assert.equal(getProvider('openai').id, 'openai')
})

test('getProvider throws for an unknown id', () => {
  assert.throws(() => getProvider('bogus'), /Unknown provider/)
})
