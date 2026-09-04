import React, { useState } from 'react'
import DropZone from '../components/DropZone'
import LoadingState from '../components/LoadingState'

export default function UploadScreen({ onOpenSettings, onResult }) {
  const [projectName, setProjectName] = useState('')
  const [pastedText, setPastedText] = useState('')
  const [treatmentFile, setTreatmentFile] = useState(null)
  const [treatmentMode, setTreatmentMode] = useState('file')
  const [briefFile, setBriefFile] = useState(null)
  const [producerNotes, setProducerNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const hasContent = pastedText.trim().length > 0 || treatmentFile !== null

  async function handleAnalyze() {
    setError(null)
    setLoading(true)

    try {
      let payload = {}
      if (treatmentFile) {
        const arrayBuffer = await treatmentFile.arrayBuffer()
        payload = {
          fileBuffer: Array.from(new Uint8Array(arrayBuffer)),
          fileType: treatmentFile.type,
          fileName: treatmentFile.name,
          text: '',
          producerNotes,
        }
      } else {
        payload = { text: pastedText, fileBuffer: null, fileType: null, fileName: null, producerNotes }
      }

      if (briefFile) {
        const briefArrayBuffer = await briefFile.arrayBuffer()
        payload.briefFileBuffer = Array.from(new Uint8Array(briefArrayBuffer))
        payload.briefFileType = briefFile.type
        payload.briefFileName = briefFile.name
      }

      if (!window.electronAPI) {
        throw new Error('Run the app via Electron (npm run dev), not a browser.')
      }
      const result = await window.electronAPI.analyzeBreif(payload)
      onResult(result, projectName.trim())
    } catch (err) {
      setError(err.message || 'Analysis failed. Check your API key in Settings.')
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <LoadingState />

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
