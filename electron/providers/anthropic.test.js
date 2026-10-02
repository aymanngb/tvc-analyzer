const { test } = require('node:test')
const assert = require('node:assert/strict')
const anthropic = require('./anthropic')

test('exposes the exact model catalog and default', () => {
  assert.equal(anthropic.defaultModel, 'claude-opus-4-8')
  assert.deepEqual(anthropic.models.map(m => m.id), [
    'claude-opus-4-8', 'claude-sonnet-5', 'claude-haiku-4-5-20251001',
  ])
})

test('buildMessages passes through a plain-text turn unchanged', () => {
  const messages = anthropic.buildMessages([{ role: 'user', content: 'hello' }])
  assert.deepEqual(messages, [{ role: 'user', content: 'hello' }])
})

test('buildMessages converts an image part to an Anthropic image block', () => {
  const messages = anthropic.buildMessages([{
    role: 'user',
    content: [{ type: 'image', mediaType: 'image/png', base64: 'AAA' }],
  }])
  assert.deepEqual(messages[0].content, [
    { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAA' } },
  ])
})

test('buildMessages converts a pdf part with extractedText into document + note blocks', () => {
  const messages = anthropic.buildMessages([{
    role: 'user',
    content: [{ type: 'pdf', base64: 'BBB', extractedText: 'Scene 1' }],
  }])
  assert.equal(messages[0].content.length, 2)
  assert.deepEqual(messages[0].content[0], {
    type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: 'BBB' },
  })
  assert.match(messages[0].content[1].text, /Scene 1/)
})

test('buildMessages omits the note block when a pdf part has no extractedText', () => {
  const messages = anthropic.buildMessages([{
    role: 'user',
    content: [{ type: 'pdf', base64: 'BBB' }],
  }])
  assert.equal(messages[0].content.length, 1)
})

test('buildMessages preserves multi-turn role order', () => {
  const messages = anthropic.buildMessages([
    { role: 'user', content: 'first' },
    { role: 'assistant', content: 'second' },
    { role: 'user', content: 'third' },
  ])
  assert.deepEqual(messages.map(m => m.role), ['user', 'assistant', 'user'])
})

test('parseResponse reads the text from the first content block', () => {
  assert.equal(anthropic.parseResponse({ content: [{ type: 'text', text: 'result text' }] }), 'result text')
})

test('parseResponse joins every text block and ignores other block types', () => {
  const response = { content: [{ type: 'text', text: 'one' }, { type: 'thinking', thinking: 'x' }, { type: 'text', text: 'two' }] }
  assert.equal(anthropic.parseResponse(response), 'one\ntwo')
})

test('parseResponse throws an OUTPUT_TRUNCATED error when the response hit max_tokens', () => {
  assert.throws(
    () => anthropic.parseResponse({ stop_reason: 'max_tokens', content: [{ type: 'text', text: 'partial' }] }),
    (err) => err.code === 'OUTPUT_TRUNCATED',
  )
})
