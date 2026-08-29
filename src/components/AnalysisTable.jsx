import React, { useState } from 'react'
import { parseMarkdownTable } from '../lib/mdTable'

const BADGE_CLASS = { '🔴': 'red', '🟡': 'yellow', '🟢': 'green' }

function Cell({ content }) {
  const parts = content.split(/(🔴|🟡|🟢)/)
  return (
    <td>
      {parts.map((part, i) =>
        BADGE_CLASS[part]
          ? <span key={i} className={`badge ${BADGE_CLASS[part]}`}>{part}</span>
          : part
      )}
    </td>
  )
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
                {table.rows.map((row, ri) => {
                  const isNewGroup = ri > 0 && row[0] && row[0] !== table.rows[ri - 1][0]
                  return (
                    <React.Fragment key={ri}>
                      {isNewGroup && (
                        <tr className="group-separator">
                          <td colSpan={table.headers.length} />
                        </tr>
                      )}
                      <tr className={ri % 2 === 0 ? 'row-even' : 'row-odd'}>
                        {row.map((cell, ci) => <Cell key={ci} content={cell} />)}
                      </tr>
                    </React.Fragment>
                  )
                })}
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
