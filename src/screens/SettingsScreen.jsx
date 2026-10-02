import React, { useState, useEffect } from 'react'

export default function SettingsScreen({ onClose }) {
  const [settings, setSettings] = useState(null)
  const [selectedProvider, setSelectedProvider] = useState(null)
  const [selectedModel, setSelectedModel] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [show, setShow] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    window.electronAPI.getSettings().then((s) => {
      setSettings(s)
      setSelectedProvider(s.activeProvider)
      setSelectedModel(s.providers[s.activeProvider].model)
      window.electronAPI.getProviderKey(s.activeProvider).then((key) => setApiKey(key || ''))
    })
  }, [])

  function handleProviderChange(providerId) {
    setSelectedProvider(providerId)
    setSelectedModel(settings.providers[providerId].model)
    window.electronAPI.getProviderKey(providerId).then((key) => setApiKey(key || ''))
  }

  async function handleSave() {
    await window.electronAPI.saveProviderKey(selectedProvider, apiKey)
    await window.electronAPI.setProviderModel(selectedProvider, selectedModel)
    await window.electronAPI.setActiveProvider(selectedProvider)
    setSettings((prev) => ({
      activeProvider: selectedProvider,
      providers: {
        ...prev.providers,
        [selectedProvider]: { ...prev.providers[selectedProvider], model: selectedModel, hasKey: true },
      },
    }))
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  if (!settings) return null

  const provider = settings.providers[selectedProvider]

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Settings</h2>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          <div>
            <label className="field-label">Provider</label>
            <select
              className="select-input"
              value={selectedProvider}
              onChange={(e) => handleProviderChange(e.target.value)}
            >
              {Object.keys(settings.providers).map((id) => (
                <option key={id} value={id}>{settings.providers[id].label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="field-label">{provider.label} API Key</label>
            <div className="key-input-row">
              <input
                type={show ? 'text' : 'password'}
                className="key-input"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={provider.keyPlaceholder}
                spellCheck={false}
              />
              <button className="toggle-btn" onClick={() => setShow(!show)}>
                {show ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          <div>
            <label className="field-label">Model</label>
            <select
              className="select-input"
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
            >
              {provider.models.map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
          </div>

          <button className="save-btn" onClick={handleSave}>
            {saved ? '✓ Saved' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
