const anthropic = require('./anthropic')
const openai = require('./openai')
const gemini = require('./gemini')

const PROVIDERS = { anthropic, openai, gemini }
const PROVIDER_IDS = Object.keys(PROVIDERS)
const DEFAULT_PROVIDER = 'anthropic'

function getProvider(id) {
  const provider = PROVIDERS[id]
  if (!provider) throw new Error(`Unknown provider: ${id}`)
  return provider
}

module.exports = { PROVIDERS, PROVIDER_IDS, DEFAULT_PROVIDER, getProvider }
