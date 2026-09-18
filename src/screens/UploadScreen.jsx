import React, { useState } from 'react'
import DropZone from '../components/DropZone'
import LoadingState from '../components/LoadingState'
import { needsCompression, isPdf, BUDGET_ALONE, BUDGET_PAIRED } from '../lib/pdfBudget'

export default function UploadScreen({ onOpenSettings, onResult }) {
  const [projectName, setProjectName] = useState('')
  const [pastedText, setPastedText] = useState('')
  const [treatmentFile, setTreatmentFile] = useState(null)
  const [treatmentMode, setTreatmentMode] = useState('file')
  const [briefFile, setBriefFile] = useState(null)
  const [producerNotes, setProducerNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(null)   // { label, done, total } while shrinking a PDF
  const [error, setError] = useState(null)

  const hasContent = pastedText.trim().length > 0 || treatmentFile !== null

  // Oversized PDFs are shrunk to fit the API's request cap; everything else is
  // passed through untouched. Bytes cross IPC as a Uint8Array, which structured
  // clone copies natively; a plain Array of numbers was ~2.6x larger and slow.
  async function prepare(file, budget, label) {
    const type = isPdf(file) ? 'application/pdf' : file.type
    if (needsCompression(file, budget)) {
      setProgress({ label, done: 0, total: 0 })
      const { compressPdf } = await import('../lib/compressPdf')   // loaded only when needed
      const out = await compressPdf(file, budget, (done, total) => setProgress({ label, done, total }))
      setProgress(null)
      return { bytes: out.bytes, type, text: out.text }
    }
    return { bytes: new Uint8Array(await file.arrayBuffer()), type, text: '' }
  }

  async function handleAnalyze() {
    setError(null)
    setLoading(true)

    try {
      // Treatment and brief travel in one request for Table 9, so they split the budget.
      const budget = briefFile ? BUDGET_PAIRED : BUDGET_ALONE

      let payload = {}
      if (treatmentFile) {
        const t = await prepare(treatmentFile, budget, 'Optimizing treatment')
        payload = {
          fileBuffer: t.bytes,
          fileType: t.type,
          fileName: treatmentFile.name,
          fileText: t.text,
          text: '',
          producerNotes,
        }
      } else {
        payload = { text: pastedText, fileBuffer: null, fileType: null, fileName: null, producerNotes }
      }

      if (briefFile) {
        const b = await prepare(briefFile, BUDGET_PAIRED, 'Optimizing brief')
        payload.briefFileBuffer = b.bytes
        payload.briefFileType = b.type
        payload.briefFileName = briefFile.name
        payload.briefFileText = b.text
      }

      if (!window.electronAPI) {
        throw new Error('Run the app via Electron (npm run dev), not a browser.')
      }
      const result = await window.electronAPI.analyzeBreif(payload)
      onResult(result, projectName.trim())
    } catch (err) {
      setError(err.message || 'Analysis failed. Check your API key in Settings.')
    } finally {
      setProgress(null)
      setLoading(false)
    }
  }

  if (loading) return <LoadingState progress={progress} />

  return (
    <div className="upload-screen">
      <header className="top-bar">
        <div className="app-title">
          <span className="clap-icon">🎬</span>
          <span>TVC Brief Analyzer</span>
        </div>
        <button className="icon-btn" onClick={onOpenSettings} title="Settings">⚙️</button>
      </header>

      <main className="upload-main">
        <div className="upload-container">
          <div className="project-head">
            <input
              className="project-title-input"
              type="text"
              placeholder="Untitled project"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
            />
            <p className="project-subtitle">Production breakdown</p>
          </div>

          <div className="source-grid">
            <section className="source-card source-card--primary">
              <header className="source-head">
                <span className="source-label">Director's Treatment</span>
                <span className="source-tag source-tag--required">Required</span>
              </header>

              <div className="segmented">
                <button
                  className={`segment ${treatmentMode === 'file' ? 'segment--on' : ''}`}
                  onClick={() => setTreatmentMode('file')}
                >
                  Upload
                </button>
                <button
                  className={`segment ${treatmentMode === 'text' ? 'segment--on' : ''}`}
                  onClick={() => setTreatmentMode('text')}
                >
                  Paste
                </button>
              </div>

              {treatmentMode === 'file' ? (
                <DropZone
                  label="Drop the treatment here"
                  onFile={(file) => { setTreatmentFile(file); setPastedText('') }}
                  uploadedFile={treatmentFile}
                  onClear={() => setTreatmentFile(null)}
                />
              ) : (
                <textarea
                  className="paste-area"
                  placeholder="Paste the treatment text…"
                  value={pastedText}
                  onChange={(e) => { setPastedText(e.target.value); if (e.target.value) setTreatmentFile(null) }}
                  rows={9}
                />
              )}
            </section>

            <section className="source-card">
              <header className="source-head">
                <span className="source-label">Agency Brief</span>
                <span className="source-tag">Optional</span>
              </header>

              <p className="source-hint">Adds a treatment-vs-brief differences table.</p>

              <DropZone
                label="Drop the brief or storyboard here"
                onFile={(file) => setBriefFile(file)}
                uploadedFile={briefFile}
                onClear={() => setBriefFile(null)}
              />
            </section>
          </div>

          <details className="notes-block">
            <summary className="notes-summary">
              <span className="notes-chevron" aria-hidden="true">›</span>
              Producer's notes
              <span className="notes-optional">optional</span>
            </summary>
            <textarea
              className="paste-area paste-area--notes"
              placeholder="Budget range, creative direction, client concerns, market, timeline — anything to factor in."
              value={producerNotes}
              onChange={(e) => setProducerNotes(e.target.value)}
              rows={4}
            />
          </details>

          {error && <div className="error-msg">⚠️ {error}</div>}

          <div className="analyze-row">
            <button className="analyze-btn" disabled={!hasContent} onClick={handleAnalyze}>
              Analyze Brief
            </button>
            {!hasContent && <span className="analyze-hint">Add a treatment to continue</span>}
          </div>
        </div>
      </main>
    </div>
  )
}
