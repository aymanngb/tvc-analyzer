import React, { useState, useRef } from 'react'
import DropZone from '../components/DropZone'
import LoadingState from '../components/LoadingState'

export default function UploadScreen({ onOpenSettings, onResult }) {
  const [pastedText, setPastedText] = useState('')
  const [uploadedFile, setUploadedFile] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const hasContent = pastedText.trim().length > 0 || uploadedFile !== null

  async function handleAnalyze() {
    setError(null)
    setLoading(true)

    try {
      let payload = {}

      if (uploadedFile) {
        const arrayBuffer = await uploadedFile.arrayBuffer()
        payload = {
          fileBuffer: Array.from(new Uint8Array(arrayBuffer)),
          fileType: uploadedFile.type,
          fileName: uploadedFile.name,
          text: '',
        }
      } else {
        payload = { text: pastedText, fileBuffer: null, fileType: null, fileName: null }
      }

      if (!window.electronAPI) {
        throw new Error('Run the app via Electron (npm run dev), not a browser. The browser preview cannot call the Claude API.')
      }
      const result = await window.electronAPI.analyzeBreif(payload)
      onResult(result)
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
        <button className="icon-btn" onClick={onOpenSettings} title="Settings">
          ⚙️
        </button>
      </header>

      <main className="upload-main">
        <div className="upload-card">
          <DropZone
            onFile={(file) => {
              setUploadedFile(file)
              setPastedText('')
            }}
            uploadedFile={uploadedFile}
            onClear={() => setUploadedFile(null)}
          />

          <div className="divider">
            <span>or paste your brief below</span>
          </div>

          <textarea
            className="paste-area"
            placeholder="Paste the brief or treatment text here..."
            value={pastedText}
            onChange={(e) => {
              setPastedText(e.target.value)
              if (e.target.value) setUploadedFile(null)
            }}
            rows={8}
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
