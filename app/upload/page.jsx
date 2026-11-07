'use client'
import { useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useDropzone } from 'react-dropzone'
import { UploadCloud, FileText, Image as ImageIcon, X, AlertTriangle, Info } from 'lucide-react'
import StepsBar from '../../components/StepsBar.jsx'

const ACCEPTED_MIME = {
  'application/pdf': ['.pdf'],
  'image/jpeg':      ['.jpg', '.jpeg'],
  'image/png':       ['.png'],
  'image/tiff':      ['.tiff', '.tif'],
  'image/bmp':       ['.bmp'],
  'image/webp':      ['.webp'],
}
const MAX_SIZE_MB = 20
const MAX_BYTES   = MAX_SIZE_MB * 1024 * 1024

function formatBytes(bytes) {
  if (bytes < 1024)        return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function FileIcon({ mime }) {
  if (mime === 'application/pdf') return <FileText size={22} />
  return <ImageIcon size={22} />
}

export default function UploadPage() {
  const router = useRouter()
  const [file,     setFile]     = useState(null)
  const [error,    setError]    = useState(null)
  const [loading,  setLoading]  = useState(false)
  const [progress, setProgress] = useState(0)
  // Ref-based in-flight guard — set synchronously before any await so a second
  // click or React re-render can never fire a duplicate /api/extract call.
  const inFlight = useRef(false)

  const onDrop = useCallback((accepted, rejected) => {
    setError(null)
    if (rejected.length > 0) {
      const reason = rejected[0].errors[0]
      if (reason.code === 'file-too-large')       setError(`File too large. Maximum is ${MAX_SIZE_MB} MB.`)
      else if (reason.code === 'file-invalid-type') setError('Unsupported file type. Please upload a PDF or image (JPG, PNG, TIFF, BMP, WEBP).')
      else setError(reason.message)
      return
    }
    if (accepted.length > 0) setFile(accepted[0])
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED_MIME,
    maxSize: MAX_BYTES,
    maxFiles: 1,
    multiple: false,
  })

  const removeFile = (e) => { e.stopPropagation(); setFile(null); setError(null) }

  const handleUpload = async () => {
    if (!file) return
    // Synchronous guard — prevents double-click or React Strict Mode
    // double-invocation from firing two concurrent /api/extract requests.
    if (inFlight.current) return
    inFlight.current = true
    setLoading(true); setError(null); setProgress(0)

    const formData = new FormData()
    formData.append('report', file)

    try {
      // Use XMLHttpRequest for upload progress tracking
      const result = await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open('POST', '/api/extract')
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100))
        }
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(JSON.parse(xhr.responseText))
          } else {
            try { reject(new Error(JSON.parse(xhr.responseText).error)) }
            catch { reject(new Error('Upload failed.')) }
          }
        }
        xhr.onerror = () => reject(new Error('Network error.'))
        xhr.send(formData)
      })

      // Pass data to verify page via sessionStorage
      sessionStorage.setItem('mediinsight_extract', JSON.stringify({
        extractedText: result.extractedText,
        metadata:      result.metadata,
      }))
      router.push('/verify')
    } catch (err) {
      setError(err.message || 'Upload failed. Please try again.')
    } finally {
      setLoading(false)
      inFlight.current = false
    }
  }

  const dropzoneClass = [
    'dropzone-area',
    isDragActive ? 'dragover' : '',
    file ? 'has-file' : '',
  ].filter(Boolean).join(' ')

  return (
    <div className="page-container">
      <StepsBar current={0} />

      <div className="page-header">
        <h1>Upload your report</h1>
        <p>Upload a medical report as a PDF or image. We'll extract all the text — including tables, values, and reference ranges — and show it to you before any analysis.</p>
      </div>

      <div {...getRootProps()} className={dropzoneClass} role="button" tabIndex={0} aria-label="File upload area">
        <input {...getInputProps()} aria-label="Choose file" />
        {!file ? (
          <>
            <div className="dropzone-icon" aria-hidden="true"><UploadCloud size={32} /></div>
            <div className="dropzone-title">{isDragActive ? 'Drop the file here' : 'Drag & drop your report'}</div>
            <div className="dropzone-sub">
              or <span>browse to upload</span><br />
              <span style={{ color: 'var(--gray-400)', fontSize: 13 }}>PDF, JPG, PNG, TIFF, BMP, WEBP — up to {MAX_SIZE_MB} MB</span>
            </div>
          </>
        ) : (
          <div style={{ width: '100%', textAlign: 'left' }}>
            <div style={{ textAlign: 'center', marginBottom: 16, color: 'var(--green-600)', fontSize: 14, fontWeight: 600 }}>File ready to upload</div>
            <div className="file-preview">
              <span className="file-preview-icon"><FileIcon mime={file.type} /></span>
              <div className="file-preview-info">
                <div className="file-preview-name">{file.name}</div>
                <div className="file-preview-size">{formatBytes(file.size)}</div>
              </div>
              <button className="file-preview-remove" onClick={removeFile} aria-label="Remove file"><X size={16} /></button>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="notice error" style={{ marginTop: 16 }} role="alert">
          <span className="notice-icon"><AlertTriangle size={16} /></span>
          <span>{error}</span>
        </div>
      )}

      {loading && (
        <div style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--gray-500)', marginBottom: 6 }}>
            <span>{progress < 100 ? 'Uploading…' : 'Extracting text (OCR may take up to 30 seconds for images)…'}</span>
            <span>{progress}%</span>
          </div>
          <div style={{ background: 'var(--gray-200)', borderRadius: 999, height: 6 }}>
            <div style={{ height: 6, borderRadius: 999, background: 'var(--blue-600)', width: `${progress}%`, transition: 'width .3s' }} />
          </div>
        </div>
      )}

      <div className="notice info" style={{ marginTop: 20 }}>
        <span className="notice-icon"><Info size={16} /></span>
        <span>Your file is deleted from the server immediately after text extraction. Nothing is stored permanently.</span>
      </div>

      <div className="upload-actions">
        <button className="btn btn-primary btn-lg" onClick={handleUpload} disabled={!file || loading} aria-busy={loading}>
          {loading ? <><span className="spinner" aria-hidden="true" /> Extracting text…</> : <><UploadCloud size={18} /> Extract Text</>}
        </button>
      </div>
    </div>
  )
}
