const { app, BrowserWindow, ipcMain, dialog, safeStorage } = require('electron')
const path = require('path')
const fs = require('fs')

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged
const configPath = path.join(app.getPath('userData'), 'config.json')

function readConfig() {
  try {
    if (!fs.existsSync(configPath)) return {}
    const raw = fs.readFileSync(configPath)
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

function writeConfig(data) {
  fs.writeFileSync(configPath, JSON.stringify(data, null, 2))
}

let mainWindow

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    center: true,
    show: false,
    backgroundColor: '#0f0f0f',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // Large treatments are compressed page by page in the renderer; keep that
      // at full speed when the user switches to another app while it runs.
      backgroundThrottling: false,
    },
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
    mainWindow.maximize()
    // DevTools: open manually with Cmd+Option+I if needed
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

// Start in the local home folder rather than restoring a stalled iCloud picker.
ipcMain.handle('choose-source-file', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: 'Choose treatment or brief',
    defaultPath: app.getPath('home'),
    properties: ['openFile'],
    filters: [{ name: 'Treatment and brief', extensions: ['pdf', 'docx', 'jpg', 'jpeg', 'png'] }],
  })
  if (canceled || !filePaths[0]) return null
  const filePath = filePaths[0]
  const types = {
    '.pdf': 'application/pdf',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  }
  const type = types[path.extname(filePath).toLowerCase()]
  if (!type) throw new Error('Choose a PDF, DOCX, JPG or PNG file.')
  // Cloud-only files may need downloading. Never leave the UI waiting forever.
  let timer
  try {
    const bytes = await Promise.race([
      fs.promises.readFile(filePath),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('This file is taking too long to open. Download it from iCloud first, or choose a local copy.')), 20000)
      }),
    ])
    return { name: path.basename(filePath), type, bytes: new Uint8Array(bytes) }
  } finally {
    clearTimeout(timer)
  }
})

// ── IPC: API Key ──────────────────────────────────────────────────────────────

ipcMain.handle('save-api-key', (_, key) => {
  const config = readConfig()
  if (safeStorage.isEncryptionAvailable()) {
    config.apiKeyEncrypted = safeStorage.encryptString(key).toString('base64')
    delete config.apiKey
  } else {
    config.apiKey = key
  }
  writeConfig(config)
  return true
})

ipcMain.handle('get-api-key', () => {
  const config = readConfig()
  if (config.apiKeyEncrypted && safeStorage.isEncryptionAvailable()) {
    return safeStorage.decryptString(Buffer.from(config.apiKeyEncrypted, 'base64'))
  }
  return config.apiKey || ''
})

// ── Request helpers ───────────────────────────────────────────────────────────

// Large PDFs arrive rasterized to images, which drops their text layer; the
// renderer extracts that text separately so small print isn't lost to the JPEG.
function textLayerBlock(extracted) {
  if (!extracted || !extracted.trim()) return []
  return [{
    type: 'text',
    text: `Text layer extracted from the PDF above, page by page. The pages were compressed to images, so use this for exact wording, names and numbers:\n\n${extracted}`,
  }]
}

// The API rejects requests over 32 MB. Catch it here with a message a producer
// can act on, rather than surfacing a raw 413.
const REQUEST_LIMIT = 32 * 1024 * 1024
function assertRequestSize(parts) {
  const bytes = Buffer.byteLength(JSON.stringify(parts), 'utf8')
  if (bytes > REQUEST_LIMIT * 0.97) {
    const mb = (bytes / 1048576).toFixed(0)
    throw new Error(`These files are too large to analyze together (${mb} MB, limit 32 MB). Try the treatment on its own, or export a smaller PDF.`)
  }
}

// ── IPC: Analyze Brief ────────────────────────────────────────────────────────

