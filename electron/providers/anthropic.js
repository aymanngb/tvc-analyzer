const { textLayerNote } = require('./textLayerNote')

function partToBlocks(part) {
  if (part.type === 'text') return [{ type: 'text', text: part.text }]
  if (part.type === 'image') {
    return [{ type: 'image', source: { type: 'base64', media_type: part.mediaType, data: part.base64 } }]
  }
  if (part.type === 'pdf') {
    const blocks = [{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: part.base64 } }]
    const note = textLayerNote(part.extractedText)
    if (note) blocks.push({ type: 'text', text: note })
    return blocks
  }
  throw new Error(`Unknown part type: ${part.type}`)
}

function buildMessages(turns) {
  return turns.map((turn) => ({
    role: turn.role,
    content: typeof turn.content === 'string' ? turn.content : turn.content.flatMap(partToBlocks),
  }))
}

function parseResponse(response) {
  return response.content[0].text
}

async function generate({ apiKey, model, system, turns, maxTokens }) {
  const Anthropic = require('@anthropic-ai/sdk')
  const client = new Anthropic.default({ apiKey })
  const response = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system,
    messages: buildMessages(turns),
  })
  return parseResponse(response)
}

module.exports = {
  id: 'anthropic',
  label: 'Anthropic',
  keyPlaceholder: 'sk-ant-...',
  models: [
    { id: 'claude-opus-4-8', label: 'Claude Opus 4.8' },
    { id: 'claude-sonnet-5', label: 'Claude Sonnet 5' },
    { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' },
  ],
  defaultModel: 'claude-opus-4-8',
  buildMessages,
  parseResponse,
  generate,
}
