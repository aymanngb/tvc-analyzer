const { test } = require('node:test')
const assert = require('node:assert/strict')
const {
  migrateConfig, withProviderKeyEncrypted, withProviderKeyPlain,
  withActiveProvider, withProviderModel, getKeyMaterial, settingsView, missingKeyMessage,
} = require('./config')

test('migrateConfig on an empty config creates all three providers with default models', () => {
  const config = migrateConfig({})
  assert.equal(config.activeProvider, 'anthropic')
  assert.equal(config.providers.anthropic.model, 'claude-opus-4-8')
  assert.equal(config.providers.openai.model, 'gpt-6-astra')
  assert.equal(config.providers.gemini.model, 'gemini-3.1-pro-preview')
})

test('migrateConfig moves a legacy encrypted key into providers.anthropic', () => {
  const config = migrateConfig({ apiKeyEncrypted: 'ENC123' })
  assert.equal(config.providers.anthropic.apiKeyEncrypted, 'ENC123')
  assert.equal(config.activeProvider, 'anthropic')
})

test('migrateConfig moves a legacy plaintext key into providers.anthropic', () => {
  const config = migrateConfig({ apiKey: 'sk-ant-plain' })
  assert.equal(config.providers.anthropic.apiKey, 'sk-ant-plain')
})

test('migrateConfig prefers the encrypted legacy field when both are present', () => {
  const config = migrateConfig({ apiKey: 'plain', apiKeyEncrypted: 'ENC123' })
  assert.equal(config.providers.anthropic.apiKeyEncrypted, 'ENC123')
  assert.equal(config.providers.anthropic.apiKey, undefined)
})

test('migrateConfig preserves an already-complete config unchanged', () => {
  const already = migrateConfig({})
  assert.deepEqual(migrateConfig(already), already)
})

test('migrateConfig fills in a provider missing from an otherwise-migrated config', () => {
  const partial = { activeProvider: 'openai', providers: { openai: { model: 'gpt-6-sol', apiKeyEncrypted: 'ENC-OPENAI' } } }
  const result = migrateConfig(partial)
  assert.equal(result.activeProvider, 'openai')
  assert.equal(result.providers.openai.model, 'gpt-6-sol')
  assert.equal(result.providers.openai.apiKeyEncrypted, 'ENC-OPENAI')
  assert.equal(result.providers.anthropic.model, 'claude-opus-4-8')
  assert.equal(result.providers.gemini.model, 'gemini-3.1-pro-preview')
})

test('migrateConfig defaults activeProvider when missing', () => {
  const noActive = { providers: { anthropic: { model: 'claude-opus-4-8' } } }
  assert.equal(migrateConfig(noActive).activeProvider, 'anthropic')
})

test('migrateConfig defaults activeProvider when it names an unknown provider', () => {
  const badActive = { activeProvider: 'bogus', providers: { anthropic: { model: 'claude-opus-4-8' } } }
  assert.equal(migrateConfig(badActive).activeProvider, 'anthropic')
})

test('withProviderKeyEncrypted sets only the target provider, leaving siblings untouched', () => {
  const base = migrateConfig({})
  const updated = withProviderKeyEncrypted(base, 'openai', 'ENC-OPENAI')
  assert.equal(updated.providers.openai.apiKeyEncrypted, 'ENC-OPENAI')
  assert.equal(updated.providers.anthropic.apiKeyEncrypted, undefined)
  assert.equal(updated.providers.gemini.model, 'gemini-3.1-pro-preview')
})

test('withProviderKeyPlain clears any previously-set encrypted key for that provider', () => {
  const base = withProviderKeyEncrypted(migrateConfig({}), 'anthropic', 'ENC')
  const updated = withProviderKeyPlain(base, 'anthropic', 'plain-key')
  assert.equal(updated.providers.anthropic.apiKey, 'plain-key')
  assert.equal(updated.providers.anthropic.apiKeyEncrypted, undefined)
})

test('withActiveProvider updates only activeProvider', () => {
  const updated = withActiveProvider(migrateConfig({}), 'gemini')
  assert.equal(updated.activeProvider, 'gemini')
})

test('withProviderModel updates only the target provider\'s model', () => {
  const updated = withProviderModel(migrateConfig({}), 'openai', 'gpt-6-luna')
  assert.equal(updated.providers.openai.model, 'gpt-6-luna')
  assert.equal(updated.providers.anthropic.model, 'claude-opus-4-8')
})

test('getKeyMaterial returns the stored key fields for a provider', () => {
  const config = withProviderKeyEncrypted(migrateConfig({}), 'anthropic', 'ENC')
  assert.deepEqual(getKeyMaterial(config, 'anthropic'), { apiKeyEncrypted: 'ENC' })
})

test('settingsView merges registry metadata with stored model/hasKey, never leaking the key itself', () => {
  const config = withProviderKeyEncrypted(migrateConfig({}), 'anthropic', 'ENC')
  const view = settingsView(config)
  assert.equal(view.activeProvider, 'anthropic')
  assert.equal(view.providers.anthropic.hasKey, true)
  assert.equal(view.providers.openai.hasKey, false)
  assert.equal(view.providers.anthropic.label, 'Anthropic')
  assert.ok(Array.isArray(view.providers.anthropic.models))
  assert.equal(view.providers.anthropic.apiKeyEncrypted, undefined)
})

test('missingKeyMessage names the provider', () => {
  assert.equal(
    missingKeyMessage('Gemini'),
    'No API key configured for Gemini. Open Settings and add your API key.',
  )
})
