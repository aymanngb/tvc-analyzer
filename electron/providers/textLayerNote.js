function textLayerNote(extractedText) {
  if (!extractedText || !extractedText.trim()) return null
  return `Text layer extracted from the PDF above, page by page. The pages were compressed to images, so use this for exact wording, names and numbers:\n\n${extractedText}`
}

module.exports = { textLayerNote }
