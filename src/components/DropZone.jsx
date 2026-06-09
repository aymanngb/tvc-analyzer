import React, { useRef, useState } from 'react'

const ACCEPTED = '.pdf,.docx,.jpg,.jpeg,.png'
const ACCEPTED_TYPES = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/jpeg', 'image/png']

export default function DropZone({ onFile, uploadedFile, onClear }) {
  const inputRef = useRef(null)
  const [dragging, setDragging] = useState(false)

  function handleDrop(e) {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) onFile(file)
  }

  function handleChange(e) {
    const file = e.target.files[0]
    if (file) onFile(file)
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
      onClick={() => inputRef.current?.click()}
    >
      <div className="dropzone-inner">
        <span className="upload-icon">📂</span>
        <p className="drop-label">Drop your brief or treatment here</p>
        <p className="drop-types">PDF · DOCX · JPG · PNG</p>
        <button className="browse-btn" onClick={(e) => { e.stopPropagation(); inputRef.current?.click() }}>
          Browse File
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