ipcMain.handle('analyze-brief', async (_, { text, fileBuffer, fileType, fileName, fileText, producerNotes, briefFileBuffer, briefFileType, briefFileName, briefFileText }) => {
  const config = readConfig()
  let apiKey = ''
  if (config.apiKeyEncrypted && safeStorage.isEncryptionAvailable()) {
    apiKey = safeStorage.decryptString(Buffer.from(config.apiKeyEncrypted, 'base64'))
  } else {
    apiKey = config.apiKey || ''
  }

  if (!apiKey) throw new Error('No API key configured. Open Settings and add your Anthropic API key.')

  const Anthropic = require('@anthropic-ai/sdk')
  const client = new Anthropic.default({ apiKey })

  const SYSTEM_PROMPT = `You are an executive producer reading a TV commercial treatment or brief. Produce the shortest useful, source-grounded production report. Read the whole document before writing. Prioritize understanding the story, confirmed scope, major production drivers, and unresolved decisions.

ACCURACY AND BREVITY:
- Never invent quantities, shoot days, equipment packages, costs, percentages, timelines or deliverables. Preserve exact stated names, quantities and specifications.
- Use "Not specified" for unknown essentials. Do not turn an unknown quantity into zero.
- Separate explicit facts from suggestions. Any inference must begin "Suggested:"; never describe an inference as confirmed. Producer notes are a separate source, not evidence of document content.
- Source cells: cite actual PDF page numbers, or a named heading for DOCX/text, or "Image" / "Producer notes". Never invent page references. Use "Not specified" when absent.
- Do not prescribe routine crew or equipment. Include technical requirements only when explicit or essential to an unusual execution; label suggestions.
- Keep the snapshot high-level; put detailed location, cast and wardrobe entries in their dedicated tables. No filler, generic advice, abbreviation glossary, severity emojis or executive closing note.
- Use the shortest wording that preserves meaning. Usually 3–10 words per detail; exact technical specifications may be longer.
- Aim for 250–350 words for the overview sections, excluding headers and the location, cast and wardrobe tables. Keep those detailed tables concise but complete. Never omit a distinct stated production requirement merely to meet the target. Combine related items only when quantities and sources remain clear.
- Output only the following markdown headings and pipe tables. Use a separator row in every table. Do not place literal pipe characters inside cells.

## Project Name
[Exact project/brand name when stated; otherwise Untitled Project]

## Document Type
[Agency Brief / Director's Treatment / Hybrid]

## Story
| # | Summary |
| --- | --- |
One row only: 2–3 short sentences, at most 45 words. Describe what the viewer sees in sequence and how it ends. No interpretation or invented story beats. If no story is supplied, say "Story not specified."

## At a Glance
| Item | Detail | Source |
| --- | --- | --- |
Confirmed scope only. Include Locations, Cast & extras, Hero props, Special execution, and Deliverables. Include Shoot days only if explicitly stated. Group location names and cast roles with exact quantities. Omit inapplicable categories; retain "Not specified" for essentials needed to quote. No repeated story description.

## Table 1 — Locations Breakdown
| Location | INT./EXT. | Day/Night | Scenes / action | Build / Scout | Key requirements | Source |
| --- | --- | --- | --- | --- | --- | --- |
One row per distinct story location. Use consistent location names across all tables. Include every stated location; do not count repeat appearances as new locations. Include scene numbers only when supplied; otherwise use a brief action reference. Distinguish story locations from actual filming sites: do not invent addresses or scouting decisions. Mark unstated interior/exterior, time of day, build/scout choices and requirements "Not specified". If no locations are identifiable, one row with "Not specified" in every cell.

## Table 2 — Cast Breakdown
| Character / Role | Cast type | Qty | Age / appearance | Location / action | Source |
| --- | --- | --- | --- | --- | --- |
One row per distinct character or explicitly described group of extras. Include all on-screen roles and any stated voice-over roles. Use Principal / Featured extra / Background / Voice-over only when explicit; otherwise "Not specified". Preserve explicit casting specifications only. Do not infer gender, age or appearance. Count a single clearly described individual as 1; unspecified group sizes are "Not specified". Do not count the same character again at another location or in another look. Link roles to matching location names or concise action references. If no cast is identifiable, one row with "Not specified" in every cell.

## Table 3 — Wardrobe Breakdown
| Character / Group | Look / scene | Clothing / styling | Changes | Multiples / backups | Source |
| --- | --- | --- | --- | --- | --- |
Use the exact character/group names from Cast Breakdown. One row per explicitly distinct outfit/look; where a cast role has no wardrobe detail, one row for that role with "Not specified" for unknown cells. Capture stated clothing, colours, uniforms, accessories and relevant hair/makeup in brief phrases. Separate stated changes from suggested continuity needs. Never invent outfit counts, costume changes or backups; use "Not specified". Mention a backup only when explicitly required. Include stated wardrobe requirements for any otherwise unidentified role/group and label the role "Not specified". If there is neither cast nor wardrobe information, one row with "Not specified" in every cell.

## Table 4 — Major Production Drivers
| Requirement | Production implication | Source |
| --- | --- | --- |
Up to 5 material execution/budget drivers, ranked by importance: builds, crowds, vehicles, stunts, complex VFX, travel or special logistics. Name the driver; give only its non-obvious implication, marked "Suggested:" if inferred. No invented numeric impacts. If none, one row: "None identified | — | —".

## Table 5 — Questions Before Quoting
| Question | Source |
| --- | --- |
Up to 5 specific missing decisions that affect price or feasibility, most important first. Do not repeat confirmed facts or ask irrelevant generic questions. If none, one row: "No essential questions identified | —".

## Table 6 — Essential Department Details
| Department | Requirement | Source |
| --- | --- | --- |
Only additional actionable details not already captured above: specific props, camera, grip, lighting, sound, VFX or post requirements. Put wardrobe in its dedicated table below. Omit routine packages and unsupported suggestions. Omit this whole section when it adds nothing.`

  const notesBlock = producerNotes && producerNotes.trim()
    ? `\n\nPRODUCER'S NOTES (factor these into every table — they reflect how the team is approaching this project):\n${producerNotes.trim()}`
    : ''

  let messageContent

  if (fileBuffer && fileType && fileType.startsWith('image/')) {
    const base64 = Buffer.from(fileBuffer).toString('base64')
    messageContent = [
      { type: 'image', source: { type: 'base64', media_type: fileType, data: base64 } },
      { type: 'text', text: `Analyze this brief:${notesBlock}` },
    ]
  } else if (fileBuffer && fileType === 'application/pdf') {
    // Send PDF directly to Claude — works for both text and image-based PDFs
    const base64 = Buffer.from(fileBuffer).toString('base64')
    messageContent = [
      { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
      ...textLayerBlock(fileText),
      { type: 'text', text: `Analyze this brief:${notesBlock}` },
    ]
  } else {
    let content = text || ''

    if (fileBuffer && (fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || fileName?.endsWith('.docx'))) {
      const mammoth = require('mammoth')
      const result = await mammoth.extractRawText({ buffer: Buffer.from(fileBuffer) })
      content = result.value
    }

    if (!content.trim()) throw new Error('Could not extract text from the uploaded file.')
    messageContent = `Analyze this brief:${notesBlock}\n\n${content}`
  }

  assertRequestSize(messageContent)
  const response = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 4500,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: messageContent }],
  })

  if (response.stop_reason === 'max_tokens') {
    throw new Error('The report was cut short. Please retry with a smaller document.')
  }
  let result = response.content.filter(block => block.type === 'text').map(block => block.text).join('\n')
  const required = ['Project Name', 'Document Type', 'Story', 'At a Glance', 'Table 4 — Major Production Drivers', 'Table 5 — Questions Before Quoting', 'Table 1 — Locations Breakdown', 'Table 2 — Cast Breakdown', 'Table 3 — Wardrobe Breakdown']
  if (required.some(heading => !result.includes(`## ${heading}\n`))) {
    throw new Error('The analysis returned an incomplete report. Please retry.')
  }

  // If a brief/storyboard was also uploaded, run a second call to generate the differences table
  if (briefFileBuffer && briefFileBuffer.length > 0) {
    let briefContent
    if (briefFileType && briefFileType.startsWith('image/')) {
      const base64 = Buffer.from(briefFileBuffer).toString('base64')
      briefContent = [
        { type: 'image', source: { type: 'base64', media_type: briefFileType, data: base64 } },
        { type: 'text', text: 'This is the agency brief / storyboard.' },
      ]
    } else if (briefFileType === 'application/pdf') {
      const base64 = Buffer.from(briefFileBuffer).toString('base64')
      briefContent = [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
        ...textLayerBlock(briefFileText),
        { type: 'text', text: 'This is the agency brief / storyboard.' },
      ]
    } else {
      const mammoth = require('mammoth')
      const parsed = await mammoth.extractRawText({ buffer: Buffer.from(briefFileBuffer) })
      briefContent = `Agency Brief / Storyboard:\n\n${parsed.value}`
    }

    const COMPARE_PROMPT = `Compare the original treatment with the agency brief/storyboard. Report only differences that change production scope, cost, feasibility or deliverables. No repeated breakdown or stylistic observations without production consequences. Never invent quantities or numeric cost impacts. Preserve exact stated details. Distinguish missing information from contradiction. Cite actual page numbers or named sections for each document; never invent references. Label inferred implications "Suggested:".
Output only:
## Table 7 — Brief vs Treatment: Decisions
| Topic | Brief | Treatment | Decision needed | Sources |
| --- | --- | --- | --- | --- |
Maximum 5 material differences, most important first; aim for under 100 words. Use short precise phrases. If none, one row: "No material differences identified | — | — | — | —". No prose, emojis or filler.`

    assertRequestSize([messageContent, result, briefContent])
    const compareResponse = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 1800,
      system: COMPARE_PROMPT,
      messages: [
        { role: 'user', content: messageContent },
        { role: 'assistant', content: result },
        { role: 'user', content: Array.isArray(briefContent)
            ? [...briefContent, { type: 'text', text: 'Now compare this agency brief/storyboard against the treatment above and produce Table 9.' }]
            : `Now compare this agency brief/storyboard against the treatment above and produce Table 9.\n\n${briefContent}`
        },
      ],
    })

    const comparison = compareResponse.content.filter(block => block.type === 'text').map(block => block.text).join('\n')
    if (compareResponse.stop_reason === 'max_tokens' || !comparison.includes('## Table 7 — Brief vs Treatment: Decisions\n')) {
      throw new Error('The brief comparison was incomplete. Please retry.')
    }
    result = result + '\n\n' + comparison
  }

  return result
})

