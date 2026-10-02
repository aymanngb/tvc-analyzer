const { test } = require('node:test')
const assert = require('node:assert/strict')
const openai = require('./openai')

test('exposes the exact model catalog and default', () => {
  assert.equal(openai.defaultModel, 'gpt-6-astra')
  assert.deepEqual(openai.models.map(m => m.id), ['gpt-6-astra', 'gpt-6-sol', 'gpt-6-luna'])
})

test('buildInput passes through a plain-text turn as a string content item', () => {
  const input = openai.buildInput([{ role: 'assistant', content: 'prior result' }])
  assert.deepEqual(input, [{ role: 'assistant', content: 'prior result' }])
})

test('buildInput converts an image part to input_image', () => {
  const input = openai.buildInput([{
    role: 'user',
    content: [{ type: 'image', mediaType: 'image/png', base64: 'AAA' }],
  }])
  assert.deepEqual(input[0].content, [
    { type: 'input_image', image_url: 'data:image/png;base64,AAA' },
  ])
})

test('buildInput converts a pdf part with extractedText into input_file + input_text', () => {
  const input = openai.buildInput([{
    role: 'user',
    content: [{ type: 'pdf', base64: 'BBB', extractedText: 'Scene 1' }],
  }])
  assert.equal(input[0].content.length, 2)
  assert.deepEqual(input[0].content[0], {
    type: 'input_file', filename: 'document.pdf', file_data: 'data:application/pdf;base64,BBB',
  })
  assert.match(input[0].content[1].text, /Scene 1/)
})

test('buildInput omits the note item when a pdf part has no extractedText', () => {
  const input = openai.buildInput([{ role: 'user', content: [{ type: 'pdf', base64: 'BBB' }] }])
  assert.equal(input[0].content.length, 1)
})

test('parseResponse reads output_text', () => {
  assert.equal(openai.parseResponse({ output_text: 'result text' }), 'result text')
})

test('parseResponse throws with the incomplete reason when output_text is empty', () => {
  assert.throws(
    () => openai.parseResponse({ output_text: '', incomplete_details: { reason: 'max_output_tokens' } }),
    /max_output_tokens/,
  )
})

test('parseResponse throws with the status when there is no incomplete reason', () => {
  assert.throws(
    () => openai.parseResponse({ output_text: '', status: 'failed' }),
    /failed/,
  )
})
