'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { FileText, AlertTriangle, Info, CheckCircle, ArrowLeft, Sparkles } from 'lucide-react'
import StepsBar from '../../components/StepsBar.jsx'

function formatMethod(method) {
  if (method === 'gemini-vision')      return 'Gemini Vision (AI)'
  if (method === 'pdf-parse')          return 'PDF text extraction'
  if (method === 'pdf-parse-repaired') return 'PDF (repaired xref)'
  if (method === 'pdfjs-dist')         return 'PDF (lenient parser)'
  if (method === 'pdf-ocr')            return 'PDF (rendered + OCR)'
  if (method === 'tesseract-ocr')      return 'OCR (image scan)'
  return method || 'Unknown'
}

export default function VerifyPage() {
  const router = useRouter()
  const [text,     setText]     = useState('')
  const [metadata, setMetadata] = useState(null)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState(null)
  const [ready,    setReady]    = useState(false)

  useEffect(() => {
    const raw = sessionStorage.getItem('mediinsight_extract')
    if (!raw) { router.replace('/upload'); return }
    try {
      const { extractedText, metadata } = JSON.parse(raw)
      setText(extractedText || '')
      setMetadata(metadata || {})
      setReady(true)
    } catch {
      router.replace('/upload')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])  // empty — run once on mount only; router is stable

  if (!ready) return null

  const charCount = text.length
  const lowConfidence = metadata?.confidence != null && metadata.confidence < 70

  const handleAnalyze = async () => {
    if (!text.trim() || charCount < 20) {
      setError('The text is too short to analyze. Please make sure the extracted content looks correct.')
      return
    }
    setLoading(true); setError(null)
    try {
      const res  = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportText: text }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Analysis failed.')

      sessionStorage.setItem('mediinsight_results', JSON.stringify({
        analysis: data.analysis,
        metadata,
      }))
      // Clear extract data since we no longer need it
      sessionStorage.removeItem('mediinsight_extract')
      router.push('/results')
    } catch (err) {
      setError(err.message || 'Analysis failed. Please check the server is running.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="page-container wide">
      <StepsBar current={1} />

      <div className="page-header">
        <h1>Verify extracted text</h1>
        <p>Review the text extracted from your report. You can edit it to fix any OCR errors before the AI analyzes it. Make sure values, units, and reference ranges look correct.</p>
      </div>

      {lowConfidence && (
        <div className="notice warning" style={{ marginBottom: 20 }} role="alert">
          <span className="notice-icon"><AlertTriangle size={16} /></span>
          <span><strong>Low OCR confidence ({metadata.confidence}%).</strong> Please review the text carefully and correct any mistakes before proceeding.</span>
        </div>
      )}

      {/* Warn when a PDF fallback parser was needed */}
      {(metadata?.method === 'pdf-parse-repaired' || metadata?.method === 'pdfjs-dist') && (
        <div className="notice warning" style={{ marginBottom: 20 }} role="note">
          <span className="notice-icon"><AlertTriangle size={16} /></span>
          <span>
            <strong>This PDF required a repair step before extraction{metadata.method === 'pdfjs-dist' ? ' (lenient parser used)' : ' (xref table rebuilt)'}.</strong>{' '}
            The file may have minor structural issues. Please review the extracted text carefully — some content may be missing or incorrectly formatted.
          </span>
        </div>
      )}

      <div className="verify-layout">
        <div>
          <div className="ocr-text-container">
            <div className="ocr-text-header">
              <div className="ocr-text-header-left">
                <FileText size={16} />
                Extracted Report Text
                <span className="ocr-badge">{formatMethod(metadata?.method)}</span>
              </div>
              <span style={{ fontSize: 12, color: 'var(--gray-400)' }}>Click to edit</span>
            </div>
            <textarea
              className="ocr-textarea"
              value={text}
              onChange={e => setText(e.target.value)}
              aria-label="Extracted report text — editable"
              spellCheck={false}
            />
            <div className="ocr-char-count" aria-live="polite">{charCount.toLocaleString()} characters</div>
          </div>

          <div className="notice info" style={{ marginTop: 14 }}>
            <span className="notice-icon"><Info size={15} /></span>
            <span style={{ fontSize: 13 }}>
              Common OCR issues: numbers like <code>0</code> vs <code>O</code>, units like <code>mg/dL</code> getting split, table columns merging.
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="meta-card">
            <div className="meta-card-header">File Details</div>
            <div className="meta-row"><span className="meta-label">Filename</span><span className="meta-value" style={{ fontSize: 12 }}>{metadata?.filename}</span></div>
            <div className="meta-row"><span className="meta-label">Size</span><span className="meta-value">{metadata?.sizeKB} KB</span></div>
            <div className="meta-row"><span className="meta-label">Method</span><span className="meta-value method">{formatMethod(metadata?.method)}</span></div>
            {metadata?.numPages && <div className="meta-row"><span className="meta-label">Pages</span><span className="meta-value">{metadata.numPages}</span></div>}
            {metadata?.confidence != null && (
              <div className="meta-row" style={{ flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                  <span className="meta-label">OCR Confidence</span>
                  <span className="meta-value">{metadata.confidence}%</span>
                </div>
                <div className="confidence-bar-wrap">
                  <div
                    className="confidence-bar"
                    style={{
                      width: `${metadata.confidence}%`,
                      background: metadata.confidence >= 80 ? 'var(--green-600)' : metadata.confidence >= 60 ? 'var(--amber-600)' : 'var(--red-500)',
                    }}
                    role="progressbar"
                    aria-valuenow={metadata.confidence}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="meta-card">
            <div className="meta-card-header">Before you continue</div>
            {['Numbers and decimal points look correct', 'Units (mg/dL, mmol/L, g/L, etc.) are intact', 'Reference ranges are readable', 'Test names are not garbled', 'No columns have merged together'].map((item, i) => (
              <div key={i} className="meta-row" style={{ gap: 10, alignItems: 'flex-start' }}>
                <CheckCircle size={14} color="var(--green-600)" style={{ flexShrink: 0, marginTop: 1 }} />
                <span style={{ fontSize: 13, color: 'var(--gray-600)' }}>{item}</span>
              </div>
            ))}
          </div>

          {error && (
            <div className="notice error" role="alert">
              <span className="notice-icon"><AlertTriangle size={15} /></span>
              <span>{error}</span>
            </div>
          )}

          <div className="verify-actions">
            <button className="btn btn-primary" onClick={handleAnalyze} disabled={loading || charCount < 20} aria-busy={loading}>
              {loading ? <><span className="spinner" aria-hidden="true" /> Analyzing…</> : <><Sparkles size={16} /> Analyze with AI</>}
            </button>
            <button className="btn btn-secondary" onClick={() => router.push('/upload')} disabled={loading}>
              <ArrowLeft size={15} /> Upload different file
            </button>
          </div>

          <p style={{ fontSize: 12, color: 'var(--gray-400)', lineHeight: 1.6 }}>
            The AI will explain each value in plain language. It will never diagnose a condition or recommend medication changes.
          </p>
        </div>
      </div>
    </div>
  )
}
