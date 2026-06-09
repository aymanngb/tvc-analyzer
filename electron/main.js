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

ipcMain.handle('analyze-brief', async (_, { text, fileBuffer, fileType, fileName }) => {
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

  const SYSTEM_PROMPT = `You are a Senior Executive Producer with 25+ years of experience in Egyptian and MENA commercial/film production. Your job: read a brief or director's treatment and extract everything a producer needs — stated AND implied — then flag what's going to cost more than the client expects.

Rules:
- Output SIX tables only. No prose paragraphs before or after.
- Every cell must be specific and actionable. No vague language.
- Use exact numbers where you can imply them (shoot days, talent count, set count).
- Named cost drivers only — never generic flags.
- Omit any table row where the category genuinely doesn't apply. Zero filler.
- Implied requirements are as important as stated ones — always explain WHY something is implied.
- Apply Egyptian/MENA market knowledge automatically.

Output format — produce exactly these six markdown tables:

## Document Type
[One line: Agency Brief / Director's Treatment / Hybrid — and one sentence on what's driving the production complexity]

## Table 1 — Production Requirements Overview
| Category | Stated | Implied | Why Implied | Complexity |
|----------|--------|---------|-------------|------------|
Use: 🟢 Low / 🟡 Medium / 🔴 High

## Table 2 — Sets & Locations Breakdown
| # | Set / Location | Build or Scout | Key Features Needed | Stated or Implied | Why Implied | Complexity |
One row per distinct set or location. Flag mechanical/structural requirements as custom fabrication.

## Table 3 — Props & Hero Items
| # | Prop / Item | Scene | Stated or Implied | Why Implied | Multiples Needed? | Note |

## Table 4 — Wardrobe Breakdown
| Character | # of Looks | Description | Stated or Implied | Why Implied | Flag |

## Table 5 — Risk & Cost Flags
| # | Flag | Specific Cost Driver | Why It Costs More Than Expected | Estimated Impact | Severity |
Severity: 🔴 Budget buster / 🟡 Watch item / 🟢 Minor

## Table 6 — MENA / Egypt Market Flags
| Issue | Detail | Action Needed | Urgency |
Only include rows that actually apply. No generic rows.

## EP Note
[One sentence. The thing a veteran EP would say to the client before signing the estimate. Direct, no hedging.]`

  let messageContent

  if (fileBuffer && fileType && fileType.startsWith('image/')) {
    const base64 = Buffer.from(fileBuffer).toString('base64')
    messageContent = [
      {
        type: 'image',
        source: { type: 'base64', media_type: fileType, data: base64 },
      },
      { type: 'text', text: 'Analyze this brief:' },
    ]
  } else {
    let content = text || ''

    if (fileBuffer && fileType === 'application/pdf') {
      const pdfParse = require('pdf-parse')
      const result = await pdfParse(Buffer.from(fileBuffer))
      content = result.text
    } else if (fileBuffer && (fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || fileName?.endsWith('.docx'))) {
      const mammoth = require('mammoth')
      const result = await mammoth.extractRawText({ buffer: Buffer.from(fileBuffer) })
      content = result.value
    }

    if (!content.trim()) throw new Error('Could not extract text from the uploaded file.')
    messageContent = `Analyze this brief:\n\n${content}`
  }

  const response = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: messageContent }],
  })

  return response.content[0].text
})

// ── IPC: Export PDF ───────────────────────────────────────────────────────────

ipcMain.handle('export-pdf', async () => {
  const { filePath } = await dialog.showSaveDialog(mainWindow, {
    defaultPath: `TVC-Breakdown-${Date.now()}.pdf`,
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  })

  if (!filePath) return { cancelled: true }

  const pdfData = await mainWindow.webContents.printToPDF({
    printBackground: true,
    pageSize: 'A4',
    landscape: true,
    margins: { top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 },
  })

  fs.writeFileSync(filePath, pdfData)
  return { success: true, filePath }
})
