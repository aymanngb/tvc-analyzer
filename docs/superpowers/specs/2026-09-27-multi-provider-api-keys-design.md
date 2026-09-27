# Multi-Provider API Keys — Design

## Goal

Today, TVC Brief Analyzer only talks to Anthropic's API — one hardcoded
model (`claude-opus-4-8`), one API key stored in Settings. The user wants
to add support for other LLM providers (OpenAI, Gemini, and room for
more later), so they can choose which provider/model analyzes a brief
and switch between providers they've already configured without
re-entering keys.

## Scope

- Settings UI: pick an active provider, enter/save that provider's key,
  pick that provider's model, independently of the other providers'
  saved settings.
- `analyze-brief` (both the main 8-table call and the Table 9 compare
  call) routes through whichever provider is currently active.
- Provider abstraction designed so a 4th/5th provider is a new adapter
  file + registry entry + npm dependency, not a rewrite.
- Out of scope: per-analysis provider override (provider choice is a
  global Settings-level concern, not a per-run option), streaming
  responses, cost/usage tracking, automatic failover between providers.

## Providers & models (curated dropdown, 2-3 per provider)

Verified live against each vendor's docs on 2026-09-27 (model names in
this space change often enough that memory isn't trustworthy):

| Provider | Model ID | Label | Default? |
|---|---|---|---|
| Anthropic | `claude-opus-4-8` | Claude Opus 4.8 | ✅ default (matches today) |
| Anthropic | `claude-sonnet-5` | Claude Sonnet 5 | |
| Anthropic | `claude-haiku-4-5-20251001` | Claude Haiku 4.5 | |
| OpenAI | `gpt-6-astra` | GPT-6 Astra | ✅ default for OpenAI |
| OpenAI | `gpt-6-sol` | GPT-6 Sol | |
| OpenAI | `gpt-6-luna` | GPT-6 Luna | |
| Gemini | `gemini-3.1-pro-preview` | Gemini 3.1 Pro | ✅ default for Gemini |
| Gemini | `gemini-3.8-flash` | Gemini 3.8 Flash | |
| Gemini | `gemini-3.5-flash-lite` | Gemini 3.5 Flash-Lite | |

Note: Gemini 3.1 Pro is still "Preview" status in Google's own docs —
it's the only current Gemini 3-generation high-reasoning model (2.5 Pro
is legacy/limited-access). User confirmed this default is acceptable.

The app's overall active provider defaults to **Anthropic** on first
run (preserves existing behavior for current users).

## Architecture: provider adapter layer

New `electron/providers/` directory:

```
electron/providers/
  index.js       - registry: { anthropic, openai, gemini } -> adapter
  anthropic.js
  openai.js
  gemini.js
```

Each adapter exports:
```js
{
  id: 'anthropic',
  label: 'Anthropic',
  keyPlaceholder: 'sk-ant-...',
  models: [{ id: 'claude-opus-4-8', label: 'Claude Opus 4.8' }, ...],
  defaultModel: 'claude-opus-4-8',
  async generate({ apiKey, model, system, turns, maxTokens }) -> Promise<string>
}
```

`turns` is a normalized, provider-agnostic conversation:
```js
[{ role: 'user' | 'assistant', content: string | Part[] }]

// Part =
//   { type: 'text', text }
//   { type: 'image', mediaType, base64 }
//   { type: 'pdf', base64, extractedText }   // extractedText optional
```

This shape generalizes what `analyze-brief` already builds today for
Anthropic (image/document/text blocks) — it isn't a new concept, just
lifted out of the Anthropic-specific call site so all three adapters
can consume it.

### Per-adapter translation

- **Anthropic** (`@anthropic-ai/sdk`, already a dependency): turns map
  directly to `messages`. `image` Part -> `{type:'image', source:{type:'base64', media_type, data}}`.
  `pdf` Part -> `{type:'document', source:{type:'base64', media_type:'application/pdf', data}}`
  plus the existing `textLayerBlock()` text block when `extractedText`
  is present. Call `client.messages.create({ model, max_tokens, system, messages })`,
  return `response.content[0].text`.

- **OpenAI** (new `openai` dependency, **Responses API**, not Chat
  Completions — confirmed via platform docs): turns map to `input`
  items with `role` + `content` arrays. `image` Part -> `{type:'input_image', image_url:`data:${mediaType};base64,${base64}`}`.
  `pdf` Part -> `{type:'input_file', filename:'document.pdf', file_data:`data:application/pdf;base64,${base64}`}`,
  plus an `input_text` item carrying `extractedText` when present (OpenAI's
  own PDF vision extraction is usually enough, but this keeps small-print
  fidelity consistent with the other two providers). System prompt goes
  in the top-level `instructions` field; `max_tokens` -> `max_output_tokens`.
  Call `client.responses.create({ model, instructions, input, max_output_tokens })`,
  return `response.output_text`.

- **Gemini** (new `@google/genai` dependency): turns map to `contents`
  with `role: 'user'|'model'` (Gemini uses `model` instead of
  `assistant`). `image`/`pdf` Parts -> `{ inlineData: { mimeType, data: base64 } }`;
  `extractedText` becomes an adjacent text part in the same turn. System
  prompt goes in the top-level `systemInstruction` field (text only —
  confirmed via Gemini API reference). Call
  `client.models.generateContent({ model, contents, systemInstruction, config: { maxOutputTokens } })`,
  return `response.text`.

