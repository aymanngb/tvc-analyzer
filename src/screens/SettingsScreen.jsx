import React, { useState, useEffect } from 'react'

export default function SettingsScreen({ onClose }) {
  const [apiKey, setApiKey] = useState('')
  const [show, setShow] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    window.electronAPI.getApiKey().then((key) => setApiKey(key || ''))
  }, [])

  async function handleSave() {
    await window.electronAPI.saveApiKey(apiKey)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Settings</h2>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          <label className="field-label">Anthropic API Key</label>
          <div className="key-input-row">
            <input
              type={show ? 'text' : 'password'}
              className="key-input"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-ant-..."
              spellCheck={false}
            />
            <button className="toggle-btn" onClick={() => setShow(!show)}>
              {show ? 'Hide' : 'Show'}
            </button>
          </div>

          <div className="model-info">
            <span className="field-label">Model</span>
            <span className="model-name">claude-opus-4-8 <em>(recommended)</em></span>
          </div>

          <button className="save-btn" onClick={handleSave}>
            {saved ? '✓ Saved' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
