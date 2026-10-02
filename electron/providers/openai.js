const { outputTruncatedError } = require('./errors')
const { textLayerNote } = require('./textLayerNote')

function partToContent(part) {
  if (part.type === 'text') return [{ type: 'input_text', text: part.text }]
  if (part.type === 'image') {
    return [{ type: 'input_image', image_url: `data:${part.mediaType};base64,${part.base64}` }]
  }
  if (part.type === 'pdf') {
    const content = [{ type: 'input_file', filename: 'document.pdf', file_data: `data:application/pdf;base64,${part.base64}` }]
    const note = textLayerNote(part.extractedText)
    if (note) content.push({ type: 'input_text', text: note })
    return content
  }
  throw new Error(`Unknown part type: ${part.type}`)
}

function buildInput(turns) {
  return turns.map((turn) => {
    if (typeof turn.content === 'string') return { role: turn.role, content: turn.content }
    return { role: 'user', content: turn.content.flatMap(partToContent) }
  })
}

function parseResponse(response) {
  if (response.incomplete_details?.reason === 'max_output_tokens') {
    throw outputTruncatedError('OpenAI output was cut short (max_output_tokens).')
  }
  if (!response.output_text) {
    const reason = response.incomplete_details?.reason || response.status || 'empty response'
    throw new Error(`OpenAI returned no text (${reason}). Try again or switch models.`)
  }
  return response.output_text
}

async function generate({ apiKey, model, system, turns, maxTokens }) {
  const OpenAI = require('openai')
  const client = new OpenAI({ apiKey })
  const response = await client.responses.create({
    model,
    instructions: system,
    input: buildInput(turns),
    max_output_tokens: maxTokens,
  })
  return parseResponse(response)
}

module.exports = {
  id: 'openai',
  label: 'OpenAI',
  keyPlaceholder: 'sk-...',
  models: [
    { id: 'gpt-6-astra', label: 'GPT-6 Astra' },
    { id: 'gpt-6-sol', label: 'GPT-6 Sol' },
    { id: 'gpt-6-luna', label: 'GPT-6 Luna' },
  ],
  defaultModel: 'gpt-6-astra',
  buildInput,
  parseResponse,
  generate,
}