### `analyze-brief` after refactor

Both existing Claude calls become calls to the active adapter's
`generate()`:
1. Main call: single user turn built from the uploaded file/text (same
   part-building logic as today, just producing normalized Parts
   instead of Anthropic-specific blocks).
2. Table 9 compare call (only when a brief file is also uploaded): a
   3-turn conversation — user (original parts), assistant (table 1-8
   result text), user (brief file parts + compare instruction) — passed
   to the same `generate()` with the `COMPARE_PROMPT` as `system`.

No IPC payload changes on the renderer side — `analyzeBreif` still just
sends files/text/notes. The provider/model choice is read from config
inside the `analyze-brief` handler, exactly like the API key is today.

## Config & storage

New schema in `config.json` (still via `safeStorage` for keys, same
fallback-to-plaintext behavior as today when encryption is unavailable):

```json
{
  "activeProvider": "anthropic",
  "providers": {
    "anthropic": { "apiKeyEncrypted": "...", "model": "claude-opus-4-8" },
    "openai":    { "apiKeyEncrypted": "...", "model": "gpt-6-astra" },
    "gemini":    { "apiKeyEncrypted": "...", "model": "gemini-3.1-pro-preview" }
  }
}
```

**One-time migration** on `readConfig()`: if the old top-level `apiKey`
or `apiKeyEncrypted` field exists and `providers` doesn't, move it into
`providers.anthropic.apiKeyEncrypted`/`apiKey`, set
`activeProvider: "anthropic"`, delete the old top-level fields, and
write back — so existing users don't lose their saved key.

## IPC surface changes

Remove: `save-api-key`, `get-api-key` (no back-compat shim — one
renderer, both sides updated together).

Add:
- `get-settings()` -> `{ activeProvider, providers: { <id>: { model, hasKey } } }`
  (never returns decrypted keys here — used to populate the provider/model
  dropdowns and show whether a key is already saved)
- `get-provider-key(providerId)` -> decrypted key string (same trust
  model as today's `get-api-key`, used only to prefill the password
  field when that provider's tab is open)
- `save-provider-key(providerId, key)` -> encrypts + stores under
  `providers[providerId]`
- `set-active-provider(providerId)` -> updates `activeProvider`
- `set-provider-model(providerId, modelId)` -> updates
  `providers[providerId].model`

`preload.js` exposes matching renderer methods; old `saveApiKey`/
`getApiKey` are removed, not aliased.

## Settings UI

`SettingsScreen.jsx` gains a **Provider** dropdown (Anthropic / OpenAI /
Gemini) above the existing key input. Changing it loads that provider's
saved key (via `get-provider-key`) and reveals a **Model** dropdown
scoped to that provider's curated list (2-3 options from the table
above), replacing today's static "Model: claude-opus-4-8 (recommended)"
line.

**Save** button writes, for the currently-selected provider in the
dropdown: its key (`save-provider-key`), its model
(`set-provider-model`), and marks it as the app's `activeProvider`
(`set-active-provider`) — one button, same flow as today, now scoped to
whichever provider tab is open. Switching the dropdown without hitting
Save doesn't change what's active; each provider's previously-saved
key/model stays intact when you switch away and back.

## Error handling & limits

- Missing key: `No API key configured for <Provider Name>. Open
  Settings and add your API key.` (provider-aware version of today's
  message; same `err.message` -> UI error banner path in
  `UploadScreen.jsx`).
- Request-size guard (`assertRequestSize`, currently 32 MB, Anthropic's
  real limit) stays a single conservative threshold applied regardless
  of active provider — it's already the tightest of the three vendors'
  actual limits (OpenAI: 50 MB combined; Gemini: comparable), and three
  separate thresholds would add complexity with no user-visible benefit.
- Provider API errors (rate limits, invalid key, etc.) propagate as
  thrown `Error`s from the adapter, same as today — no new retry/fallback
  logic.

## New dependencies

- `openai` (OpenAI's official Node SDK, Responses API)
- `@google/genai` (Google's current unified Gemini SDK — supersedes the
  older `@google/generative-ai` package)
- `@anthropic-ai/sdk` — already present, unchanged

## Testing / verification

No test framework exists in this project (`package.json` has no test
script). Verification is manual, via `npm run dev`:
1. Confirm the migration path: with an existing `config.json` containing
   the old `apiKey`/`apiKeyEncrypted` shape, launch the app and confirm
   the key still loads under Anthropic in Settings.
2. In Settings, switch the Provider dropdown between all three, enter a
   key + pick a model for each, hit Save each time, restart the app, and
   confirm all three persisted independently and the last-saved one is
   active.
3. Run a real analysis (sample treatment PDF) through each of the three
   providers with a valid key, confirming the markdown result parses
   correctly in `ResultsScreen` (tables render, PDF/Excel export works).
4. Run the Table 9 compare flow (treatment + brief both uploaded)
   through at least one non-Anthropic provider to confirm the 3-turn
   `generate()` path works end-to-end.
5. Confirm the "no key configured" error message names the correct
   provider when the active provider has no saved key.
