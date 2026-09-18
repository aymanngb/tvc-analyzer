// Shrinks large PDFs so they fit the Claude API's 32 MB request cap.
//
// Director's treatments are routinely 100-250 MB because they carry
// print-resolution photography. Claude rasterizes every PDF page to roughly
// 1568px on its long edge regardless, so anything above that resolution is
// bytes it never sees. We re-render each page at that size as a JPEG, rebuild
// a compact image-only PDF, and pull the text layer out separately so no text
// accuracy is lost in the rasterize step.

import * as pdfjsLib from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { PDFDocument } from 'pdf-lib'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

const MAX_EDGE = 1568          // Claude's native image ceiling
const MAX_TEXT_CHARS = 200_000

// Best quality first. Lower rungs trade resolution for size; 960px still keeps
// headline and body type legible on a 16:9 slide.
const LADDER = [
  { edge: 1568, q: 0.82 },
  { edge: 1568, q: 0.68 },
  { edge: 1400, q: 0.62 },
  { edge: 1250, q: 0.58 },
  { edge: 1100, q: 0.54 },
  { edge: 960, q: 0.5 },
]

// toDataURL is synchronous. toBlob's callback is deferred by Chromium in a
// hidden or backgrounded window (measured at ~1s per page), which stalls a long
// deck to a crawl if the user switches apps mid-compression.
function canvasToJpeg(canvas, quality) {
  const b64 = canvas.toDataURL('image/jpeg', quality).split(',')[1]
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

async function renderPage(page) {
  const base = page.getViewport({ scale: 1 })
  const viewport = page.getViewport({ scale: MAX_EDGE / Math.max(base.width, base.height) })
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(viewport.width)
  canvas.height = Math.round(viewport.height)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#ffffff'                     // JPEG has no alpha; keep transparent areas white
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  await page.render({ canvasContext: ctx, viewport }).promise
  return canvas
}

// Resampling a bitmap is far cheaper than re-rendering the PDF page.
function downscale(source, edge) {
  const k = edge / Math.max(source.width, source.height)
  if (k >= 1) return source
  const c = document.createElement('canvas')
  c.width = Math.round(source.width * k)
  c.height = Math.round(source.height * k)
  const ctx = c.getContext('2d')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source, 0, 0, c.width, c.height)
  return c
}

function release(canvas) {
  canvas.width = canvas.height = 0              // free the backing store now, not at GC
}

// Render once, then walk the ladder from `startRung` until the page fits its
// share of the budget. Returns the JPEG and the rung it settled on.
async function encodePage(page, perPage, startRung) {
  const full = await renderPage(page)
  const scaled = new Map([[MAX_EDGE, full]])
  let smallest = null
  let settled = LADDER.length - 1

  try {
    for (let i = startRung; i < LADDER.length; i++) {
      const { edge, q } = LADDER[i]
      if (!scaled.has(edge)) scaled.set(edge, downscale(full, edge))
      const jpeg = canvasToJpeg(scaled.get(edge), q)
      if (!smallest || jpeg.length < smallest.length) { smallest = jpeg; settled = i }
      if (jpeg.length <= perPage) return { jpeg, rung: i }
    }
    return { jpeg: smallest, rung: settled }   // nothing fit: take the smallest attempt
  } finally {
    for (const c of scaled.values()) release(c)
  }
}

async function pageText(page) {
  const content = await page.getTextContent()
  return content.items.map((it) => it.str).join(' ').replace(/\s+/g, ' ').trim()
}

/**
 * @param {File} file
 * @param {number} budget   bytes the finished PDF must fit within
 * @param {(done: number, total: number) => void} [onProgress]
 * @returns {Promise<{ bytes: Uint8Array, text: string, pages: number, originalSize: number }>}
 */
export async function compressPdf(file, budget, onProgress) {
  const src = await pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
  const total = src.numPages
  const perPage = (budget * 0.94) / total        // ~6% headroom for the PDF container

  const out = await PDFDocument.create()
  const texts = []
  // Pages in a deck compress alike, so start each one a rung above where the
  // last settled: most pages then take a single encode, and a page that is
  // easier than its neighbour can still climb back to better quality.
  let rung = 0

  try {
    for (let i = 1; i <= total; i++) {
      const page = await src.getPage(i)
      const { width, height } = page.getViewport({ scale: 1 })

      const { jpeg, rung: used } = await encodePage(page, perPage, Math.max(0, rung - 1))
      rung = used
      const image = await out.embedJpg(jpeg)
      out.addPage([width, height]).drawImage(image, { x: 0, y: 0, width, height })

      const text = await pageText(page)
      if (text) texts.push(`[Page ${i}] ${text}`)

      page.cleanup()
      onProgress?.(i, total)
    }
  } finally {
    await src.destroy()
  }

  return {
    bytes: await out.save(),
    text: texts.join('\n').slice(0, MAX_TEXT_CHARS),
    pages: total,
    originalSize: file.size,
  }
}
