import React, { useRef } from 'react'
import AnalysisTable from '../components/AnalysisTable'

function parseDocType(result) {
  const match = result.match(/## Document Type\s*\n([^\n]+)/)
  if (!match) return null
  const line = match[1].trim()
  if (line.toLowerCase().includes('hybrid')) return { label: 'Hybrid', color: '#22c55e' }
  if (line.toLowerCase().includes('treatment')) return { label: "Director's Treatment", color: '#a855f7' }
  return { label: 'Agency Brief', color: '#3b82f6' }
}

function parseSections(result) {
  const sections = []
  const regex = /## (Table \d+ — [^\n]+)\n([\s\S]*?)(?=\n## |$)/g
  let match
  while ((match = regex.exec(result)) !== null) {
    sections.push({ title: match[1].trim(), content: match[2].trim() })
  }
  return sections
}

function parseEPNote(result) {
  const match = result.match(/## EP Note\s*\n([^\n]+)/)
  return match ? match[1].trim() : null
}

function countComplexity(content) {
  const high = (content.match(/🔴/g) || []).length
  const med = (content.match(/🟡/g) || []).length
  const low = (content.match(/🟢/g) || []).length
  const parts = []
  if (high) parts.push(`${high} 🔴`)
  if (med) parts.push(`${med} 🟡`)
  if (low) parts.push(`${low} 🟢`)
  return parts.join('  ')
}

export default function ResultsScreen({ result, onNewBrief }) {
  const printRef = useRef(null)
  const docType = parseDocType(result)
  const sections = parseSections(result)
  const epNote = parseEPNote(result)

  async function handleExport() {
    await window.electronAPI.exportPDF()
  }

  return (
    <div className="results-screen">
      <div className="results-topbar">
        <button className="back-btn" onClick={onNewBrief}>← New Brief</button>
        <span className="results-title">Production Breakdown</span>
        <button className="export-btn" onClick={handleExport}>Export PDF</button>
      </div>

      <div className="results-body" ref={printRef} id="print-area">
        {docType && (
          <div className="doctype-badge" style={{ backgroundColor: docType.color + '22', borderColor: docType.color, color: docType.color }}>
            {docType.label}
          </div>
        )}

        {sections.map((section, i) => (
          <AnalysisTable
            key={i}
            title={section.title}
            content={section.content}
            badgeSummary={countComplexity(section.content)}
          />
        ))}

        {epNote && (
          <div className="ep-note">
            <span className="ep-label">EP Note</span>
            <p>{epNote}</p>
          </div>
        )}
      </div>
    </div>
  )
}
