'use client'
import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  AlertTriangle, UploadCloud, Info, Calendar, User, FlaskConical,
  ChevronDown, ChevronUp, MessageCircle, CheckCircle, XCircle,
  ArrowRight, Microscope, Salad, Dumbbell, Moon, ShieldCheck,
  Pill, Stethoscope, Clock, MessageSquare, TrendingUp, History,
  Download, Mail, Send
} from 'lucide-react'
import StepsBar from '../../components/StepsBar.jsx'
import ReportChat from '../../components/ReportChat.jsx'
import BiomarkerTrendChart from '../../components/BiomarkerTrendChart.jsx'
import { saveReport, loadReports, clearReports } from '../../utils/trendStore.js'

// ── Status badge ──────────────────────────────────────────────
const STATUS_META = {
  normal:        { label: 'Normal',    cls: 'status-normal' },
  low:           { label: '▼ Low',     cls: 'status-low' },
  high:          { label: '▲ High',    cls: 'status-high' },
  borderline:    { label: '~ Border',  cls: 'status-borderline' },
  not_available: { label: 'N/A',       cls: 'status-not_available' },
}
function StatusBadge({ status }) {
  const m = STATUS_META[status] || STATUS_META.not_available
  return <span className={`status-badge ${m.cls}`}>{m.label}</span>
}

// ── Value gauge bar ───────────────────────────────────────────
function ValueGauge({ measuredValue, referenceRange, status }) {
  const val = parseFloat(String(measuredValue))
  if (isNaN(val) || !referenceRange) return null
  const clean = referenceRange.replace(/\s/g, '')
  const m = clean.match(/^(-?[\d.]+)[–—\-](-?[\d.]+)$/)
  if (!m) return null
  const lo = parseFloat(m[1]); const hi = parseFloat(m[2])
  if (isNaN(lo) || isNaN(hi) || lo >= hi) return null
  const span = hi - lo; const padded = span * 0.5
  const scaleMin = lo - padded; const scaleMax = hi + padded; const scaleSpan = scaleMax - scaleMin
  const pct = Math.min(100, Math.max(0, ((val - scaleMin) / scaleSpan) * 100))
  const normalLeft = ((lo - scaleMin) / scaleSpan) * 100
  const normalWidth = (span / scaleSpan) * 100
  const trackColor = { high: 'var(--red-500)', low: 'var(--blue-500)', borderline: 'var(--amber-500)', normal: 'var(--green-600)', not_available: 'var(--gray-400)' }[status] || 'var(--gray-400)'
  return (
    <div className="value-gauge" title={`${val} (ref: ${referenceRange})`} aria-hidden="true">
      <div className="value-gauge-normal-zone" style={{ left: `${normalLeft}%`, width: `${normalWidth}%` }} />
      <div className="value-gauge-marker" style={{ left: `${pct}%`, background: trackColor }} />
    </div>
  )
}

