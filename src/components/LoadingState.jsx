import React, { useState, useEffect } from 'react'

const STAGES = [
  'Reading document...',
  'Analyzing requirements...',
  'Building breakdown...',
]

// While a large PDF is being shrunk, progress is real and shown as such.
function Optimizing({ label, done, total }) {
  const pct = total ? Math.round((done / total) * 100) : 0
  return (
    <div className="loading-optimizing">
      <div className="optimizing-label">{label}</div>
      <div className="optimizing-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
        <div className="optimizing-fill" style={{ transform: `scaleX(${pct / 100})` }} />
      </div>
      <div className="optimizing-meta">
        {total ? `Page ${done} of ${total}` : 'Opening file…'}
      </div>
    </div>
  )
}

export default function LoadingState({ progress }) {
  const [stage, setStage] = useState(0)

  useEffect(() => {
    if (progress) return
    const interval = setInterval(() => {
      setStage((s) => (s < STAGES.length - 1 ? s + 1 : s))
    }, 1800)
    return () => clearInterval(interval)
  }, [progress])

  return (
    <div className="loading-screen">
      <div className="loading-card">
        <div className="spinner" />
        {progress ? (
          <Optimizing {...progress} />
        ) : (
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
        )}
      </div>
    </div>
  )
}