// ── IPC: Export Excel ─────────────────────────────────────────────────────────

ipcMain.handle('export-xlsx', async (_, { projectName, projectDate, sheets }) => {
  const { filePath } = await dialog.showSaveDialog(mainWindow, {
    defaultPath: `TVC-Breakdown-${Date.now()}.xlsx`,
    filters: [{ name: 'Excel Workbook', extensions: ['xlsx'] }],
  })

  if (!filePath) return { cancelled: true }

  const ExcelJS = require('exceljs')
  const wb = new ExcelJS.Workbook()
  wb.creator = 'TVC Brief Analyzer'
  wb.title = projectName || 'Production Breakdown'
  wb.created = new Date()

  // Excel sheet names: max 31 chars, no []:*?/\\, must be unique
  const used = new Set()
  function sheetName(raw) {
    const base = (raw || 'Sheet').replace(/[\[\]:*?\/\\]/g, '-').slice(0, 31).trim()
    let name = base
    let n = 2
    while (used.has(name)) name = `${base.slice(0, 28)} ${n++}`
    used.add(name)
    return name
  }

  for (const sheet of sheets) {
    const ws = wb.addWorksheet(sheetName(sheet.name))
    ws.addRow(sheet.headers)
    sheet.rows.forEach((row) => ws.addRow(row))

    const header = ws.getRow(1)
    header.font = { bold: true }
    header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF99CC00' } }
    ws.views = [{ state: 'frozen', ySplit: 1 }]

    sheet.headers.forEach((h, ci) => {
      const widths = [String(h || '').length, ...sheet.rows.map((r) => String(r[ci] || '').length)]
      const col = ws.getColumn(ci + 1)
      col.width = Math.min(48, Math.max(10, Math.max(...widths) + 2))
      col.alignment = { wrapText: true, vertical: 'top' }
    })
  }

  await wb.xlsx.writeFile(filePath)
  return { success: true, filePath }
})

