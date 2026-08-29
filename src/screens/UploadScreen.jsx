import React, { useState } from 'react'
import DropZone from '../components/DropZone'
import LoadingState from '../components/LoadingState'

export default function UploadScreen({ onOpenSettings, onResult }) {
  const [projectName, setProjectName] = useState('')
  const [pastedText, setPastedText] = useState('')
  const [treatmentFile, setTreatmentFile] = useState(null)
  const [briefFile, setBriefFile] = useState(null)
  const [producerNotes, setProducerNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const hasContent = pastedText.trim().length > 0 || treatmentFile !== null

  async function handleAnalyze() {
    setError(null)
    setLoading(true)

    try {
      // Build treatment payload
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

      // Attach brief file if provided (for comparison table only)
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
        <div className="upload-card">
          <input
            className="project-name-input"
            type="text"
            placeholder="Project name (e.g. Lay's Saudi — Q3 Campaign)"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
          />

          {/* Treatment upload */}
          <div className="upload-section-label">Director's Treatment</div>
          <DropZone
            label="Drop the director's treatment here"
            onFile={(file) => { setTreatmentFile(file); setPastedText('') }}
            uploadedFile={treatmentFile}
            onClear={() => setTreatmentFile(null)}
          />

          <div className="divider"><span>or paste your treatment below</span></div>

          <textarea
            className="paste-area"
            placeholder="Paste the treatment text here..."
            value={pastedText}
            onChange={(e) => { setPastedText(e.target.value); if (e.target.value) setTreatmentFile(null) }}
            rows={8}
          />

          {/* Brief / Storyboard upload — optional */}
          <div className="upload-section-label" style={{ marginTop: 4 }}>
            Agency Brief / Storyboard
            <span className="upload-section-optional">optional — adds a differences table</span>
          </div>
          <DropZone
            label="Drop the agency brief or storyboard here"
            onFile={(file) => setBriefFile(file)}
            uploadedFile={briefFile}
            onClear={() => setBriefFile(null)}
          />

          <div className="divider"><span>producer's notes</span></div>

          <textarea
            className="paste-area"
            placeholder="Add any remarks about how you're approaching this project — budget range, creative direction, client concerns, market, timeline, anything Claude should factor in..."
            value={producerNotes}
            onChange={(e) => setProducerNotes(e.target.value)}
            rows={4}
          />

          {error && <div className="error-msg">⚠️ {error}</div>}

          <button
            className="analyze-btn"
            disabled={!hasContent}
            onClick={handleAnalyze}
          >
            Analyze Brief
          </button>
        </div>
      </main>
    </div>
  )
}
