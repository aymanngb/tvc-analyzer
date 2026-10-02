const { PROVIDERS, PROVIDER_IDS, DEFAULT_PROVIDER } = require('./providers')

function migrateConfig(raw) {
  if (raw.providers) return raw

  const providers = {}
  for (const id of PROVIDER_IDS) {
    providers[id] = { model: PROVIDERS[id].defaultModel }
  }

  if (raw.apiKeyEncrypted) {
    providers.anthropic.apiKeyEncrypted = raw.apiKeyEncrypted
  } else if (raw.apiKey) {
    providers.anthropic.apiKey = raw.apiKey
  }

  return { activeProvider: DEFAULT_PROVIDER, providers }
}

function withProvider(config, providerId, updates) {
  const merged = { ...config.providers[providerId], ...updates }
  for (const key of Object.keys(updates)) {
    if (updates[key] === undefined) delete merged[key]
  }
  return {
    ...config,
    providers: { ...config.providers, [providerId]: merged },
  }
}

function withProviderKeyEncrypted(config, providerId, encryptedBase64) {
  return withProvider(config, providerId, { apiKeyEncrypted: encryptedBase64, apiKey: undefined })
}

function withProviderKeyPlain(config, providerId, key) {
  return withProvider(config, providerId, { apiKey: key, apiKeyEncrypted: undefined })
}

function withActiveProvider(config, providerId) {
  return { ...config, activeProvider: providerId }
}

function withProviderModel(config, providerId, modelId) {
  return withProvider(config, providerId, { model: modelId })
}

function getKeyMaterial(config, providerId) {
  const stored = config.providers[providerId]
  const material = {}
  if (stored.apiKeyEncrypted !== undefined) material.apiKeyEncrypted = stored.apiKeyEncrypted
  if (stored.apiKey !== undefined) material.apiKey = stored.apiKey
  return material
}

function settingsView(config) {
  const providers = {}
  for (const id of PROVIDER_IDS) {
    const provider = PROVIDERS[id]
    const stored = config.providers[id]
    providers[id] = {
      label: provider.label,
      keyPlaceholder: provider.keyPlaceholder,
      models: provider.models,
      model: stored.model,
      hasKey: Boolean(stored.apiKeyEncrypted || stored.apiKey),
    }
  }
  return { activeProvider: config.activeProvider, providers }
}

function missingKeyMessage(providerLabel) {
  return `No API key configured for ${providerLabel}. Open Settings and add your API key.`
}

module.exports = {
  migrateConfig,
  withProviderKeyEncrypted,
  withProviderKeyPlain,
  withActiveProvider,
  withProviderModel,
  getKeyMaterial,
  settingsView,
  missingKeyMessage,
}
