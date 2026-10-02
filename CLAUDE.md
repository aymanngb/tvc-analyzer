# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this app is

**TVC Brief Analyzer** — an Electron + React + Vite desktop app that uses an LLM (Anthropic, OpenAI, or Gemini — user-selected in Settings) to analyze TV commercial director's treatments and agency briefs, generating a structured production breakdown — a story synopsis, an At a Glance card, and Tables 1–6 (Locations, Cast, Wardrobe, Major Production Drivers, Questions Before Quoting, Essential Department Details) — plus an optional Table 7 (Brief vs Treatment: Decisions) when a second document is uploaded.

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
- **Main process** — `electron/main.js`: all Node.js-privileged work lives here. Handles IPC calls, provider API calls (via `electron/providers/`), PDF export via `printToPDF`, API key storage via `safeStorage`.
- **Renderer process** — `src/` (React/Vite): no direct Node access. Communicates with main only via `window.electronAPI` (see `electron/preload.js`).
- **Preload bridge** — `electron/preload.js`: exposes nine methods to the renderer: `chooseSourceFile`, `analyzeBreif`, `getSettings`, `getProviderKey`, `saveProviderKey`, `setActiveProvider`, `setProviderModel`, `exportPDF`, `exportXLSX`.

### Provider adapter layer (`electron/providers/`)
One module per LLM provider — `anthropic.js`, `openai.js`, `gemini.js` — each exporting `{ id, label, keyPlaceholder, models, defaultModel, generate({apiKey, model, system, turns, maxTokens}) }`. `turns` is a normalized, provider-agnostic conversation (`[{role: 'user'|'assistant', content: string | Part[]}]`, `Part` = `text`/`image`/`pdf`); each adapter translates that into its own SDK call (Anthropic Messages API, OpenAI Responses API, Gemini `generateContent`) and returns plain text. Each adapter's `parseResponse` throws an error with `code: 'OUTPUT_TRUNCATED'` (see `errors.js`) when the model hit its token limit, and a descriptive error when a response is empty or blocked. `textLayerNote.js` holds the shared wording for the PDF text-layer note all three adapters append. `index.js` is the registry (`PROVIDERS`, `PROVIDER_IDS`, `DEFAULT_PROVIDER`, `getProvider(id)`).

`electron/config.js` holds pure, unit-tested functions for the `config.json` shape: `migrateConfig()` (upgrades a pre-multi-provider config with a top-level `apiKey`/`apiKeyEncrypted` into the per-provider shape), `withProviderKeyEncrypted`/`withProviderKeyPlain`/`withActiveProvider`/`withProviderModel` (immutable per-provider updates), `getKeyMaterial`, `settingsView` (the shape returned by `get-settings`), and `missingKeyMessage`. These have a real test suite (`electron/**/*.test.js`, run via `npm test` — Node's built-in `node:test`, no added framework) since this project otherwise has none.

### IPC handlers (all in `electron/main.js`)
| Handler | What it does |
|---|---|
| `choose-source-file` | Opens a file picker starting in the home folder (avoids a stalled iCloud picker), reads the file with a 20 s timeout, returns `{name, type, bytes}`. |
| `analyze-brief` | Accepts treatment file + optional brief file. Resolves the active provider/model/key, calls `generate()` once for the main breakdown, then a second time for Table 7 if a brief file is present. Checks each result contains the required headings and surfaces truncated output as a retry message. |
| `get-settings` | Returns `{activeProvider, providers: {id: {label, keyPlaceholder, models, model, hasKey}}}` — never the decrypted key itself. |
| `get-provider-key` / `save-provider-key` | Per-provider key read/write. Encrypts/decrypts via `safeStorage`; falls back to plaintext if unavailable. Config stored at `app.getPath('userData')/config.json`. |
| `set-active-provider` / `set-provider-model` | Updates which provider is active, or which model a given provider uses. |
| `export-pdf` | Writes a temp HTML file, loads it in a hidden `BrowserWindow`, calls `printToPDF`, saves to user-chosen path. |

### File upload handling (in `analyze-brief`)
- **PDF** → sent directly as a normalized `pdf` Part (base64) — bypasses `pdf-parse`, works for image-based design treatments. Each provider adapter translates this into its own document/file format.
- **Image** → sent as an `image` Part (base64).
- **DOCX** → extracted with `mammoth`, sent as a `text` Part.
- **Pasted text** → sent as a `text` Part.

### Prompting (provider-agnostic)
- `SYSTEM_PROMPT` in `main.js` defines the breakdown schema and conciseness rules; unchanged regardless of which provider is active. Output budgets are 4500 tokens (main) and 1800 (comparison).
- `COMPARE_PROMPT` is used for the second `generate()` call that produces Table 7 (brief vs treatment) differences.
- The second call uses a multi-turn structure: the first call's result is passed as the assistant turn, then the brief file is added as the next user turn. Each provider adapter translates this the same way as the main call.

### PDF export HTML
`buildPrintHTML()` in `ResultsScreen.jsx` generates a self-contained HTML string with:
- `break-inside: avoid` + `overflow: visible` on `.section` — keeps each table on one page without clipping.
- Fixed footer with logo on every page via `position: fixed; bottom: 0`.
- `__LOGO_SRC__` placeholder replaced in main process with a base64 data URI (logo lives at `public/logo.png`).

### Screen flow
`App.jsx` manages three screens via a `screen` state string: `upload` → `results`. `SettingsScreen` overlays on top of either. No router library.

### Result parsing
`ResultsScreen.jsx` parses the raw markdown output (from whichever provider ran the analysis) with regexes:
- `## Table N — Title` headings split into sections
- `## Project Name`, `## Document Type`, `## Story`, `## At a Glance` (and `## EP Note` when present) parsed separately
- `mdTableToHtml()` converts markdown pipe tables to HTML for both the UI and PDF export
