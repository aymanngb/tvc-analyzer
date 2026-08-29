import React, { useState } from 'react'
import UploadScreen from './screens/UploadScreen'
import ResultsScreen from './screens/ResultsScreen'
import SettingsScreen from './screens/SettingsScreen'

export default function App() {
  const [screen, setScreen] = useState('upload')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [analysisResult, setAnalysisResult] = useState(null)
  const [projectMeta, setProjectMeta] = useState({ name: '', date: '' })

  return (
    <div className="app">
      {settingsOpen && <SettingsScreen onClose={() => setSettingsOpen(false)} />}

      {screen === 'upload' && (
        <UploadScreen
          onOpenSettings={() => setSettingsOpen(true)}
          onResult={(result, name) => {
            setAnalysisResult(result)
            setProjectMeta({ name: name || 'Untitled Project', date: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) })
            setScreen('results')
          }}
        />
      )}

      {screen === 'results' && (
        <ResultsScreen
          result={analysisResult}
          projectMeta={projectMeta}
          onNewBrief={() => {
            setAnalysisResult(null)
            setScreen('upload')
          }}
          onOpenSettings={() => setSettingsOpen(true)}
        />
      )}
    </div>
  )
}
