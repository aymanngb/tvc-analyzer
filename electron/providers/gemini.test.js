const { test } = require('node:test')
const assert = require('node:assert/strict')
const gemini = require('./gemini')

test('exposes the exact model catalog and default', () => {
  assert.equal(gemini.defaultModel, 'gemini-3.1-pro-preview')
  assert.deepEqual(gemini.models.map(m => m.id), [
    'gemini-3.1-pro-preview', 'gemini-3.8-flash', 'gemini-3.5-flash-lite',
  ])
})

test('buildContents maps assistant role to "model"', () => {
  const contents = gemini.buildContents([{ role: 'assistant', content: 'prior result' }])
  assert.equal(contents[0].role, 'model')
  assert.deepEqual(contents[0].parts, [{ text: 'prior result' }])
})

test('buildContents keeps user role as "user"', () => {
  const contents = gemini.buildContents([{ role: 'user', content: 'hi' }])
  assert.equal(contents[0].role, 'user')
})

test('buildContents converts an image part to inlineData', () => {
  const contents = gemini.buildContents([{
    role: 'user',
    content: [{ type: 'image', mediaType: 'image/png', base64: 'AAA' }],
  }])
  assert.deepEqual(contents[0].parts, [{ inlineData: { mimeType: 'image/png', data: 'AAA' } }])
})

test('buildContents converts a pdf part with extractedText into inlineData + text parts', () => {
  const contents = gemini.buildContents([{
    role: 'user',
    content: [{ type: 'pdf', base64: 'BBB', extractedText: 'Scene 1' }],
  }])
  assert.equal(contents[0].parts.length, 2)
  assert.deepEqual(contents[0].parts[0], { inlineData: { mimeType: 'application/pdf', data: 'BBB' } })
  assert.match(contents[0].parts[1].text, /Scene 1/)
})

test('buildContents omits the text part when a pdf part has no extractedText', () => {
  const contents = gemini.buildContents([{ role: 'user', content: [{ type: 'pdf', base64: 'BBB' }] }])
  assert.equal(contents[0].parts.length, 1)
})

test('parseResponse reads the .text property', () => {
  assert.equal(gemini.parseResponse({ text: 'result text' }), 'result text')
})
