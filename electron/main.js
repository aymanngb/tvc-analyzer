const { app, BrowserWindow, ipcMain, dialog, safeStorage } = require('electron')
const path = require('path')
const fs = require('fs')
const {
  migrateConfig, withProviderKeyEncrypted, withProviderKeyPlain,
  withActiveProvider, withProviderModel, getKeyMaterial, settingsView, missingKeyMessage,
} = require('./config')
const { getProvider, PROVIDER_IDS } = require('./providers')

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged
const configPath = path.join(app.getPath('userData'), 'config.json')

function readConfig() {
  let raw = {}
  try {
    if (fs.existsSync(configPath)) raw = JSON.parse(fs.readFileSync(configPath))
  } catch {
    raw = {}
  }
  const migrated = migrateConfig(raw)
  if (!raw.providers) writeConfig(migrated)
  return migrated
}

function decryptKey(keyMaterial) {
  if (keyMaterial.apiKeyEncrypted && safeStorage.isEncryptionAvailable()) {
    return safeStorage.decryptString(Buffer.from(keyMaterial.apiKeyEncrypted, 'base64'))
  }
  return keyMaterial.apiKey || ''
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

// ── IPC: Settings ──────────────────────────────────────────────────────────────

ipcMain.handle('get-settings', () => {
  return settingsView(readConfig())
})

ipcMain.handle('get-provider-key', (_, providerId) => {
  const config = readConfig()
  return decryptKey(getKeyMaterial(config, providerId))
})

ipcMain.handle('save-provider-key', (_, providerId, key) => {
  const config = readConfig()
  const updated = safeStorage.isEncryptionAvailable()
    ? withProviderKeyEncrypted(config, providerId, safeStorage.encryptString(key).toString('base64'))
    : withProviderKeyPlain(config, providerId, key)
  writeConfig(updated)
  return true
})

ipcMain.handle('set-active-provider', (_, providerId) => {
  writeConfig(withActiveProvider(readConfig(), providerId))
  return true
})

ipcMain.handle('set-provider-model', (_, providerId, modelId) => {
  writeConfig(withProviderModel(readConfig(), providerId, modelId))
  return true
})

// ── Request helpers ───────────────────────────────────────────────────────────

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
  const provider = getProvider(config.activeProvider)
  const apiKey = decryptKey(getKeyMaterial(config, config.activeProvider))

  if (!apiKey) throw new Error(missingKeyMessage(provider.label))

  const model = config.providers[config.activeProvider].model

  const SYSTEM_PROMPT = `You are a Senior Executive Producer in Egyptian/MENA commercial production. Read the document and fill the tables below. Be extremely concise — every cell is a keyword or short phrase, never a full sentence. No prose before or after the tables. No filler rows.

CELL RULES:
- Max 4 words per cell. Fragments only — never sentences.
- Lead with the number wherever one exists: "3 days", "12 extras", "2x backup".
- Never use explanatory connectives: because, due to, in order to, so that, which.
- "Why Implied" = 3 words max (e.g. "night scene lighting")
- Flags = single keyword or emoji only
- Omit any row where the category doesn't apply

## Project Name
[Brand + product + market, one line, no quotes]

## Document Type
[Agency Brief / Director's Treatment / Hybrid — 5 words max on complexity driver]

## Story
| # | Beat |
3-5 rows, in screen order. Present tense, max 8 words per beat. What the viewer actually sees.
No interpretation, no brand messaging — just what happens.

## Table 1 — Production Requirements Overview
| Category | Stated | Implied | Why Implied | Complexity |
Use: 🟢 Low / 🟡 Medium / 🔴 High

## Table 2 — Sets & Locations Breakdown
| # | Set / Location | Build or Scout | Key Features | S/I | Complexity |
S/I = Stated or Implied. One row per location.

## Table 3 — Props & Hero Items
| # | Prop / Item | Scene | Qty | S/I |
Qty = digit for total needed, including backups and multiples.

## Table 4 — Cast & Wardrobe Breakdown
| Location | Character / Role | Cast Type | # Looks | Wardrobe | Key Props | Flag |
- Location format: INT./EXT. NAME - DAY/NIGHT. Repeat exact name for each character at same location.
- Cast Type: Principal / Featured Extra / BG Extra

## Table 5 — Equipment Breakdown
| Location | Dept | Item / Package | Qty | S/I | Flag |
- Location: same INT./EXT. format. Dept: Camera / Grip / Lighting / Specialty

## Table 6 — Risk & Cost Flags
| # | Flag | Impact | Severity |
Impact = magnitude with a number only: "+2 days", "+15% grip", "+3 crew". Never prose.
Severity: 🔴 Budget buster / 🟡 Watch item / 🟢 Minor

## Table 7 — MENA / Egypt Market Flags
| Issue | Action | Urgency |
Only rows that actually apply.

## Table 8 — Production Summary
| Category | Items |
Categories in order: Shoot Days, Sets & Locations, Principal Cast, Featured Extras, BG Extras, Hero Props, Camera, Grip, Lighting, Specialty, VFX, Post, Key Risks
Items = comma-separated keywords, numbers first.

## At a Glance
| Item | Detail |
Exactly these six rows, in this order: Scope, Build, Cast, Heavy Lift, Biggest Risk, Budget Flag.
Detail = numbers and keywords joined by " · ". Max 6 words. No sentences, no full stops.
Example: "3 days · 5 locations" / "4 principals · 30 BG".
Write this section LAST, after every table above is finished, so it reflects them.

## EP Note
[One sentence max. What the EP says to the client before signing.]`

  const notesBlock = producerNotes && producerNotes.trim()
    ? `\n\nPRODUCER'S NOTES (factor these into every table — they reflect how the team is approaching this project):\n${producerNotes.trim()}`
    : ''

  let mainParts

  if (fileBuffer && fileType && fileType.startsWith('image/')) {
    const base64 = Buffer.from(fileBuffer).toString('base64')
    mainParts = [
      { type: 'image', mediaType: fileType, base64 },
      { type: 'text', text: `Analyze this brief:${notesBlock}` },
    ]
  } else if (fileBuffer && fileType === 'application/pdf') {
    // Send the PDF directly — works for both text and image-based PDFs
    const base64 = Buffer.from(fileBuffer).toString('base64')
    mainParts = [
      { type: 'pdf', base64, extractedText: fileText },
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
    mainParts = [{ type: 'text', text: `Analyze this brief:${notesBlock}\n\n${content}` }]
  }

  assertRequestSize(mainParts)
  let result = await provider.generate({
    apiKey,
    model,
    system: SYSTEM_PROMPT,
    turns: [{ role: 'user', content: mainParts }],
    maxTokens: 16000,
  })

  // If a brief/storyboard was also uploaded, run a second call to generate the differences table
  if (briefFileBuffer && briefFileBuffer.length > 0) {
    let briefParts
    if (briefFileType && briefFileType.startsWith('image/')) {
      const base64 = Buffer.from(briefFileBuffer).toString('base64')
      briefParts = [
        { type: 'image', mediaType: briefFileType, base64 },
        { type: 'text', text: 'This is the agency brief / storyboard.' },
      ]
    } else if (briefFileType === 'application/pdf') {
      const base64 = Buffer.from(briefFileBuffer).toString('base64')
      briefParts = [
        { type: 'pdf', base64, extractedText: briefFileText },
        { type: 'text', text: 'This is the agency brief / storyboard.' },
      ]
    } else {
      const mammoth = require('mammoth')
      const parsed = await mammoth.extractRawText({ buffer: Buffer.from(briefFileBuffer) })
      briefParts = [{ type: 'text', text: `Agency Brief / Storyboard:\n\n${parsed.value}` }]
    }

    const COMPARE_PROMPT = `You are a Senior Executive Producer comparing a director's treatment against an agency brief.

Your job: identify every meaningful difference between the two documents that has production implications. Focus on:
- Scenes or locations in one but not the other
- Cast or character differences
- Props, products, or hero items that differ
- Tone, style, or visual direction gaps
- Technical or equipment requirements that differ
- Timeline, shoot day, or logistics differences
- Anything the director added beyond the brief (cost implications)
- Anything in the brief the director ignored or changed

Output ONLY this single markdown table. No prose before or after.

## Table 9 — Treatment vs Brief: Key Differences
| # | Topic | In the Brief | In the Treatment | Production Impact | Flag |
Each row = one specific difference. Flag: 🔴 Major deviation / 🟡 Notable change / 🟢 Minor variation`

    assertRequestSize([mainParts, result, briefParts])
    const compareResult = await provider.generate({
      apiKey,
      model,
      system: COMPARE_PROMPT,
      turns: [
        { role: 'user', content: mainParts },
        { role: 'assistant', content: result },
        { role: 'user', content: [...briefParts, { type: 'text', text: 'Now compare this agency brief/storyboard against the treatment above and produce Table 9.' }] },
      ],
      maxTokens: 8192,
    })

    result = result + '\n\n' + compareResult
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
    pageSize: 'A3',
    landscape: true,
    margins: { top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 },
  })

  printWin.destroy()
  fs.writeFileSync(filePath, pdfData)
  try { fs.unlinkSync(tmpHtml) } catch {}
  return { success: true, filePath }
})
