# Multi-Provider API Keys Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user configure and switch between Anthropic, OpenAI, and Gemini API keys/models in Settings, with `analyze-brief` routing through whichever provider is active.

**Architecture:** A new `electron/providers/` adapter layer normalizes the existing Anthropic-shaped request-building into a provider-agnostic `turns`/`Part[]` format; each adapter (anthropic/openai/gemini) translates that into its own SDK call. A new `electron/config.js` holds pure, unit-tested config-shape functions (migration, per-provider key/model updates, the Settings view) so the risky nested-object logic is tested without needing Electron at all. `main.js` and `preload.js` become thin glue around both.

**Tech Stack:** Existing stack unchanged (Electron, React/Vite, `@anthropic-ai/sdk`) plus new `openai` and `@google/genai` dependencies. New pure-logic unit tests use Node's built-in `node:test`/`node:assert` (zero new dependency) — the project has no prior test framework, and `node:test` is the only addition that doesn't require picking/installing one. Electron-wiring and UI changes have no automated test harness available (none exists in this project for either) and are verified manually via `npm run dev`, per the spec's own Testing section.

**Spec:** `docs/superpowers/specs/2026-09-27-multi-provider-api-keys-design.md`

## Global Constraints

- Provider ids are exactly `anthropic`, `openai`, `gemini` (used as object keys throughout; order matters nowhere, spelling matters everywhere).
- Default active provider on a fresh/migrated config: `anthropic`.
- Model catalogs (id / label / default) are exactly:
  - anthropic: `claude-opus-4-8` "Claude Opus 4.8" (default), `claude-sonnet-5` "Claude Sonnet 5", `claude-haiku-4-5-20251001` "Claude Haiku 4.5"
  - openai: `gpt-6-astra` "GPT-6 Astra" (default), `gpt-6-sol` "GPT-6 Sol", `gpt-6-luna` "GPT-6 Luna"
  - gemini: `gemini-3.1-pro-preview` "Gemini 3.1 Pro" (default), `gemini-3.8-flash` "Gemini 3.8 Flash", `gemini-3.5-flash-lite` "Gemini 3.5 Flash-Lite"
- Provider `label`/`keyPlaceholder` (exact strings, used in Settings UI and error messages): anthropic -> label `Anthropic`, placeholder `sk-ant-...` (unchanged from today); openai -> label `OpenAI`, placeholder `sk-...`; gemini -> label `Gemini`, placeholder `AIza...`.
- Config file path is unchanged: `app.getPath('userData')/config.json`.
- IPC channels removed (no back-compat shim): `save-api-key`, `get-api-key`.
- IPC channels added: `get-settings`, `get-provider-key`, `save-provider-key`, `set-active-provider`, `set-provider-model`.
- Request-size guard stays a single threshold, `REQUEST_LIMIT = 32 * 1024 * 1024` (unchanged from today), applied regardless of active provider.
- Missing-key error text is exactly: `` `No API key configured for ${providerLabel}. Open Settings and add your API key.` ``
- New npm dependencies: `openai`, `@google/genai`. `@anthropic-ai/sdk` is already present, unchanged.

## Review Focus