// ── IPC: Export PDF ───────────────────────────────────────────────────────────

ipcMain.handle('export-pdf', async (_, html) => {
  const { filePath } = await dialog.showSaveDialog(mainWindow, {
    defaultPath: `TVC-Breakdown-${Date.now()}.pdf`,
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  })

  if (!filePath) return { cancelled: true }

  // Embed logo as base64
  const logoPath = path.join(__dirname, '../public/logo.png')
  if (fs.existsSync(logoPath)) {
    const logoB64 = fs.readFileSync(logoPath).toString('base64')
    html = html.replaceAll('__LOGO_SRC__', `data:image/png;base64,${logoB64}`)
  } else {
    html = html.replaceAll('__LOGO_SRC__', '')
  }

  // Create a hidden window with clean standalone HTML for printing
  const printWin = new BrowserWindow({
    show: false,
    webPreferences: { contextIsolation: true },
  })

  const tmpHtml = path.join(app.getPath('temp'), `tvc-print-${Date.now()}.html`)
  fs.writeFileSync(tmpHtml, html, 'utf8')
  await printWin.loadFile(tmpHtml)
  await new Promise(r => setTimeout(r, 800))

  const pdfData = await printWin.webContents.printToPDF({
    printBackground: true,
    pageSize: 'A4',
    landscape: false,
    margins: { top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 },
  })

  printWin.destroy()
  fs.writeFileSync(filePath, pdfData)
  try { fs.unlinkSync(tmpHtml) } catch {}
  return { success: true, filePath }
})
