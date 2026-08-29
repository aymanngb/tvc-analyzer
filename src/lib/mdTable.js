// Shared markdown-table parsing for the on-screen tables and the PDF export.
// Cells are kept positional — an empty cell must stay an empty cell, otherwise
// every column after it shifts left.

export function splitRow(line) {
  const trimmed = line.trim()
  const cells = trimmed.split('|')
  if (trimmed.startsWith('|')) cells.shift()
  if (trimmed.endsWith('|')) cells.pop()
  return cells.map((c) => c.trim())
}

function isSeparatorRow(line) {
  const cells = splitRow(line)
  return cells.length > 0 && cells.every((c) => /^:?-+:?$/.test(c))
}

export function parseMarkdownTable(md) {
  const lines = md.split('\n').filter((l) => l.trim().startsWith('|'))
  if (lines.length < 2) return null

  const headers = splitRow(lines[0])
  if (headers.length === 0) return null

  const body = isSeparatorRow(lines[1]) ? lines.slice(2) : lines.slice(1)

  const rows = body
    .filter((l) => !isSeparatorRow(l))
    .map(splitRow)
    .filter((cells) => cells.some((c) => c !== ''))
    .map((cells) => {
      // Pad or trim to the header count so columns stay aligned even on a ragged row
      const row = cells.slice(0, headers.length)
      while (row.length < headers.length) row.push('')
      return row
    })

  return { headers, rows }
}

export function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
