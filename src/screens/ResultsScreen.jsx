import React from 'react'
import AnalysisTable from '../components/AnalysisTable'
import { parseMarkdownTable, escapeHtml } from '../lib/mdTable'


function parseProjectName(result) {
  const match = result.match(/## Project Name\s*\n([^\n]+)/)
  return match ? match[1].trim() : ''
}

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
  // Keep the production tables immediately after the snapshot, including
  // reports generated before this ordering change. UI and exports share this.
  const first = ['Locations Breakdown', 'Cast Breakdown', 'Wardrobe Breakdown']
  const rank = section => {
    const name = section.title.replace(/^Table\s*\d+\s*[—-]\s*/, '')
    const index = first.indexOf(name)
    return index < 0 ? first.length : index
  }
  return sections.sort((a, b) => rank(a) - rank(b))
}

function parseEPNote(result) {
  const match = result.match(/## EP Note\s*\n([^\n]+)/)
  return match ? match[1].trim() : null
}

function parseAtAGlance(result) {
  const match = result.match(/## At a Glance\s*\n([\s\S]*?)(?=\n## |$)/)
  return match ? match[1].trim() : null
}

function parseStory(result) {
  const match = result.match(/## Story\s*\n([\s\S]*?)(?=\n## |$)/)
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

function mdTableToHtml(md) {
  const table = parseMarkdownTable(md)
  if (!table) return `<p>${escapeHtml(md)}</p>`

  const ths = table.headers.map(h => `<th>${escapeHtml(h)}</th>`).join('')
  const trs = table.rows.map(row =>
    `<tr>${row.map(c => `<td>${escapeHtml(c)}</td>`).join('')}</tr>`
  ).join('')

  return `<table><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table>`
}

function buildPrintHTML(result, meta = {}) {
  const docType = parseDocType(result)
  const sections = parseSections(result)
  const epNote = parseEPNote(result)
  const projectName = meta.name || 'Production Breakdown'
  const projectDate = meta.date || ''

  const badge = docType
    ? `<div class="badge" style="border-color:${docType.color};color:${docType.color}">${escapeHtml(docType.label)}</div>`
    : ''

  const tables = sections.map(s => `
    <div class="section">
      <div class="section-title">${escapeHtml(s.title.replace(/^Table\s*\d+\s*[—-]\s*/, ''))}</div>
      ${mdTableToHtml(s.content)}
    </div>
  `).join('')

  const ep = epNote ? `<div class="ep-note"><strong>EP Note:</strong> ${escapeHtml(epNote)}</div>` : ''

  const glanceMd = parseAtAGlance(result)
  const glance = glanceMd
    ? `<div class="glance"><div class="glance-title">Production Snapshot</div>${mdTableToHtml(glanceMd)}</div>`
    : ''

  const storyMd = parseStory(result)
  const story = storyMd
    ? `<div class="story"><div class="story-title">Story</div>${mdTableToHtml(storyMd)}</div>`
    : ''


  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, Arial, sans-serif; font-size: 10px; color: #111; padding: 16px; padding-bottom: 56px; background: #fff; }

  /* ── Header ── */
  .doc-header {
    display: flex; justify-content: space-between; align-items: center;
    margin-bottom: 16px; padding-bottom: 12px; border-bottom: 3px solid #99CC00;
  }
  .doc-header-left { display: flex; flex-direction: column; gap: 4px; }
  .doc-title { font-size: 15px; font-weight: 800; color: #111; letter-spacing: -0.3px; }
  .doc-subtitle { font-size: 8px; color: #888; text-transform: uppercase; letter-spacing: 0.8px; }
  .doc-date { font-size: 9px; color: #666; margin-top: 2px; }
  .doc-logo { height: 40px; width: auto; object-fit: contain; }

  /* ── Footer (fixed, every page) ── */
  @page { margin: 12mm; }
  footer {
    position: fixed; bottom: 0; left: 0; right: 0;
    padding: 4px 14px; background: #fff; border-top: 2px solid #99CC00;
    display: flex; justify-content: space-between; align-items: center;
    font-size: 7.5px; color: #666;
  }
  footer img { height: 20px; width: auto; }

  /* ── Badge ── */
  .badge { display: inline-block; border: 1.5px solid; border-radius: 20px; padding: 3px 10px; font-size: 10px; font-weight: 700; margin-bottom: 14px; }

  /* ── Tables ── */
  .section { margin-bottom: 16px; border: 1px solid #ccc; border-radius: 6px; overflow: visible; break-inside: avoid; page-break-inside: avoid; }
  .section-title { background: #e8e8e8; padding: 6px 12px; font-size: 10.5px; font-weight: 700; border-bottom: 1px solid #ccc; break-after: avoid; page-break-after: avoid; letter-spacing: 0.1px; }
  table { width: 100%; border-collapse: collapse; table-layout: auto; border-spacing: 0; }
  thead { display: table-header-group; }
  th { background: #d8d8d8; text-align: left; padding: 4px 8px; font-size: 8.5px; text-transform: uppercase; letter-spacing: 0.4px; border: 1px solid #bbb; white-space: nowrap; color: #333; }
  td { padding: 4px 8px; font-size: 9.5px; border: 1px solid #ddd; vertical-align: top; word-break: break-word; line-height: 1.4; }
  tr { break-inside: avoid; page-break-inside: avoid; }
  tbody tr { break-inside: avoid; page-break-inside: avoid; }
  tr:nth-child(even) td { background: #f6f6f6; }
  /* Force new page before a section if it would otherwise be orphaned short at bottom */
  .section + .section { break-before: auto; }

  /* ── Abbreviation Key ── */
  .abbrev-section { margin-top: 20px; border: 1px solid #99CC00; border-radius: 6px; overflow: hidden; break-inside: avoid; page-break-inside: avoid; }
  .abbrev-title { background: #99CC00; color: #fff; padding: 5px 12px; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.6px; }
  .abbrev-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0; }
  .abbrev-grid table { border: none; }
  .abbrev-grid td { border: none; border-bottom: 1px solid #eee; font-size: 8.5px; padding: 3px 8px; }
  .abbrev-grid td.abbr-key { font-weight: 700; color: #444; width: 36px; white-space: nowrap; }

  /* ── Story ── */
  .story { margin-bottom: 12px; border: 1px solid #bbb; border-radius: 6px; overflow: hidden; break-inside: avoid; page-break-inside: avoid; }
  .story-title { background: #333; color: #fff; padding: 5px 12px; font-size: 9.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.6px; }
  .story table { border: none; }
  .story thead { display: none; }
  .story td { border: none; border-bottom: 1px solid #eee; font-size: 10px; padding: 5px 12px; }
  .story td:first-child { width: 22px; font-weight: 700; color: #888; }

  /* ── At a Glance ── */
  .glance { margin-bottom: 16px; border: 1.5px solid #99CC00; border-radius: 6px; overflow: hidden; break-inside: avoid; page-break-inside: avoid; }
  .glance-title { background: #99CC00; color: #fff; padding: 5px 12px; font-size: 9.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.6px; }
  .glance table { border: none; }
  .glance thead { display: none; }
  .glance td { border: none; border-bottom: 1px solid #eee; font-size: 10px; padding: 5px 12px; }
  .glance tr:nth-child(even) td { background: #fafff0; }
  .glance td:first-child { font-weight: 700; color: #444; width: 110px; white-space: nowrap; }

  /* ── EP Note ── */
  .ep-note { margin-top: 14px; background: #fffbea; border: 1px solid #e5c000; border-radius: 6px; padding: 8px 14px; font-size: 9.5px; line-height: 1.6; }
</style>
</head>
<body>

<div class="doc-header">
  <div class="doc-header-left">
    <div class="doc-title">${escapeHtml(projectName)}</div>
    <div class="doc-subtitle">Production Breakdown</div>
    <div class="doc-date">${escapeHtml(projectDate)}</div>
  </div>
  <img class="doc-logo" src="__LOGO_SRC__" alt="SilverGreen Film Productions" />
</div>

${badge}
${story}
${glance}
${tables}
${ep}


<footer>
  <span>${escapeHtml(projectName)} &nbsp;·&nbsp; Production Breakdown &nbsp;·&nbsp; ${escapeHtml(projectDate)}</span>
  <img src="__LOGO_SRC__" alt="SilverGreen Film Productions" />
</footer>
</body>
</html>`
}

function buildSheets(result) {
  const sheets = []

  const storyMd = parseStory(result)
  const story = storyMd ? parseMarkdownTable(storyMd) : null
  if (story) sheets.push({ name: 'Story', headers: story.headers, rows: story.rows })

  const glanceMd = parseAtAGlance(result)
  const glance = glanceMd ? parseMarkdownTable(glanceMd) : null
  if (glance) {
    const rows = [...glance.rows]
    const epNote = parseEPNote(result)
    if (epNote) rows.push(['EP Note', epNote])
    sheets.push({ name: 'At a Glance', headers: glance.headers, rows })
  }

  parseSections(result).forEach((section) => {
    const table = parseMarkdownTable(section.content)
    if (table) sheets.push({ name: section.title, headers: table.headers, rows: table.rows })
  })

  return sheets
}

function slug(title) {
  return 'sec-' + title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export default function ResultsScreen({ result, projectMeta = {}, onNewBrief }) {
  const extractedName = parseProjectName(result)
  const projectName = extractedName || projectMeta.name || 'Production Breakdown'
  const projectDate = projectMeta.date || ''
  const docType = parseDocType(result)
  const sections = parseSections(result)
  const epNote = parseEPNote(result)
  const glance = parseMarkdownTable(parseAtAGlance(result) || '')
  const story = parseMarkdownTable(parseStory(result) || '')

  const nav = [
    ...(story ? [{ id: 'sec-story', label: 'Story' }] : []),
    ...(glance ? [{ id: 'sec-glance', label: 'Production Snapshot' }] : []),
    // Rail shows the table's name, not its number: "Props & Hero Items", not "Table 3".
    ...sections.map((s) => ({ id: slug(s.title), label: s.title.replace(/^Table\s*\d+\s*[—-]\s*/, ''), full: s.title })),
    ...(epNote ? [{ id: 'sec-ep', label: 'EP Note' }] : []),
  ]

  const [active, setActive] = React.useState(nav[0]?.id)
  const scrollRef = React.useRef(null)

  // Highlight the last section whose top has passed the container top. Checked
  // directly against layout rather than via IntersectionObserver, which misses
  // the end of the list once nothing intersects the top band.
  React.useEffect(() => {
    const root = scrollRef.current
    if (!root) return
    let frame = 0

    function update() {
      frame = 0
      const rootTop = root.getBoundingClientRect().top
      let current = nav[0]?.id
      for (const { id } of nav) {
        const el = document.getElementById(id)
        if (el && el.getBoundingClientRect().top - rootTop <= 80) current = id
      }
      if (root.scrollTop >= root.scrollHeight - root.clientHeight - 2) {
        current = nav[nav.length - 1]?.id     // bottom of scroll: last section wins
      }
      setActive(current)
    }

    function onScroll() { if (!frame) frame = requestAnimationFrame(update) }
    root.addEventListener('scroll', onScroll, { passive: true })
    update()
    return () => { root.removeEventListener('scroll', onScroll); if (frame) cancelAnimationFrame(frame) }
  }, [result])

  function jumpTo(id) {
    const el = document.getElementById(id)
    if (!el) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
  }

  async function handleExport() {
    const html = buildPrintHTML(result, { name: projectName, date: projectDate })
    await window.electronAPI.exportPDF(html)
  }

  async function handleExportExcel() {
    const sheets = buildSheets(result)
    if (!sheets.length) return
    await window.electronAPI.exportXLSX({ projectName, projectDate, sheets })
  }

  return (
    <div className="results-screen">
      <div className="results-topbar">
        <button className="back-btn" onClick={onNewBrief}>← New Brief</button>
        <div className="results-title-block">
          <img src="./logo.png" alt="SilverGreen" className="topbar-logo" />
          <div>
            <span className="results-title">{projectName}</span>
            {projectDate && <span className="results-date">{projectDate}</span>}
          </div>
        </div>
        <div className="export-actions">
          <button className="export-btn export-btn--alt" onClick={handleExportExcel}>Export Excel</button>
          <button className="export-btn" onClick={handleExport}>Export PDF</button>
        </div>
      </div>

      <div className="results-layout">
        <nav className="results-rail" aria-label="Sections">
          {docType && (
            <div className="rail-doctype" style={{ color: docType.color, borderColor: docType.color + '55' }}>
              {docType.label}
            </div>
          )}
          {nav.map(({ id, label, full }) => (
            <button
              key={id}
              className={`rail-item ${active === id ? 'rail-item--on' : ''}`}
              onClick={() => jumpTo(id)}
              title={full || label}
            >
              {label}
            </button>
          ))}
        </nav>

        <div className="results-body" ref={scrollRef}>
          {story && (
            <section id="sec-story" className="story-card">
              <div className="card-title">Story</div>
              <ol className="story-beats">
                {story.rows.map((row, i) => (
                  <li key={i}><span className="beat-t">{row[1]}</span></li>
                ))}
              </ol>
            </section>
          )}

          {glance && (
            <section id="sec-glance" className="glance-card">
              <div className="glance-card-title">Production Snapshot</div>
              <table className="glance-table">
                <tbody>
                  {glance.rows.map((row, i) => (
                    <tr key={i}>
                      <td className="glance-item">{row[0]}</td>
                      <td className="glance-detail">{row[1]}</td>
                      {glance.headers.length > 2 && <td>{row[2]}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {sections.map((section, i) => (
            <div id={slug(section.title)} key={i}>
              <AnalysisTable
                title={section.title.replace(/^Table\s*\d+\s*[—-]\s*/, '')}
                content={section.content}
                badgeSummary={countComplexity(section.content)}
              />
            </div>
          ))}

          {epNote && (
            <section id="sec-ep" className="ep-note">
              <span className="ep-label">EP Note</span>
              <p>{epNote}</p>
            </section>
          )}


        </div>
      </div>
    </div>
  )
}
