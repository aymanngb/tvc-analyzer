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
  if (!response.text) {
    const reason = response.promptFeedback?.blockReason || response.candidates?.[0]?.finishReason || 'empty response'
    throw new Error(`Gemini returned no text (${reason}). Try again or switch models.`)
  }
  return response.text
}

function buildRequestParams({ model, system, turns, maxTokens }) {
  return {
    model,
    contents: buildContents(turns),
    config: { systemInstruction: system, maxOutputTokens: maxTokens },
  }
}

async function generate({ apiKey, model, system, turns, maxTokens }) {
  const { GoogleGenAI } = require('@google/genai')
  const client = new GoogleGenAI({ apiKey })
  const response = await client.models.generateContent(buildRequestParams({ model, system, turns, maxTokens }))
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
  buildRequestParams,
  parseResponse,
  generate,
}
