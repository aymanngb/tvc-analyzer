# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this app is

**TVC Brief Analyzer** — an Electron + React + Vite desktop app that uses the Claude API (`claude-opus-4-8`) to analyze TV commercial director's treatments and agency briefs, generating a structured 8-table production breakdown (plus an optional Table 9 comparison when a second document is uploaded).

## Commands

```bash
# Development (Vite + Electron in parallel)
npm run dev

# Production build + DMG installer
CSC_IDENTITY_AUTO_DISCOVERY=false npm run build
# → outputs to release/TVC Brief Analyzer-1.0.0.dmg (x64) and -arm64.dmg

# Vite only (no Electron)
npm run vite

# Electron only (against pre-built Vite output)
npm run electron
```

**Before building DMG:** run `xattr -cr .` from the project root to strip macOS extended attributes, otherwise `electron-builder` will error on code signing.

## Architecture

### Process split (Electron security model)
- **Main process** — `electron/main.js`: all Node.js-privileged work lives here. Handles IPC calls, Claude API calls, PDF export via `printToPDF`, API key storage via `safeStorage`.
- **Renderer process** — `src/` (React/Vite): no direct Node access. Communicates with main only via `window.electronAPI` (see `electron/preload.js`).
- **Preload bridge** — `electron/preload.js`: exposes four methods to the renderer: `analyzeBreif`, `saveApiKey`, `getApiKey`, `exportPDF`.

### IPC handlers (all in `electron/main.js`)
| Handler | What it does |
|---|---|
| `analyze-brief` | Accepts treatment file + optional brief file. Calls Claude once for Tables 1–8, then a second time for Table 9 if a brief file is present. |
| `save-api-key` / `get-api-key` | Encrypts/decrypts key via `safeStorage`; falls back to plaintext if unavailable. Config stored at `app.getPath('userData')/config.json`. |
| `export-pdf` | Writes a temp HTML file, loads it in a hidden `BrowserWindow`, calls `printToPDF`, saves to user-chosen path. |

### File upload handling (in `analyze-brief`)
- **PDF** → sent directly to Claude as a `document` block (base64) — bypasses `pdf-parse`, works for image-based design treatments.
- **Image** → sent as an `image` block (base64).
- **DOCX** → extracted with `mammoth`, sent as text.
- **Pasted text** → sent as text.

### Claude prompting
- `SYSTEM_PROMPT` in `main.js` defines the 8-table schema and strict conciseness rules (max 6 words/cell).
- `COMPARE_PROMPT` is used for the second API call that generates Table 9 differences.
- The second call uses a multi-turn message structure: first call's result is passed as the assistant turn, then the brief file is added as the next user turn.

### PDF export HTML
`buildPrintHTML()` in `ResultsScreen.jsx` generates a self-contained HTML string with:
- `break-inside: avoid` + `overflow: visible` on `.section` — keeps each table on one page without clipping.
- Fixed footer with logo on every page via `position: fixed; bottom: 0`.
- `__LOGO_SRC__` placeholder replaced in main process with a base64 data URI (logo lives at `public/logo.png`).

### Screen flow
`App.jsx` manages three screens via a `screen` state string: `upload` → `results`. `SettingsScreen` overlays on top of either. No router library.

### Result parsing
`ResultsScreen.jsx` parses the raw Claude markdown output with regexes:
- `## Table N — Title` headings split into sections
- `## Project Name`, `## Document Type`, `## EP Note` parsed separately
- `mdTableToHtml()` converts markdown pipe tables to HTML for both the UI and PDF export
