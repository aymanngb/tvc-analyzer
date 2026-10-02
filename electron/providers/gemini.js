const { textLayerNote } = require('./textLayerNote')

function partToParts(part) {
  if (part.type === 'text') return [{ text: part.text }]
  if (part.type === 'image') {
    return [{ inlineData: { mimeType: part.mediaType, data: part.base64 } }]
  }
  if (part.type === 'pdf') {
    const parts = [{ inlineData: { mimeType: 'application/pdf', data: part.base64 } }]
    const note = textLayerNote(part.extractedText)
    if (note) parts.push({ text: note })
    return parts
  }
  throw new Error(`Unknown part type: ${part.type}`)
}

function buildContents(turns) {
  return turns.map((turn) => ({
    role: turn.role === 'assistant' ? 'model' : 'user',
    parts: typeof turn.content === 'string' ? [{ text: turn.content }] : turn.content.flatMap(partToParts),
  }))
}

function parseResponse(response) {
  return response.text
}

async function generate({ apiKey, model, system, turns, maxTokens }) {
  const { GoogleGenAI } = require('@google/genai')
  const client = new GoogleGenAI({ apiKey })
  const response = await client.models.generateContent({
    model,
    contents: buildContents(turns),
    systemInstruction: system,
    config: { maxOutputTokens: maxTokens },
  })
  return parseResponse(response)
}

module.exports = {
  id: 'gemini',
  label: 'Gemini',
  keyPlaceholder: 'AIza...',
  models: [
    { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro' },
    { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash' },
    { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite' },
  ],
  defaultModel: 'gemini-3.1-pro-preview',
  buildContents,
  parseResponse,
  generate,
}