- Saving one provider's key/model must not alter or erase another provider's previously saved key/model — a partial-update bug on the nested `providers` object would silently wipe other providers' settings.
- An old single-provider config (top-level `apiKey`/`apiKeyEncrypted`) must migrate into `providers.anthropic` without losing the key, including the edge case where both legacy fields are present (prefer the encrypted one, matching today's read-precedence).
- A PDF or image with no extracted text layer (e.g. a scanned, image-only PDF) must not inject a literal empty/"undefined" note block into any provider's request — the note block is conditional on non-empty `extractedText`.
- Running an analysis on the active provider when that provider has no saved key must fail with the clear, provider-named message above, not a generic error or a crash on an undefined variable.
- Switching the Settings provider dropdown without pressing Save must not change which provider the next "Analyze Brief" run actually uses — only a committed Save may change `activeProvider`.

---

## Task 1: Anthropic provider adapter

**Files:**
- Create: `electron/providers/textLayerNote.js`
- Create: `electron/providers/anthropic.js`
- Test: `electron/providers/textLayerNote.test.js`
- Test: `electron/providers/anthropic.test.js`
- Modify: `package.json` (add `"test": "node --test"` script)

**Interfaces:**
- Produces: `textLayerNote(extractedText: string | undefined) -> string | null`, reused by Tasks 2 and 3.
- Produces: default export of `electron/providers/anthropic.js`:
  ```js
  {
    id: 'anthropic',
    label: 'Anthropic',
    keyPlaceholder: 'sk-ant-...',
    models: [{ id, label }, ...],   // exact catalog from Global Constraints
    defaultModel: 'claude-opus-4-8',
    buildMessages(turns) -> AnthropicMessage[],   // exported for its own tests; not consumed elsewhere
    parseResponse(response) -> string,            // exported for its own tests; not consumed elsewhere
    async generate({ apiKey, model, system, turns, maxTokens }) -> Promise<string>,
  }
  ```
  `turns: [{ role: 'user'|'assistant', content: string | Part[] }]`, `Part` per spec (`text`/`image`/`pdf` shapes). `generate()` is consumed by Task 7.

- [ ] **Step 1: Write the failing tests for `textLayerNote`**

```js
// electron/providers/textLayerNote.test.js
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { textLayerNote } = require('./textLayerNote')

test('returns null for undefined input', () => {
  assert.equal(textLayerNote(undefined), null)
})

test('returns null for whitespace-only input', () => {
  assert.equal(textLayerNote('   \n  '), null)
})

test('wraps extracted text with the instructive note', () => {
  const result = textLayerNote('Scene 1: INT. KITCHEN')
  assert.match(result, /Text layer extracted from the PDF above/)
  assert.match(result, /Scene 1: INT\. KITCHEN/)
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test electron/providers/textLayerNote.test.js`
Expected: FAIL — `Cannot find module './textLayerNote'`

- [ ] **Step 3: Implement `textLayerNote(extractedText)` in `electron/providers/textLayerNote.js`**

Port the existing `textLayerBlock()` wording from `electron/main.js` (the `"Text layer extracted from the PDF above, page by page..."` string), but return the plain string (or `null`) instead of an Anthropic content-block array — each adapter wraps it in its own shape.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test electron/providers/textLayerNote.test.js`
Expected: PASS (3/3)

- [ ] **Step 5: Write the failing tests for the Anthropic adapter**

```js
// electron/providers/anthropic.test.js
const { test } = require('node:test')
const assert = require('node:assert/strict')
const anthropic = require('./anthropic')

test('exposes the exact model catalog and default', () => {
  assert.equal(anthropic.defaultModel, 'claude-opus-4-8')
  assert.deepEqual(anthropic.models.map(m => m.id), [
    'claude-opus-4-8', 'claude-sonnet-5', 'claude-haiku-4-5-20251001',
  ])
})

test('buildMessages passes through a plain-text turn unchanged', () => {
  const messages = anthropic.buildMessages([{ role: 'user', content: 'hello' }])
  assert.deepEqual(messages, [{ role: 'user', content: 'hello' }])
})

test('buildMessages converts an image part to an Anthropic image block', () => {
  const messages = anthropic.buildMessages([{
    role: 'user',
    content: [{ type: 'image', mediaType: 'image/png', base64: 'AAA' }],
  }])
  assert.deepEqual(messages[0].content, [
    { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAA' } },
  ])
})

test('buildMessages converts a pdf part with extractedText into document + note blocks', () => {
  const messages = anthropic.buildMessages([{
    role: 'user',
    content: [{ type: 'pdf', base64: 'BBB', extractedText: 'Scene 1' }],
  }])
  assert.equal(messages[0].content.length, 2)
  assert.deepEqual(messages[0].content[0], {
    type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: 'BBB' },
  })
  assert.match(messages[0].content[1].text, /Scene 1/)
})

test('buildMessages omits the note block when a pdf part has no extractedText', () => {
  const messages = anthropic.buildMessages([{
    role: 'user',
    content: [{ type: 'pdf', base64: 'BBB' }],
  }])
  assert.equal(messages[0].content.length, 1)
})

test('buildMessages preserves multi-turn role order', () => {
  const messages = anthropic.buildMessages([
    { role: 'user', content: 'first' },
    { role: 'assistant', content: 'second' },
    { role: 'user', content: 'third' },
  ])
  assert.deepEqual(messages.map(m => m.role), ['user', 'assistant', 'user'])
})

test('parseResponse reads the text from the first content block', () => {
  assert.equal(anthropic.parseResponse({ content: [{ text: 'result text' }] }), 'result text')
})
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `node --test electron/providers/anthropic.test.js`
Expected: FAIL — `Cannot find module './anthropic'`

- [ ] **Step 7: Implement `electron/providers/anthropic.js`**

`buildMessages(turns)` maps each turn's `content`: a string passes through as-is; a `Part[]` is flat-mapped through a part-to-block converter (`text` -> `{type:'text',text}`; `image` -> `{type:'image', source:{type:'base64', media_type: part.mediaType, data: part.base64}}`; `pdf` -> `[{type:'document', source:{type:'base64', media_type:'application/pdf', data: part.base64}}, ...(textLayerNote(part.extractedText) ? [{type:'text', text: textLayerNote(part.extractedText)}] : [])]`). `parseResponse(response)` returns `response.content[0].text`. `generate({apiKey, model, system, turns, maxTokens})` requires `@anthropic-ai/sdk`, constructs `new Anthropic.default({apiKey})`, calls `client.messages.create({model, max_tokens: maxTokens, system, messages: buildMessages(turns)})`, and returns `parseResponse(result)`. This mirrors the existing Anthropic call in today's `electron/main.js` — behavior is being relocated, not changed.

- [ ] **Step 8: Run tests to verify they pass**

Run: `node --test electron/providers/anthropic.test.js`
Expected: PASS (7/7)

- [ ] **Step 9: Add the `test` npm script**

In `package.json` `scripts`, add `"test": "node --test"`.

- [ ] **Step 10: Commit**

```bash
git add electron/providers/textLayerNote.js electron/providers/textLayerNote.test.js electron/providers/anthropic.js electron/providers/anthropic.test.js package.json
git commit -m "feat: add Anthropic provider adapter with normalized Part format"
```

---

## Task 2: OpenAI provider adapter

**Files:**
- Create: `electron/providers/openai.js`
- Test: `electron/providers/openai.test.js`
- Modify: `package.json` (add `openai` dependency)

**Interfaces:**
- Consumes: `textLayerNote` from Task 1 (`electron/providers/textLayerNote.js`).
- Produces: same adapter shape as Task 1, `id: 'openai'`, `label: 'OpenAI'`, `keyPlaceholder: 'sk-...'`, consumed by Task 4 (registry) and Task 7 (`generate`).
- Note: in this app's usage, only **user** turns ever carry `Part[]` content — the assistant turn in the Table 9 compare flow is always the plain-text result of the first call. `buildInput` only needs to handle `Part[]` content on turns whose role is `'user'`.

- [ ] **Step 1: Write the failing tests**

```js
// electron/providers/openai.test.js
const { test } = require('node:test')
const assert = require('node:assert/strict')
const openai = require('./openai')

test('exposes the exact model catalog and default', () => {
  assert.equal(openai.defaultModel, 'gpt-6-astra')
  assert.deepEqual(openai.models.map(m => m.id), ['gpt-6-astra', 'gpt-6-sol', 'gpt-6-luna'])
})

test('buildInput passes through a plain-text turn as a string content item', () => {
  const input = openai.buildInput([{ role: 'assistant', content: 'prior result' }])
  assert.deepEqual(input, [{ role: 'assistant', content: 'prior result' }])
})

test('buildInput converts an image part to input_image', () => {
  const input = openai.buildInput([{
    role: 'user',
    content: [{ type: 'image', mediaType: 'image/png', base64: 'AAA' }],
  }])
  assert.deepEqual(input[0].content, [
    { type: 'input_image', image_url: 'data:image/png;base64,AAA' },
  ])
})

test('buildInput converts a pdf part with extractedText into input_file + input_text', () => {
  const input = openai.buildInput([{
    role: 'user',
    content: [{ type: 'pdf', base64: 'BBB', extractedText: 'Scene 1' }],
  }])
  assert.equal(input[0].content.length, 2)
  assert.deepEqual(input[0].content[0], {
    type: 'input_file', filename: 'document.pdf', file_data: 'data:application/pdf;base64,BBB',
  })
  assert.match(input[0].content[1].text, /Scene 1/)
})

test('buildInput omits the note item when a pdf part has no extractedText', () => {
  const input = openai.buildInput([{ role: 'user', content: [{ type: 'pdf', base64: 'BBB' }] }])
  assert.equal(input[0].content.length, 1)
})

test('parseResponse reads output_text', () => {
  assert.equal(openai.parseResponse({ output_text: 'result text' }), 'result text')
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test electron/providers/openai.test.js`
Expected: FAIL — `Cannot find module './openai'`

- [ ] **Step 3: Add the `openai` dependency**

Run: `npm install openai`

- [ ] **Step 4: Implement `electron/providers/openai.js`**

`buildInput(turns)` maps each turn: if `content` is a string, `{ role: turn.role, content: turn.content }`; otherwise (always `role: 'user'` per this app's usage) `{ role: 'user', content: turn.content.flatMap(partToContent) }` where `partToContent` converts `text` -> `[{type:'input_text', text}]`, `image` -> `[{type:'input_image', image_url: \`data:${mediaType};base64,${base64}\`}]`, `pdf` -> `[{type:'input_file', filename:'document.pdf', file_data: \`data:application/pdf;base64,${base64}\`}, ...(textLayerNote(extractedText) ? [{type:'input_text', text: textLayerNote(extractedText)}] : [])]`. `parseResponse(response)` returns `response.output_text`. `generate({apiKey, model, system, turns, maxTokens})` requires `openai`, constructs `new OpenAI({apiKey})`, calls `client.responses.create({model, instructions: system, input: buildInput(turns), max_output_tokens: maxTokens})`, returns `parseResponse(result)`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test electron/providers/openai.test.js`
Expected: PASS (6/6)

- [ ] **Step 6: Commit**

```bash
git add electron/providers/openai.js electron/providers/openai.test.js package.json package-lock.json
git commit -m "feat: add OpenAI provider adapter (Responses API)"
```

---

## Task 3: Gemini provider adapter

**Files:**
- Create: `electron/providers/gemini.js`
- Test: `electron/providers/gemini.test.js`
- Modify: `package.json` (add `@google/genai` dependency)

**Interfaces:**
- Consumes: `textLayerNote` from Task 1.
- Produces: same adapter shape, `id: 'gemini'`, `label: 'Gemini'`, `keyPlaceholder: 'AIza...'`, consumed by Task 4 and Task 7.

- [ ] **Step 1: Write the failing tests**

```js
// electron/providers/gemini.test.js
const { test } = require('node:test')
const assert = require('node:assert/strict')
const gemini = require('./gemini')

test('exposes the exact model catalog and default', () => {
  assert.equal(gemini.defaultModel, 'gemini-3.1-pro-preview')
  assert.deepEqual(gemini.models.map(m => m.id), [
    'gemini-3.1-pro-preview', 'gemini-3.8-flash', 'gemini-3.5-flash-lite',
  ])
})

test('buildContents maps assistant role to "model"', () => {
  const contents = gemini.buildContents([{ role: 'assistant', content: 'prior result' }])
  assert.equal(contents[0].role, 'model')
  assert.deepEqual(contents[0].parts, [{ text: 'prior result' }])
})

test('buildContents keeps user role as "user"', () => {
  const contents = gemini.buildContents([{ role: 'user', content: 'hi' }])
  assert.equal(contents[0].role, 'user')
})

test('buildContents converts an image part to inlineData', () => {
  const contents = gemini.buildContents([{
    role: 'user',
    content: [{ type: 'image', mediaType: 'image/png', base64: 'AAA' }],
  }])
  assert.deepEqual(contents[0].parts, [{ inlineData: { mimeType: 'image/png', data: 'AAA' } }])
})

test('buildContents converts a pdf part with extractedText into inlineData + text parts', () => {
  const contents = gemini.buildContents([{
    role: 'user',
    content: [{ type: 'pdf', base64: 'BBB', extractedText: 'Scene 1' }],
  }])
  assert.equal(contents[0].parts.length, 2)
  assert.deepEqual(contents[0].parts[0], { inlineData: { mimeType: 'application/pdf', data: 'BBB' } })
  assert.match(contents[0].parts[1].text, /Scene 1/)
})

test('buildContents omits the text part when a pdf part has no extractedText', () => {
  const contents = gemini.buildContents([{ role: 'user', content: [{ type: 'pdf', base64: 'BBB' }] }])
  assert.equal(contents[0].parts.length, 1)
})

test('parseResponse reads the .text property', () => {
  assert.equal(gemini.parseResponse({ text: 'result text' }), 'result text')
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test electron/providers/gemini.test.js`
Expected: FAIL — `Cannot find module './gemini'`

- [ ] **Step 3: Add the `@google/genai` dependency**

Run: `npm install @google/genai`

- [ ] **Step 4: Implement `electron/providers/gemini.js`**

`buildContents(turns)` maps each turn to `{ role: turn.role === 'assistant' ? 'model' : 'user', parts: ... }`, where a string `content` becomes `[{text: content}]` and a `Part[]` content is flat-mapped through a converter: `text` -> `[{text}]`, `image` -> `[{inlineData:{mimeType, data: base64}}]`, `pdf` -> `[{inlineData:{mimeType:'application/pdf', data: base64}}, ...(textLayerNote(extractedText) ? [{text: textLayerNote(extractedText)}] : [])]`. `parseResponse(response)` returns `response.text`. `generate({apiKey, model, system, turns, maxTokens})` requires `@google/genai`, constructs `new GoogleGenAI({apiKey})`, calls `client.models.generateContent({model, contents: buildContents(turns), systemInstruction: system, config: {maxOutputTokens: maxTokens}})`, returns `parseResponse(result)`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test electron/providers/gemini.test.js`
Expected: PASS (7/7)

- [ ] **Step 6: Commit**

```bash
git add electron/providers/gemini.js electron/providers/gemini.test.js package.json package-lock.json
git commit -m "feat: add Gemini provider adapter"
```

---

## Task 4: Provider registry

**Files:**
- Create: `electron/providers/index.js`
- Test: `electron/providers/index.test.js`

**Interfaces:**
- Consumes: the three adapter modules from Tasks 1-3.
- Produces: `PROVIDERS: {anthropic, openai, gemini}`, `PROVIDER_IDS: string[]`, `DEFAULT_PROVIDER: 'anthropic'`, `getProvider(id) -> Adapter` (throws `Error` for an unknown id) — consumed by Task 5 (`config.js`) and Task 7 (`main.js`).

- [ ] **Step 1: Write the failing tests**

```js
// electron/providers/index.test.js
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { PROVIDERS, PROVIDER_IDS, DEFAULT_PROVIDER, getProvider } = require('./index')

test('registers all three providers under their ids', () => {
  assert.deepEqual(Object.keys(PROVIDERS).sort(), ['anthropic', 'gemini', 'openai'])
  assert.deepEqual(PROVIDER_IDS.sort(), ['anthropic', 'gemini', 'openai'])
})

test('defaults to anthropic', () => {
  assert.equal(DEFAULT_PROVIDER, 'anthropic')
})

test('getProvider returns the matching adapter', () => {
  assert.equal(getProvider('openai').id, 'openai')
})

test('getProvider throws for an unknown id', () => {
  assert.throws(() => getProvider('bogus'), /Unknown provider/)
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test electron/providers/index.test.js`
Expected: FAIL — `Cannot find module './index'`

- [ ] **Step 3: Implement `electron/providers/index.js`**

```js
const anthropic = require('./anthropic')
const openai = require('./openai')
const gemini = require('./gemini')

const PROVIDERS = { anthropic, openai, gemini }
const PROVIDER_IDS = Object.keys(PROVIDERS)
const DEFAULT_PROVIDER = 'anthropic'

function getProvider(id) {
  const provider = PROVIDERS[id]
  if (!provider) throw new Error(`Unknown provider: ${id}`)
  return provider
}

module.exports = { PROVIDERS, PROVIDER_IDS, DEFAULT_PROVIDER, getProvider }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test electron/providers/index.test.js`
Expected: PASS (4/4)

- [ ] **Step 5: Commit**

```bash
git add electron/providers/index.js electron/providers/index.test.js
git commit -m "feat: add provider registry"
```

---

## Task 5: Config module (migration + per-provider updates)

**Files:**
- Create: `electron/config.js`
- Test: `electron/config.test.js`

**Interfaces:**
- Consumes: `PROVIDERS`, `PROVIDER_IDS`, `DEFAULT_PROVIDER` from Task 4.
- Produces (all pure, no `fs`/`app`/`safeStorage` dependency, each returns a **new** object rather than mutating its input):
  ```js
  migrateConfig(raw: object) -> Config
  withProviderKeyEncrypted(config: Config, providerId: string, encryptedBase64: string) -> Config
  withProviderKeyPlain(config: Config, providerId: string, key: string) -> Config
  withActiveProvider(config: Config, providerId: string) -> Config
  withProviderModel(config: Config, providerId: string, modelId: string) -> Config
  getKeyMaterial(config: Config, providerId: string) -> { apiKeyEncrypted?: string, apiKey?: string }
  settingsView(config: Config) -> { activeProvider: string, providers: { [id]: { label, keyPlaceholder, models, model, hasKey } } }
  missingKeyMessage(providerLabel: string) -> string
  ```
  where `Config = { activeProvider: string, providers: { [id]: { apiKeyEncrypted?, apiKey?, model: string } } }`. Consumed by Task 6 (IPC handlers) and Task 7 (`analyze-brief`).

- [ ] **Step 1: Write the failing tests**

```js
// electron/config.test.js
const { test } = require('node:test')
const assert = require('node:assert/strict')
const {
  migrateConfig, withProviderKeyEncrypted, withProviderKeyPlain,
  withActiveProvider, withProviderModel, getKeyMaterial, settingsView, missingKeyMessage,
} = require('./config')

test('migrateConfig on an empty config creates all three providers with default models', () => {
  const config = migrateConfig({})
  assert.equal(config.activeProvider, 'anthropic')
  assert.equal(config.providers.anthropic.model, 'claude-opus-4-8')
  assert.equal(config.providers.openai.model, 'gpt-6-astra')
  assert.equal(config.providers.gemini.model, 'gemini-3.1-pro-preview')
})

test('migrateConfig moves a legacy encrypted key into providers.anthropic', () => {
  const config = migrateConfig({ apiKeyEncrypted: 'ENC123' })
  assert.equal(config.providers.anthropic.apiKeyEncrypted, 'ENC123')
  assert.equal(config.activeProvider, 'anthropic')
})

test('migrateConfig moves a legacy plaintext key into providers.anthropic', () => {
  const config = migrateConfig({ apiKey: 'sk-ant-plain' })
  assert.equal(config.providers.anthropic.apiKey, 'sk-ant-plain')
})

test('migrateConfig prefers the encrypted legacy field when both are present', () => {
  const config = migrateConfig({ apiKey: 'plain', apiKeyEncrypted: 'ENC123' })
  assert.equal(config.providers.anthropic.apiKeyEncrypted, 'ENC123')
  assert.equal(config.providers.anthropic.apiKey, undefined)
})

test('migrateConfig returns an already-migrated config unchanged', () => {
  const already = { activeProvider: 'openai', providers: { openai: { model: 'gpt-6-sol' } } }
  assert.deepEqual(migrateConfig(already), already)
})

test('withProviderKeyEncrypted sets only the target provider, leaving siblings untouched', () => {
  const base = migrateConfig({})
  const updated = withProviderKeyEncrypted(base, 'openai', 'ENC-OPENAI')
  assert.equal(updated.providers.openai.apiKeyEncrypted, 'ENC-OPENAI')
  assert.equal(updated.providers.anthropic.apiKeyEncrypted, undefined)
  assert.equal(updated.providers.gemini.model, 'gemini-3.1-pro-preview')
})

test('withProviderKeyPlain clears any previously-set encrypted key for that provider', () => {
  const base = withProviderKeyEncrypted(migrateConfig({}), 'anthropic', 'ENC')
  const updated = withProviderKeyPlain(base, 'anthropic', 'plain-key')
  assert.equal(updated.providers.anthropic.apiKey, 'plain-key')
  assert.equal(updated.providers.anthropic.apiKeyEncrypted, undefined)
})

test('withActiveProvider updates only activeProvider', () => {
  const updated = withActiveProvider(migrateConfig({}), 'gemini')
  assert.equal(updated.activeProvider, 'gemini')
})

test('withProviderModel updates only the target provider\'s model', () => {
  const updated = withProviderModel(migrateConfig({}), 'openai', 'gpt-6-luna')
  assert.equal(updated.providers.openai.model, 'gpt-6-luna')
  assert.equal(updated.providers.anthropic.model, 'claude-opus-4-8')
})

test('getKeyMaterial returns the stored key fields for a provider', () => {
  const config = withProviderKeyEncrypted(migrateConfig({}), 'anthropic', 'ENC')
  assert.deepEqual(getKeyMaterial(config, 'anthropic'), { apiKeyEncrypted: 'ENC' })
})

test('settingsView merges registry metadata with stored model/hasKey, never leaking the key itself', () => {
  const config = withProviderKeyEncrypted(migrateConfig({}), 'anthropic', 'ENC')
  const view = settingsView(config)
  assert.equal(view.activeProvider, 'anthropic')
  assert.equal(view.providers.anthropic.hasKey, true)
  assert.equal(view.providers.openai.hasKey, false)
  assert.equal(view.providers.anthropic.label, 'Anthropic')
  assert.ok(Array.isArray(view.providers.anthropic.models))
  assert.equal(view.providers.anthropic.apiKeyEncrypted, undefined)
})

test('missingKeyMessage names the provider', () => {
  assert.equal(
    missingKeyMessage('Gemini'),
    'No API key configured for Gemini. Open Settings and add your API key.',
  )
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test electron/config.test.js`
Expected: FAIL — `Cannot find module './config'`

- [ ] **Step 3: Implement `electron/config.js`**

Build each `withX` function by shallow-copying `config` and `config.providers`, then replacing only the target provider's entry (so sibling providers remain the exact same object references — this is what Review Focus item 1 is guarding against). `migrateConfig(raw)`: if `raw.providers` exists, return `raw` unchanged; otherwise build a fresh `providers` map with `{ model: PROVIDERS[id].defaultModel }` for each id in `PROVIDER_IDS`, then if `raw.apiKeyEncrypted` is set, assign it to `providers.anthropic.apiKeyEncrypted`, else if `raw.apiKey` is set, assign to `providers.anthropic.apiKey`; return `{ activeProvider: DEFAULT_PROVIDER, providers }`. `settingsView(config)` iterates `PROVIDER_IDS`, reading static fields (`label`, `keyPlaceholder`, `models`) from `PROVIDERS[id]` and dynamic fields (`model`, `hasKey: Boolean(stored.apiKeyEncrypted || stored.apiKey)`) from `config.providers[id]`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test electron/config.test.js`
Expected: PASS (13/13)

- [ ] **Step 5: Commit**

```bash
git add electron/config.js electron/config.test.js
git commit -m "feat: add pure config migration and per-provider update helpers"
```

---

## Task 6: Settings IPC handlers in `electron/main.js`

**Files:**
- Modify: `electron/main.js:1-87` (requires, `readConfig`/`writeConfig`, and the "IPC: API Key" section)

**Interfaces:**
- Consumes: everything from Task 5 (`electron/config.js`) and `getProvider`/`PROVIDER_IDS` from Task 4.
- Produces: IPC channels `get-settings`, `get-provider-key`, `save-provider-key`, `set-active-provider`, `set-provider-model` — consumed by Task 8 (`preload.js`).

No automated test here (requires the real Electron `app`/`safeStorage` runtime) — verified manually in Task 10.

- [ ] **Step 1: Replace config read/write and the API-key IPC section**

Require `{ migrateConfig, withProviderKeyEncrypted, withProviderKeyPlain, withActiveProvider, withProviderModel, getKeyMaterial, settingsView }` from `./config` and `{ getProvider, PROVIDER_IDS }` from `./providers`. Update `readConfig()` to run the raw JSON through `migrateConfig()` before returning, and — only when the raw config lacked `providers` (i.e. migration actually happened) — call `writeConfig()` immediately with the migrated result, so the on-disk file is upgraded on first read. Replace the `save-api-key`/`get-api-key` handlers with:
  - `get-settings`: `return settingsView(readConfig())`
  - `get-provider-key(_, providerId)`: read config, get `getKeyMaterial(config, providerId)`, decrypt via `safeStorage.decryptString` when `apiKeyEncrypted` is present and `safeStorage.isEncryptionAvailable()`, else return `apiKey || ''` (same fallback behavior as today's `get-api-key`)
  - `save-provider-key(_, providerId, key)`: read config, build the updated config via `safeStorage.isEncryptionAvailable() ? withProviderKeyEncrypted(config, providerId, safeStorage.encryptString(key).toString('base64')) : withProviderKeyPlain(config, providerId, key)`, `writeConfig()` it, return `true`
  - `set-active-provider(_, providerId)`: `writeConfig(withActiveProvider(readConfig(), providerId))`, return `true`
  - `set-provider-model(_, providerId, modelId)`: `writeConfig(withProviderModel(readConfig(), providerId, modelId))`, return `true`

- [ ] **Step 2: Manually verify**

Run `npm run dev`. Delete (or rename) any existing `config.json` under the app's userData dir first to test the fresh-install path, then confirm: the app launches without errors, and `window.electronAPI` calls (checked via DevTools console once Task 8 lands) will be exercised end-to-end in Task 10. For now, confirm via a one-off `node -e` snippet that `require('./electron/config').migrateConfig` + the handler logic match (no Electron needed for this spot-check since the pure functions are already tested in Task 5).

- [ ] **Step 3: Commit**

```bash
git add electron/main.js
git commit -m "feat: replace single-key IPC with per-provider settings IPC"
```

---

## Task 7: Refactor `analyze-brief` to route through the active provider

**Files:**
- Modify: `electron/main.js` (the `analyze-brief` handler, today at lines 112-296)

**Interfaces:**
- Consumes: `getProvider(id).generate({apiKey, model, system, turns, maxTokens})` from Tasks 1-4; `getKeyMaterial`, `missingKeyMessage` from Task 5.
- Produces: same `analyze-brief` IPC channel, same request/response payload shape as today — no renderer changes required by this task.

No automated test here (end-to-end behavior against real provider APIs) — verified manually in Task 10.

- [ ] **Step 1: Build normalized `Part[]`/`turns` instead of Anthropic-specific blocks**

Keep the existing file-type branching (image / PDF / DOCX via `mammoth` / pasted text) and `assertRequestSize` guard, but have it build normalized `Part` objects (`{type:'text', text}`, `{type:'image', mediaType, base64}`, `{type:'pdf', base64, extractedText}`) instead of Anthropic content blocks. `SYSTEM_PROMPT` and `COMPARE_PROMPT` stay exactly as they are today (unchanged copy) — they're passed as the `system` argument to `generate()`, not restructured.

- [ ] **Step 2: Resolve the active provider and key, with the provider-named error**

At the top of the handler: `const config = readConfig()`, `const provider = getProvider(config.activeProvider)`, `const { apiKeyEncrypted, apiKey: plainKey } = getKeyMaterial(config, config.activeProvider)`, decrypt the same way as `get-provider-key` in Task 6. If no key resolves, `throw new Error(missingKeyMessage(provider.label))`.

- [ ] **Step 3: Replace the two `client.messages.create(...)` calls with `provider.generate(...)`**

Main call: `provider.generate({ apiKey, model: config.providers[config.activeProvider].model, system: SYSTEM_PROMPT, turns: [{ role: 'user', content: mainParts }], maxTokens: 16000 })`. Compare call (only when a brief file is present): `provider.generate({ apiKey, model: ..., system: COMPARE_PROMPT, turns: [{role:'user', content: mainParts}, {role:'assistant', content: result}, {role:'user', content: [...briefParts, {type:'text', text:'Now compare this agency brief/storyboard against the treatment above and produce Table 9.'}]}], maxTokens: 8192 })`.

- [ ] **Step 4: Manually verify**

Deferred to Task 10's end-to-end pass (needs Settings UI from Task 9 to set a key/provider first).

- [ ] **Step 5: Commit**

```bash
git add electron/main.js
git commit -m "feat: route analyze-brief through the active provider adapter"
```

---

## Task 8: Update `electron/preload.js`

**Files:**
- Modify: `electron/preload.js`

**Interfaces:**
- Consumes: IPC channel names from Task 6.
- Produces: `window.electronAPI.{getSettings, getProviderKey, saveProviderKey, setActiveProvider, setProviderModel, analyzeBreif, exportPDF, exportXLSX}` — consumed by Task 9.

- [ ] **Step 1: Replace `saveApiKey`/`getApiKey` with the new methods**

```js
contextBridge.exposeInMainWorld('electronAPI', {
  analyzeBreif: (payload) => ipcRenderer.invoke('analyze-brief', payload),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  getProviderKey: (providerId) => ipcRenderer.invoke('get-provider-key', providerId),
  saveProviderKey: (providerId, key) => ipcRenderer.invoke('save-provider-key', providerId, key),
  setActiveProvider: (providerId) => ipcRenderer.invoke('set-active-provider', providerId),
  setProviderModel: (providerId, modelId) => ipcRenderer.invoke('set-provider-model', providerId, modelId),
  exportPDF: (html) => ipcRenderer.invoke('export-pdf', html),
  exportXLSX: (payload) => ipcRenderer.invoke('export-xlsx', payload),
})
```

- [ ] **Step 2: Manually verify**

Run `npm run dev`, open DevTools console in the app window, confirm `window.electronAPI.getSettings` resolves to the expected `{activeProvider, providers}` shape (Task 6's `get-settings` handler).

- [ ] **Step 3: Commit**

```bash
git add electron/preload.js
git commit -m "feat: expose per-provider settings methods on electronAPI"
```

---

## Task 9: Settings UI — provider + model selection

**Files:**
- Modify: `src/screens/SettingsScreen.jsx`

**Interfaces:**
- Consumes: `window.electronAPI.{getSettings, getProviderKey, saveProviderKey, setActiveProvider, setProviderModel}` from Task 8.

No automated test here (no UI test framework exists in this project) — verified manually, including the Review Focus item about dropdown-without-Save below.

- [ ] **Step 1: Load settings on mount**

Replace the `getApiKey()` effect with one that calls `getSettings()`, stores the full `{activeProvider, providers}` response, sets the selected-provider dropdown to `activeProvider`, and loads that provider's key via `getProviderKey(activeProvider)`.

- [ ] **Step 2: Add the Provider dropdown**

A `<select>` listing `Object.keys(settings.providers)` with each option labeled `settings.providers[id].label`. On change: update local "selected provider" state (separate from `activeProvider` — selecting does not call `setActiveProvider` yet) and reload that provider's key via `getProviderKey(id)` and its stored model.

- [ ] **Step 3: Add the Model dropdown scoped to the selected provider**

A `<select>` populated from `settings.providers[selectedProvider].models`, defaulting to that provider's currently-stored `model`. Replace the old static "Model: claude-opus-4-8 (recommended)" line.

- [ ] **Step 4: Update the Save button**

On click, for `selectedProvider`: call `saveProviderKey(selectedProvider, apiKey)`, `setProviderModel(selectedProvider, selectedModel)`, and `setActiveProvider(selectedProvider)` (in that order), then show the existing "✓ Saved" confirmation.

- [ ] **Step 5: Manually verify**

Run `npm run dev`, open Settings: (a) confirm Anthropic's previously-saved key still loads by default; (b) switch the Provider dropdown to OpenAI *without* clicking Save, close Settings, and confirm (via Task 6/7's `get-settings` in DevTools) that `activeProvider` is still `anthropic` — this is the Review Focus item guarding against UI-state leaking into "active"; (c) enter an OpenAI key, pick a model, click Save, reopen Settings, switch back to Anthropic, and confirm Anthropic's key/model are still intact; (d) switch to Gemini, save a key there too, and confirm all three persist independently across an app restart.

- [ ] **Step 6: Commit**

```bash
git add src/screens/SettingsScreen.jsx
git commit -m "feat: add provider and model selection to Settings"
```

---

## Task 10: End-to-end verification and docs

**Files:**
- Modify: `CLAUDE.md` (the "Architecture" section's IPC handler table and preload description)

- [ ] **Step 1: Run the full automated suite**

Run: `npm test`
Expected: all tests from Tasks 1-5 pass.

- [ ] **Step 2: Migration check**

Manually craft a legacy `config.json` (top-level `apiKeyEncrypted` only, no `providers`) at the app's userData path, launch via `npm run dev`, open Settings, and confirm the key loads under Anthropic with `activeProvider` resolved to `anthropic`.

- [ ] **Step 3: Cross-provider persistence check**

In Settings, set a key + model for each of the three providers (Save after each), restart the app, and confirm all three persisted independently and the last-saved one is active (repeats Task 9 Step 5's checks against the fully-wired app).

- [ ] **Step 4: Real analysis per provider**

With a valid key for each provider, run "Analyze Brief" on a sample treatment PDF through each of the three, confirming the markdown result parses correctly in `ResultsScreen` (tables render; PDF and Excel export both still work).

- [ ] **Step 5: Table 9 compare flow on a non-Anthropic provider**

Upload both a treatment and a brief file, with OpenAI or Gemini active, and confirm the Table 9 differences table is produced (exercises the 3-turn `generate()` path end-to-end).

- [ ] **Step 6: Missing-key error check**

Pick a provider with no saved key as active (or clear one via Settings... if the UI has no clear action, remove its entry from `config.json` directly), run "Analyze Brief", and confirm the error banner reads `No API key configured for <Provider Name>. Open Settings and add your API key.` with the correct provider name.

- [ ] **Step 7: Update `CLAUDE.md`**

Update the "Process split" and "IPC handlers" sections to describe the new `electron/providers/` adapter layer, `electron/config.js`, and the five settings-related IPC channels (replacing the `save-api-key`/`get-api-key` row and the "four methods" count in the Preload bridge description, which is now eight).

- [ ] **Step 8: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: document the multi-provider architecture"
```
