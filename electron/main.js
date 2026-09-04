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

// ── IPC: Analyze Brief ────────────────────────────────────────────────────────

ipcMain.handle('analyze-brief', async (_, { text, fileBuffer, fileType, fileName, producerNotes, briefFileBuffer, briefFileType, briefFileName }) => {
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

  const SYSTEM_PROMPT = `You are a Senior Executive Producer in Egyptian/MENA commercial production. Read the document and fill the tables below. Be extremely concise — every cell is a keyword or short phrase, never a full sentence. No prose before or after the tables. No filler rows.

CELL RULES:
- Max 6 words per cell. Use fragments, not sentences.
- "Why Implied" = 3 words max (e.g. "night scene lighting", "crowd implied by script")
- Flags/Notes = single keyword or emoji only
- Omit any row where the category doesn't apply
- Numbers > words where possible

## Project Name
[Brand + product + market, one line, no quotes]

## Document Type
[Agency Brief / Director's Treatment / Hybrid — 5 words max on complexity driver]

## Table 1 — Production Requirements Overview
| Category | Stated | Implied | Why Implied | Complexity |
Use: 🟢 Low / 🟡 Medium / 🔴 High

## Table 2 — Sets & Locations Breakdown
| # | Set / Location | Build or Scout | Key Features | S/I | Complexity |
S/I = Stated or Implied. One row per location.

## Table 3 — Props & Hero Items
| # | Prop / Item | Scene | S/I | Multiples? | Note |

## Table 4 — Cast & Wardrobe Breakdown
| Location | Character / Role | Cast Type | # Looks | Wardrobe | Key Props | Flag |
- Location format: INT./EXT. NAME - DAY/NIGHT. Repeat exact name for each character at same location.
- Cast Type: Principal / Featured Extra / BG Extra

## Table 5 — Equipment Breakdown
| Location | Dept | Item / Package | Qty | S/I | Flag |
- Location: same INT./EXT. format. Dept: Camera / Grip / Lighting / Specialty

## Table 6 — Risk & Cost Flags
| # | Flag | Cost Driver | Impact | Severity |
Severity: 🔴 Budget buster / 🟡 Watch item / 🟢 Minor

## Table 7 — MENA / Egypt Market Flags
| Issue | Detail | Action | Urgency |
Only rows that actually apply.

## Table 8 — Production Summary
| Category | Items |
Categories in order: Shoot Days, Sets & Locations, Principal Cast, Featured Extras, BG Extras, Hero Props, Camera, Grip, Lighting, Specialty, VFX, Post, Key Risks
Items = comma-separated keywords, numbers first.

## At a Glance
| Item | Detail |
Exactly these six rows, in this order: Scope, Build, Cast, Heavy Lift, Biggest Risk, Budget Flag.
Detail is ONE short sentence — max 8 words, ends with a period. This is the ONLY table that uses sentences, not fragments.
Write this section LAST, after every table above is finished, so it reflects them.

## EP Note
[One sentence max. What the EP says to the client before signing.]`

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

  const response = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: messageContent }],
  })

  let result = response.content[0].text

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
        { type: 'text', text: 'This is the agency brief / storyboard.' },
      ]
    } else {
      const mammoth = require('mammoth')
      const parsed = await mammoth.extractRawText({ buffer: Buffer.from(briefFileBuffer) })
      briefContent = `Agency Brief / Storyboard:\n\n${parsed.value}`
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

    const compareResponse = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 8192,
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

    result = result + '\n\n' + compareResponse.content[0].text
  }

  return result
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
