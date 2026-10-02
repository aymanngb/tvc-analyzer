import React, { useRef, useState } from 'react'

const ACCEPTED = '.pdf,.docx,.jpg,.jpeg,.png'
const ACCEPTED_TYPES = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/jpeg', 'image/png']

const ACCEPTED_EXTS = ACCEPTED.split(',')

function isAccepted(file) {
  if (ACCEPTED_TYPES.includes(file.type)) return true
  const name = file.name.toLowerCase()
  return ACCEPTED_EXTS.some((ext) => name.endsWith(ext))
}

export default function DropZone({ onFile, uploadedFile, onClear, label = 'Drop your brief or treatment here' }) {
  const inputRef = useRef(null)
  const [dragging, setDragging] = useState(false)
  const [rejected, setRejected] = useState(null)
  const [opening, setOpening] = useState(false)

  function accept(file) {
    if (!file) return
    if (!isAccepted(file)) {
      setRejected(`${file.name} — unsupported file type`)
      return
    }
    setRejected(null)
    onFile(file)
  }

  async function browse() {
    if (opening) return
    if (!window.electronAPI?.chooseSourceFile) {
      inputRef.current?.click()
      return
    }
    setOpening(true)
    setRejected(null)
    try {
      const selected = await window.electronAPI.chooseSourceFile()
      if (selected) accept(new File([selected.bytes], selected.name, { type: selected.type }))
    } catch (err) {
      setRejected(err.message || 'Could not open the file. Choose a local copy.')
    } finally {
      setOpening(false)
    }
  }

  function handleDrop(e) {
    e.preventDefault()
    setDragging(false)
    accept(e.dataTransfer.files[0])
  }

  function handleChange(e) {
    accept(e.target.files[0])
    e.target.value = ''
  }

  if (uploadedFile) {
    return (
      <div className="dropzone dropzone--filled">
        <span className="file-icon">{uploadedFile.type.startsWith('image/') ? '🖼️' : uploadedFile.name.endsWith('.docx') ? '📄' : '📋'}</span>
        <div className="file-info">
          <span className="file-name">{uploadedFile.name}</span>
          <span className="file-size">{(uploadedFile.size / 1024).toFixed(0)} KB</span>
        </div>
        <button className="clear-btn" onClick={onClear}>✕</button>
      </div>
    )
  }

  return (
    <div
      className={`dropzone ${dragging ? 'dropzone--drag' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={browse}
    >
      <div className="dropzone-inner">
        <span className="upload-icon">📂</span>
        <p className="drop-label">{label}</p>
        <p className="drop-types">PDF · DOCX · JPG · PNG</p>
        {rejected && <p className="drop-rejected">⚠️ {rejected}</p>}
        <button className="browse-btn" disabled={opening} onClick={(e) => { e.stopPropagation(); browse() }}>
          {opening ? 'Opening file…' : 'Browse File'}
        </button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED}
        style={{ display: 'none' }}
        onChange={handleChange}
      />
    </div>
  )
}
