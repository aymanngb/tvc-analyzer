import React, { useState } from 'react'

function parseMarkdownTable(md) {
  const lines = md.split('\n').filter((l) => l.trim().startsWith('|'))
  if (lines.length < 2) return null

  const headers = lines[0].split('|').map((h) => h.trim()).filter(Boolean)
  const rows = lines.slice(2).map((line) =>
    line.split('|').map((cell) => cell.trim()).filter(Boolean)
  ).filter((row) => row.length > 0)

  return { headers, rows }
}

function Cell({ content }) {
  return <td dangerouslySetInnerHTML={{ __html: content.replace(/🔴/g, '<span class="badge red">🔴</span>').replace(/🟡/g, '<span class="badge yellow">🟡</span>').replace(/🟢/g, '<span class="badge green">🟢</span>') }} />
}

export default function AnalysisTable({ title, content, badgeSummary }) {
  const [collapsed, setCollapsed] = useState(false)
  const table = parseMarkdownTable(content)

  return (
    <div className="table-section">
      <div className="table-header" onClick={() => setCollapsed(!collapsed)}>
        <span className="table-title">{title}</span>
        <div className="table-meta">
          {badgeSummary && <span className="badge-summary">{badgeSummary}</span>}
          <span className="collapse-icon">{collapsed ? '▶' : '▼'}</span>
        </div>
      </div>

      {!collapsed && (
        <div className="table-wrap">
          {table ? (
            <table className="breakdown-table">
              <thead>
                <tr>
                  {table.headers.map((h, i) => <th key={i}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row, ri) => (
                  <tr key={ri} className={ri % 2 === 0 ? 'row-even' : 'row-odd'}>
                    {row.map((cell, ci) => <Cell key={ci} content={cell} />)}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="table-raw">{content}</p>
          )}
        </div>
      )}
    </div>
  )
}