// ── Expandable biomarker row ───────────────────────────────────
function BiomarkerRow({ b, index }) {
  const [open, setOpen] = useState(false)
  const statusColors = { high: 'var(--red-600)', low: 'var(--blue-600)', borderline: 'var(--amber-600)', normal: 'var(--green-600)', not_available: 'var(--gray-400)' }
  const valueColor = statusColors[b.status] || 'var(--gray-700)'
  return (
    <>
      <tr className={`biomarker-row${b.isAbnormal ? ' abnormal' : ''}`} onClick={() => setOpen(o => !o)} aria-expanded={open} tabIndex={0} onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && setOpen(o => !o)} style={{ cursor: 'pointer' }} title="Click to see explanation">
        <td className="td-num">{index + 1}</td>
        <td className="td-test">
          <span className="test-name">{b.test}</span>
          {b.abbreviation && <span className="test-abbr">{b.abbreviation}</span>}
        </td>
        <td className="td-value">
          <span className="value-text" style={{ color: valueColor, fontWeight: 700 }}>{b.measuredValue ?? '—'}</span>
          {b.unit && b.measuredValue && !String(b.measuredValue).includes(b.unit) && <span className="value-unit"> {b.unit}</span>}
          <ValueGauge measuredValue={b.measuredValue} referenceRange={b.referenceRange} status={b.status} />
        </td>
        <td className="td-unit">{b.unit ?? '—'}</td>
        <td className="td-ref">{b.referenceRange ?? '—'}</td>
        <td className="td-status"><StatusBadge status={b.status} /></td>
        <td className="td-expand" aria-hidden="true">{open ? <ChevronUp size={14} color="var(--gray-400)" /> : <ChevronDown size={14} color="var(--gray-400)" />}</td>
      </tr>
      {open && (
        <tr className="biomarker-detail-row">
          <td />
          <td colSpan={6}>
            <div className="biomarker-detail">
              {(b.explanation || b.plainExplanation) && (
                <div className="detail-explanation">
                  <span className="detail-label">Plain-language explanation</span>
                  <p className="detail-explanation-text">{b.explanation || b.plainExplanation}</p>
                </div>
              )}
              {b.isAbnormal && b.abnormalDetail && (
                <div className="abnormal-detail-block" role="note">
                  <div className="abnormal-detail-header">
                    <AlertTriangle size={13} />
                    General information about this abnormal result
                    <span className="abnormal-detail-tag">Not a diagnosis</span>
                  </div>
                  {b.abnormalDetail.possibleCauses && <div className="abnormal-detail-section"><span className="abnormal-detail-label">Possible general causes</span><p className="abnormal-detail-text">{b.abnormalDetail.possibleCauses}</p></div>}
                  {b.abnormalDetail.possibleSymptoms && <div className="abnormal-detail-section"><span className="abnormal-detail-label">Possible associated symptoms</span><p className="abnormal-detail-text">{b.abnormalDetail.possibleSymptoms}</p></div>}
                  {b.abnormalDetail.generalHealthRisks && <div className="abnormal-detail-section"><span className="abnormal-detail-label">General health consideration</span><p className="abnormal-detail-text">{b.abnormalDetail.generalHealthRisks}</p></div>}
                  <p className="abnormal-detail-closing">{b.abnormalDetail.closingLine || 'This is not a diagnosis — please confirm with a doctor.'}</p>
                </div>
              )}
              {b.noteForDoctor && (
                <div className="detail-section detail-doctor">
                  <span className="detail-label"><MessageCircle size={11} style={{ marginRight: 4 }} />Ask your doctor</span>
                  <span className="detail-text">{b.noteForDoctor}</span>
                </div>
              )}
              <BiomarkerTrendChart test={b.test} abbreviation={b.abbreviation} referenceRange={b.referenceRange} unit={b.unit} />
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

// ── Medicine card ──────────────────────────────────────────────
function MedicineCard({ med }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="medicine-card">
      <button className="medicine-card-header" onClick={() => setOpen(o => !o)} aria-expanded={open}>
        <div className="medicine-name-row">
          <Pill size={14} />
          <span className="medicine-generic-name">{med.genericName}</span>
          <span className="medicine-class-pill">{med.medicineClass}</span>
        </div>
        {open ? <ChevronUp size={14} color="var(--gray-400)" /> : <ChevronDown size={14} color="var(--gray-400)" />}
      </button>
      {open && (
        <div className="medicine-card-body">
          {med.commonPurpose && <div className="medicine-section"><span className="medicine-section-label">Common purpose</span><p className="medicine-section-text">{med.commonPurpose}</p></div>}
          {med.howItWorks && <div className="medicine-section"><span className="medicine-section-label">How it generally works</span><p className="medicine-section-text">{med.howItWorks}</p></div>}
          {med.commonSideEffects?.length > 0 && (
            <div className="medicine-section">
              <span className="medicine-section-label">Commonly known side effects</span>
              <ul className="medicine-list">{med.commonSideEffects.map((s, i) => <li key={i} className="medicine-list-item"><span className="medicine-dot">•</span><span>{s}</span></li>)}</ul>
            </div>
          )}
          {med.whoShouldAvoid?.length > 0 && (
            <div className="medicine-section">
              <span className="medicine-section-label">Who should generally use with caution</span>
              <ul className="medicine-list">{med.whoShouldAvoid.map((w, i) => <li key={i} className="medicine-list-item medicine-caution"><AlertTriangle size={11} style={{ flexShrink: 0, marginTop: 2 }} /><span>{w}</span></li>)}</ul>
            </div>
          )}
          <p className="medicine-disclaimer">{med.medicineDisclaimer || 'This is general education only — not a prescription.'}</p>
        </div>
      )}
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────
export default function ResultsPage() {
  const router = useRouter()
  const [analysis,     setAnalysis]     = useState(null)
  const [metadata,     setMetadata]     = useState(null)
  const [showHistory,  setShowHistory]  = useState(false)
  const [historyItems, setHistoryItems] = useState([])
  const [pdfLoading,   setPdfLoading]   = useState(false)
  const [pdfError,     setPdfError]     = useState(null)
  const [email,        setEmail]        = useState('')
  const [emailLoading, setEmailLoading] = useState(false)
  const [emailStatus,  setEmailStatus]  = useState(null)  // { type: 'success'|'error', msg }

  useEffect(() => {
    const raw = sessionStorage.getItem('mediinsight_results')
    if (!raw) { router.replace('/upload'); return }
    try {
      const { analysis, metadata } = JSON.parse(raw)
      setAnalysis(analysis)
      setMetadata(metadata)
      saveReport(analysis)
    } catch {
      router.replace('/upload')
    }
  }, [])  // empty — run once on mount only; router is stable

  useEffect(() => {
    if (showHistory) setHistoryItems(loadReports().reverse())
  }, [showHistory])

  // Request the server-rendered PDF and trigger a browser download.
  async function handleDownloadPdf() {
    if (pdfLoading) return
    setPdfLoading(true)
    setPdfError(null)
    try {
      const res = await fetch('/api/report-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ analysis, metadata }),
      })
      if (!res.ok) {
        let msg = 'PDF generation failed.'
        try { msg = (await res.json()).error || msg } catch {}
        throw new Error(msg)
      }
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      const safeName = (analysis.reportType || 'report').replace(/[^a-z0-9]+/gi, '-').toLowerCase()
      a.download = `mediinsight-${safeName}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      setPdfError(err.message || 'Could not generate the PDF.')
    } finally {
      setPdfLoading(false)
    }
  }

  // Email the PDF report to the entered address via Resend.
  async function handleSendEmail(e) {
    e?.preventDefault?.()
    if (emailLoading) return

    const addr = email.trim()
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRe.test(addr)) {
      setEmailStatus({ type: 'error', msg: 'Please enter a valid email address.' })
      return
    }

    setEmailLoading(true)
    setEmailStatus(null)
    try {
      const res = await fetch('/api/send-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ analysis, metadata, email: addr }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to send email.')
      setEmailStatus({ type: 'success', msg: `Report sent to ${addr}. Check your inbox (and spam folder).` })
      setEmail('')
    } catch (err) {
      setEmailStatus({ type: 'error', msg: err.message || 'Could not send the email.' })
    } finally {
      setEmailLoading(false)
    }
  }

  if (!analysis) return null

  const biomarkers = analysis.biomarkers || analysis.findings || []
  const abnormal   = biomarkers.filter(b => b.isAbnormal)
  const normal     = biomarkers.filter(b => !b.isAbnormal && b.status !== 'not_available')
  const naItems    = biomarkers.filter(b => b.status === 'not_available')
  const os         = analysis.overallSummary
  const interps    = Array.isArray(analysis.possibleInterpretations) ? analysis.possibleInterpretations : []

  return (
    <div className="page-container wide">
      <StepsBar current={2} />

      {/* Report header */}
      <div className="report-header-card">
        <div className="report-header-top">
          <div className="report-type-badge"><FlaskConical size={15} />{analysis.reportType || 'Lab Report'}</div>
          <div className="report-header-meta">
            {analysis.testDate && <span className="report-meta-item"><Calendar size={13} />{analysis.testDate}</span>}
            {(analysis.patientInfo?.name || analysis.patientInfo?.age || analysis.patientInfo?.gender) && (
              <span className="report-meta-item"><User size={13} />{[analysis.patientInfo.name, analysis.patientInfo.age, analysis.patientInfo.gender].filter(Boolean).join(' · ')}</span>
            )}
            {metadata?.filename && <span className="report-meta-item" style={{ color: 'var(--gray-400)' }}>{metadata.filename}</span>}
          </div>
        </div>
        <div className="report-stats-row">
          <div className="report-stat"><span className="report-stat-num">{biomarkers.length}</span><span className="report-stat-label">Total tests</span></div>
          <div className="report-stat abnormal-stat"><span className="report-stat-num">{abnormal.length}</span><span className="report-stat-label">Abnormal</span></div>
          <div className="report-stat"><span className="report-stat-num">{normal.length}</span><span className="report-stat-label">Normal</span></div>
          {naItems.length > 0 && <div className="report-stat"><span className="report-stat-num">{naItems.length}</span><span className="report-stat-label">No ref. range</span></div>}
        </div>
        {(os?.healthImpression || analysis.summary) && <p className="report-summary-text">{os?.healthImpression || analysis.summary}</p>}
      </div>

      {/* Disclaimer */}
      <div className="results-disclaimer" role="note"><AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 2 }} /><span>{analysis.disclaimer}</span></div>

      {/* Overall Summary */}
      {os && (os.positiveFindings?.length > 0 || os.concerningFindings?.length > 0 || os.nextSteps?.length > 0) && (
        <section className="overall-summary-section" aria-labelledby="overall-heading">
          <h2 id="overall-heading" className="section-heading"><Info size={16} />Overall Summary</h2>
          <div className="overall-summary-grid">
            {os.positiveFindings?.length > 0 && (
              <div className="overall-card overall-card-good">
                <div className="overall-card-header"><CheckCircle size={15} />Looking good</div>
                <ul className="overall-list">{os.positiveFindings.map((item, i) => <li key={i} className="overall-list-item overall-list-item-good"><CheckCircle size={13} style={{ flexShrink: 0, marginTop: 2 }} /><span>{item}</span></li>)}</ul>
              </div>
            )}
            {os.concerningFindings?.length > 0 && (
              <div className="overall-card overall-card-concern">
                <div className="overall-card-header"><AlertTriangle size={15} />Worth discussing with your doctor</div>
                <ul className="overall-list">{os.concerningFindings.map((item, i) => <li key={i} className="overall-list-item overall-list-item-concern"><XCircle size={13} style={{ flexShrink: 0, marginTop: 2 }} /><span>{item}</span></li>)}</ul>
              </div>
            )}
          </div>
          {os.nextSteps?.length > 0 && (
            <div className="next-steps-card">
              <div className="next-steps-header"><ArrowRight size={15} />Recommended next steps</div>
              <ol className="next-steps-list">{os.nextSteps.map((step, i) => <li key={i} className="next-steps-item"><span className="next-steps-num">{i + 1}</span><span>{step}</span></li>)}</ol>
            </div>
          )}
        </section>
      )}

      {/* Biomarker table */}
      {biomarkers.length > 0 ? (
        <section aria-labelledby="table-heading" style={{ marginBottom: 32 }}>
          <div className="table-section-header">
            <h2 id="table-heading" className="section-heading" style={{ marginBottom: 4 }}>
              Test Results
              {abnormal.length > 0 && <span className="abnormal-count-badge">{abnormal.length} abnormal</span>}
            </h2>
            <p className="table-hint">Click any row to see a plain-language explanation.</p>
          </div>
          <div className="results-table-wrap">
            <table className="results-table" aria-label="Medical report biomarkers">
              <thead><tr>
                <th className="th-num">#</th><th className="th-test">Test</th><th className="th-value">Value</th>
                <th className="th-unit">Unit</th><th className="th-ref">Reference Range</th>
                <th className="th-status">Status</th><th className="th-expand" aria-label="Details"></th>
              </tr></thead>
              <tbody>{biomarkers.map((b, i) => <BiomarkerRow key={i} b={b} index={i} />)}</tbody>
            </table>
          </div>
        </section>
      ) : (
        <div className="notice info" style={{ marginBottom: 28 }}><span className="notice-icon"><Info size={16} /></span><span>No individual tests could be identified.</span></div>
      )}

      {/* Possible Interpretations */}
      {interps.length > 0 && (
        <section className="interpretations-section" aria-labelledby="interp-heading">
          <div className="interp-section-header">
            <h2 id="interp-heading" className="section-heading"><Microscope size={16} />Possible Interpretations</h2>
            <div className="interp-global-warning" role="note"><AlertTriangle size={13} />Possible interpretations only — not confirmed diagnoses.</div>
          </div>
          <div className="interp-grid">
            {interps.map((interp, i) => (
              <div key={i} className="interp-card">
                <div className="interp-card-header"><div className="interp-condition">{interp.condition}</div><div className="interp-label-pill">{interp.label || 'Possible interpretation — not a confirmed diagnosis'}</div></div>
                {interp.relevantTests?.length > 0 && <div className="interp-tests">{interp.relevantTests.map((t, j) => <span key={j} className="interp-test-chip">{t}</span>)}</div>}
                {interp.reasoning && <p className="interp-reasoning">{interp.reasoning}</p>}
                {interp.whatToDoNext && <div className="interp-next"><ArrowRight size={12} style={{ flexShrink: 0, marginTop: 2 }} /><span>{interp.whatToDoNext}</span></div>}
              </div>
            ))}
          </div>
          <p className="interp-footer-note">Pattern-based interpretations for educational awareness only. A doctor&apos;s assessment is required before any conclusion can be drawn.</p>
        </section>
      )}

      {/* Lifestyle Guidance */}
      {analysis.lifestyleGuidance && (
        <section className="lifestyle-section" aria-labelledby="lifestyle-heading">
          <div className="lifestyle-section-header">
            <h2 id="lifestyle-heading" className="section-heading"><ShieldCheck size={16} />Lifestyle &amp; Wellness Guidance</h2>
            <div className="lifestyle-based-on">Based on: {(analysis.lifestyleGuidance.basedOnFindings || []).map((t, i) => <span key={i} className="interp-test-chip">{t}</span>)}</div>
          </div>
          <div className="lifestyle-grid">
            {analysis.lifestyleGuidance.diet && (
              <div className="lifestyle-card">
                <div className="lifestyle-card-header"><Salad size={15} />Diet</div>
                <div className="lifestyle-subsection"><div className="lifestyle-sub-label favor">Foods to favour</div><ul className="lifestyle-list">{(analysis.lifestyleGuidance.diet.favor || []).map((item, i) => <li key={i} className="lifestyle-list-item lifestyle-favor"><CheckCircle size={12} style={{ flexShrink: 0, marginTop: 2 }} /><span>{item}</span></li>)}</ul></div>
                <div className="lifestyle-subsection"><div className="lifestyle-sub-label limit">Foods to limit</div><ul className="lifestyle-list">{(analysis.lifestyleGuidance.diet.limit || []).map((item, i) => <li key={i} className="lifestyle-list-item lifestyle-limit"><XCircle size={12} style={{ flexShrink: 0, marginTop: 2 }} /><span>{item}</span></li>)}</ul></div>
                {analysis.lifestyleGuidance.diet.generalNote && <p className="lifestyle-note">{analysis.lifestyleGuidance.diet.generalNote}</p>}
              </div>
            )}
            {analysis.lifestyleGuidance.exercise && (
              <div className="lifestyle-card">
                <div className="lifestyle-card-header"><Dumbbell size={15} />Exercise</div>
                <div className="lifestyle-subsection"><div className="lifestyle-sub-label favor">Suggested activities</div><ul className="lifestyle-list">{(analysis.lifestyleGuidance.exercise.suggestions || []).map((item, i) => <li key={i} className="lifestyle-list-item lifestyle-favor"><CheckCircle size={12} style={{ flexShrink: 0, marginTop: 2 }} /><span>{item}</span></li>)}</ul></div>
                {analysis.lifestyleGuidance.exercise.cautions?.length > 0 && <div className="lifestyle-subsection"><div className="lifestyle-sub-label limit">General cautions</div><ul className="lifestyle-list">{analysis.lifestyleGuidance.exercise.cautions.map((item, i) => <li key={i} className="lifestyle-list-item lifestyle-limit"><AlertTriangle size={12} style={{ flexShrink: 0, marginTop: 2 }} /><span>{item}</span></li>)}</ul></div>}
                {analysis.lifestyleGuidance.exercise.generalNote && <p className="lifestyle-note">{analysis.lifestyleGuidance.exercise.generalNote}</p>}
              </div>
            )}
            {analysis.lifestyleGuidance.sleep && (
              <div className="lifestyle-card">
                <div className="lifestyle-card-header"><Moon size={15} />Sleep</div>
                <ul className="lifestyle-list" style={{ marginTop: 4 }}>{(analysis.lifestyleGuidance.sleep.suggestions || []).map((item, i) => <li key={i} className="lifestyle-list-item lifestyle-favor"><CheckCircle size={12} style={{ flexShrink: 0, marginTop: 2 }} /><span>{item}</span></li>)}</ul>
                {analysis.lifestyleGuidance.sleep.generalNote && <p className="lifestyle-note">{analysis.lifestyleGuidance.sleep.generalNote}</p>}
              </div>
            )}
            {analysis.lifestyleGuidance.dailyPrecautions?.length > 0 && (
              <div className="lifestyle-card">
                <div className="lifestyle-card-header"><ShieldCheck size={15} />Daily Precautions</div>
                <ul className="lifestyle-list" style={{ marginTop: 4 }}>{analysis.lifestyleGuidance.dailyPrecautions.map((item, i) => <li key={i} className="lifestyle-list-item lifestyle-favor"><ArrowRight size={12} style={{ flexShrink: 0, marginTop: 2 }} /><span>{item}</span></li>)}</ul>
              </div>
            )}
          </div>
          {analysis.lifestyleGuidance.lifestyleDisclaimer && <p className="lifestyle-disclaimer"><Info size={13} style={{ flexShrink: 0, marginTop: 1 }} />{analysis.lifestyleGuidance.lifestyleDisclaimer}</p>}
        </section>
      )}

      {/* Medication Education */}
      {analysis.medicationEducation?.conditionGroups?.length > 0 && (
        <section className="meded-section" aria-labelledby="meded-heading">
          <div className="meded-top-disclaimer" role="note"><AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} /><div><strong>General education only — not a prescription.</strong> Never start, stop, or adjust any medication without consulting your doctor. No dosage information is provided intentionally.</div></div>
          <h2 id="meded-heading" className="section-heading" style={{ marginBottom: 16 }}><Pill size={16} />Medication Education</h2>
          <div className="meded-groups">
            {analysis.medicationEducation.conditionGroups.map((group, gi) => (
              <div key={gi} className="meded-group">
                <div className="meded-group-header"><span className="meded-condition-name">{group.condition}</span><div className="meded-related-findings">{(group.relatedFindings || []).map((f, fi) => <span key={fi} className="interp-test-chip">{f}</span>)}</div></div>
                <div className="meded-medicines">{(group.medicines || []).map((med, mi) => <MedicineCard key={mi} med={med} />)}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Doctor Referral */}
      {analysis.doctorReferral && (
        <section className="referral-section" aria-labelledby="referral-heading">
          <h2 id="referral-heading" className="section-heading" style={{ marginBottom: 20 }}><Stethoscope size={16} />Doctor Referral Guide</h2>
          <div className="referral-grid">
            <div className="referral-main">
              {analysis.doctorReferral.specialists?.length > 0 && (
                <div className="referral-specialists">
                  <div className="referral-sub-heading">Suggested specialist(s)</div>
                  <div className="specialist-cards">
                    {analysis.doctorReferral.specialists.map((s, i) => (
                      <div key={i} className="specialist-card">
                        <div className="specialist-card-top"><Stethoscope size={14} /><span className="specialist-type">{s.specialistType}</span></div>
                        <p className="specialist-reason">{s.reason}</p>
                        {s.relevantFindings?.length > 0 && <div className="specialist-findings">{s.relevantFindings.map((f, fi) => <span key={fi} className="interp-test-chip">{f}</span>)}</div>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {analysis.doctorReferral.questionsToAsk?.length > 0 && (
                <div className="referral-questions">
                  <div className="referral-sub-heading"><MessageSquare size={14} />Questions to ask your doctor</div>
                  <ol className="questions-list">{analysis.doctorReferral.questionsToAsk.map((q, i) => <li key={i} className="question-item"><span className="question-num">{i + 1}</span><span className="question-text">{q}</span></li>)}</ol>
                </div>
              )}
            </div>
            {analysis.doctorReferral.urgencyAssessment && (() => {
              const u = analysis.doctorReferral.urgencyAssessment
              const urgencyClass = { routine: 'urgency-routine', soon: 'urgency-soon', prompt: 'urgency-prompt' }[u.level] || 'urgency-routine'
              return (
                <div className={`urgency-card ${urgencyClass}`}>
                  <div className="urgency-card-header"><Clock size={15} />Follow-up timing</div>
                  <div className="urgency-level-label">{u.label}</div>
                  {u.rationale && <p className="urgency-rationale">{u.rationale}</p>}
                  {u.urgencyDisclaimer && <p className="urgency-disclaimer">{u.urgencyDisclaimer}</p>}
                </div>
              )
            })()}
          </div>
        </section>
      )}

      {/* General notes */}
      {analysis.generalNotes && (
        <div className="results-general-notes" style={{ marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: 14, color: 'var(--gray-700)', marginBottom: 8 }}><Info size={15} /> General Notes</div>
          {analysis.generalNotes}
        </div>
      )}

      {/* Final disclaimer */}
      <div className="results-final-disclaimer" role="note">
        <strong style={{ display: 'block', marginBottom: 6, color: 'var(--gray-700)' }}>Always consult your doctor</strong>
        Reference ranges vary by laboratory, age, gender, and clinical context. Lab values must be interpreted alongside your symptoms, medical history, and physical examination by a qualified healthcare professional. Never start, stop, or adjust medication based on this summary.
      </div>

      {/* Actions */}
      <div className="results-actions">
        <button className="btn btn-primary" onClick={() => router.push('/upload')}><UploadCloud size={16} />Analyze another report</button>
        <button className="btn btn-secondary" onClick={handleDownloadPdf} disabled={pdfLoading} aria-busy={pdfLoading}>
          {pdfLoading
            ? <><span className="spinner" aria-hidden="true" />Preparing PDF…</>
            : <><Download size={15} />Download PDF</>}
        </button>
        <button className="btn btn-secondary" onClick={() => window.print()}>Print</button>
        <button className="btn btn-secondary" onClick={() => setShowHistory(h => !h)} aria-pressed={showHistory}>
          <History size={15} />{showHistory ? 'Hide history' : `Report history (${loadReports().length})`}
        </button>
      </div>
      {pdfError && (
        <div className="notice error" style={{ marginTop: 12 }} role="alert">
          <span className="notice-icon"><AlertTriangle size={15} /></span>
          <span>{pdfError}</span>
        </div>
      )}

      {/* Email the report */}
      <form className="email-report-box" onSubmit={handleSendEmail}>
        <div className="email-report-label">
          <Mail size={15} />
          Email me this report
        </div>
        <div className="email-report-row">
          <input
            type="email"
            className="email-report-input"
            placeholder="you@example.com"
            value={email}
            onChange={e => { setEmail(e.target.value); setEmailStatus(null) }}
            disabled={emailLoading}
            aria-label="Email address to send the report to"
            autoComplete="email"
          />
          <button
            type="submit"
            className="btn btn-primary"
            disabled={emailLoading || !email.trim()}
            aria-busy={emailLoading}
          >
            {emailLoading
              ? <><span className="spinner" aria-hidden="true" />Sending…</>
              : <><Send size={15} />Send PDF</>}
          </button>
        </div>
        {emailStatus && (
          <div
            className={`notice ${emailStatus.type === 'success' ? 'success' : 'error'}`}
            style={{ marginTop: 4 }}
            role={emailStatus.type === 'error' ? 'alert' : 'status'}
          >
            <span className="notice-icon">
              {emailStatus.type === 'success' ? <CheckCircle size={15} /> : <AlertTriangle size={15} />}
            </span>
            <span>{emailStatus.msg}</span>
          </div>
        )}
        <p className="email-report-hint">
          The report is generated fresh and sent as a PDF attachment. We don&apos;t store your email.
        </p>
      </form>

      {/* History panel */}
      {showHistory && (
        <section className="history-section" aria-labelledby="history-heading">
          <div className="history-header">
            <h2 id="history-heading" className="section-heading"><History size={16} />Saved Reports ({historyItems.length})</h2>
            <button className="history-clear-btn" onClick={() => { clearReports(); setShowHistory(false) }}>Clear all history</button>
          </div>
          {historyItems.length === 0 ? <p style={{ fontSize: 14, color: 'var(--gray-400)' }}>No history yet.</p> : (
            <div className="history-grid">
              {historyItems.map(r => (
                <div key={r.id} className="history-card">
                  <div className="history-card-top"><span className="history-report-type">{r.reportType}</span><span className="history-date">{r.testDate || r.savedAt.slice(0, 10)}</span></div>
                  <div className="history-biomarkers">
                    {r.biomarkers.slice(0, 6).map((b, j) => (
                      <div key={j} className={`history-bio-chip history-bio-${b.status}`} title={`${b.test}: ${b.measuredValue}${b.unit ? ' ' + b.unit : ''}`}>
                        <span className="history-bio-name">{b.abbreviation || b.test.split(' ')[0]}</span>
                        <span className="history-bio-val">{b.measuredValue ?? '—'}</span>
                      </div>
                    ))}
                    {r.biomarkers.length > 6 && <span className="history-bio-more">+{r.biomarkers.length - 6} more</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="history-note">Trend charts appear inside each expanded test row when you have 2 or more reports containing that test.</p>
        </section>
      )}

      {/* Chat + Voice */}
      <ReportChat analysis={analysis} />
    </div>
  )
}
