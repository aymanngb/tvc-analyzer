// Size limits for PDFs sent to the Claude API. Kept apart from compressPdf.js,
// which pulls in pdf.js and pdf-lib (~800 KB), so the upload screen can decide
// whether compression is needed without loading either library.

// A request is capped at 32 MB and PDFs travel as base64 (x1.33), so the PDFs in
// one request may total ~22 MB raw. The Table 9 call sends treatment and brief
// together, so each gets half; a treatment on its own gets the lot.
export const BUDGET_ALONE = 22 * 1024 * 1024
export const BUDGET_PAIRED = 11 * 1024 * 1024

export function isPdf(file) {
  return !!file && (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'))
}

export function needsCompression(file, budget) {
  return isPdf(file) && file.size > budget
}
