import React, { useState, useEffect } from 'react'

const STAGES = [
  'Reading document...',
  'Analyzing requirements...',
  'Building breakdown...',
]

export default function LoadingState() {
  const [stage, setStage] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setStage((s) => (s < STAGES.length - 1 ? s + 1 : s))
    }, 1800)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="loading-screen">
      <div className="loading-card">
        <div className="spinner" />
        <div className="loading-stages">
          {STAGES.map((label, i) => (
            <div
              key={i}
              className={`loading-stage ${i < stage ? 'done' : i === stage ? 'active' : 'pending'}`}
            >
              <span className="stage-dot">{i < stage ? '✓' : i === stage ? '◉' : '○'}</span>
              <span>{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
