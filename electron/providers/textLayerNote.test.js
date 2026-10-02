const { test } = require('node:test')
const assert = require('node:assert/strict')
const { textLayerNote } = require('./textLayerNote')

test('returns null for undefined input', () => {
  assert.equal(textLayerNote(undefined), null)
})

test('returns null for whitespace-only input', () => {
  assert.equal(textLayerNote('   \n  '), null)
})

test('wraps extracted text with the instructive note', () => {
  const result = textLayerNote('Scene 1: INT. KITCHEN')
  assert.match(result, /Text layer extracted from the PDF above/)
  assert.match(result, /Scene 1: INT\. KITCHEN/)
})
