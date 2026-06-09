import React, { useState } from 'react'
import UploadScreen from './screens/UploadScreen'
import ResultsScreen from './screens/ResultsScreen'
import SettingsScreen from './screens/SettingsScreen'

export default function App() {
  const [screen, setScreen] = useState('upload') // 'upload' | 'results'
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [analysisResult, setAnalysisResult] = useState(null)

  return (
    <div className="app">
      {settingsOpen && <SettingsScreen onClose={() => setSettingsOpen(false)} />}

      {screen === 'upload' && (
        <UploadScreen
          onOpenSettings={() => setSettingsOpen(true)}
          onResult={(result) => {
            setAnalysisResult(result)
            setScreen('results')
          }}
        />
      )}

      {screen === 'results' && (
        <ResultsScreen
          result={analysisResult}
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
