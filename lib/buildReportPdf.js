import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

// ─────────────────────────────────────────────────────────────────────────────
// buildReportPdf(analysis, metadata) → Promise<Uint8Array>
//
// Shared PDF layout used by both /api/report-pdf (download) and
// /api/send-report (email attachment). Pure pdf-lib, no headless browser.
// ─────────────────────────────────────────────────────────────────────────────

const COLORS = {
  violet:   rgb(0.486, 0.227, 0.929),
  violetLt: rgb(0.93,  0.91,  0.996),
  teal:     rgb(0.051, 0.58,  0.533),
  ink:      rgb(0.10,  0.075, 0.063),
  body:     rgb(0.24,  0.20,  0.17),
  muted:    rgb(0.49,  0.43,  0.40),
  red:      rgb(0.88,  0.11,  0.28),
  redBg:    rgb(1.0,   0.945, 0.945),
  green:    rgb(0.086, 0.639, 0.29),
  amber:    rgb(0.85,  0.47,  0.03),
  line:     rgb(0.91,  0.87,  0.85),
  white:    rgb(1, 1, 1),
}

const PAGE_W = 595.28
const PAGE_H = 841.89
const MARGIN = 50
const CONTENT_W = PAGE_W - MARGIN * 2

export async function buildReportPdf(analysis, metadata) {
  const pdf = await PDFDocument.create()
  const font     = await pdf.embedFont(StandardFonts.Helvetica)
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const fontObl  = await pdf.embedFont(StandardFonts.HelveticaOblique)

  let page = pdf.addPage([PAGE_W, PAGE_H])
  let y    = PAGE_H - MARGIN

  function ensureSpace(needed) {
    if (y - needed < MARGIN + 30) {
      drawFooter(page)
      page = pdf.addPage([PAGE_W, PAGE_H])
      y = PAGE_H - MARGIN
    }
  }

  function wrap(text, sz, f, maxW = CONTENT_W) {
    const words = String(text ?? '').replace(/\s+/g, ' ').trim().split(' ')
    const lines = []
    let line = ''
    for (const w of words) {
      const test = line ? line + ' ' + w : w
      if (f.widthOfTextAtSize(test, sz) > maxW && line) { lines.push(line); line = w }
      else line = test
    }
    if (line) lines.push(line)
    return lines
  }

  function drawText(text, { size = 10, f = font, color = COLORS.body, indent = 0, gap = 3, lineH = 1.35 } = {}) {
    const lines = wrap(text, size, f, CONTENT_W - indent)
    for (const ln of lines) {
      ensureSpace(size * lineH)
      page.drawText(ln, { x: MARGIN + indent, y: y - size, size, font: f, color })
      y -= size * lineH
    }
    y -= gap
  }

  function drawHeading(text) {
    ensureSpace(30)
    y -= 8
    page.drawRectangle({ x: MARGIN, y: y - 15, width: 4, height: 18, color: COLORS.violet })
    page.drawText(text, { x: MARGIN + 12, y: y - 13, size: 14, font: fontBold, color: COLORS.ink })
    y -= 26
  }

  function drawFooter(pg) {
    pg.drawText('MediInsight AI — educational summary only, not a medical diagnosis.', {
      x: MARGIN, y: MARGIN - 22, size: 7.5, font, color: COLORS.muted,
    })
  }

  // ── Header band ──
  page.drawRectangle({ x: 0, y: PAGE_H - 90, width: PAGE_W, height: 90, color: COLORS.violet })
  page.drawText('MediInsight AI', { x: MARGIN, y: PAGE_H - 45, size: 22, font: fontBold, color: COLORS.white })
  page.drawText('Medical Report Analysis', { x: MARGIN, y: PAGE_H - 66, size: 11, font, color: rgb(0.9, 0.87, 1) })
  const genDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  const dateW = font.widthOfTextAtSize(`Generated ${genDate}`, 9)
  page.drawText(`Generated ${genDate}`, { x: PAGE_W - MARGIN - dateW, y: PAGE_H - 45, size: 9, font, color: COLORS.white })
  y = PAGE_H - 110

  // ── Report meta line ──
  const metaBits = [
    analysis.reportType || 'Lab Report',
    analysis.testDate ? `Date: ${analysis.testDate}` : null,
    analysis.patientInfo?.name ? `Patient: ${analysis.patientInfo.name}` : null,
    analysis.patientInfo?.age ? `Age: ${analysis.patientInfo.age}` : null,
    analysis.patientInfo?.gender || null,
    metadata?.filename || null,
  ].filter(Boolean)
  drawText(metaBits.join('   •   '), { size: 9.5, f: fontBold, color: COLORS.teal, gap: 6 })

  // ── Stats row ──
  const biomarkers = analysis.biomarkers || analysis.findings || []
  const abnormal   = biomarkers.filter(b => b.isAbnormal)
  const normal     = biomarkers.filter(b => !b.isAbnormal && b.status !== 'not_available')
  const stats = [
    { n: biomarkers.length, label: 'Total tests', c: COLORS.ink },
    { n: abnormal.length,   label: 'Abnormal',    c: COLORS.red },
    { n: normal.length,     label: 'Normal',      c: COLORS.green },
  ]
  ensureSpace(50)
  let sx = MARGIN
  const cardW = (CONTENT_W - 20) / 3
  for (const s of stats) {
    page.drawRectangle({ x: sx, y: y - 42, width: cardW, height: 42, color: COLORS.violetLt, borderColor: COLORS.line, borderWidth: 1 })
    page.drawText(String(s.n), { x: sx + 12, y: y - 26, size: 20, font: fontBold, color: s.c })
    page.drawText(s.label, { x: sx + 12, y: y - 37, size: 8, font, color: COLORS.muted })
    sx += cardW + 10
  }
  y -= 56

  // ── Overall impression ──
  const impression = analysis.overallSummary?.healthImpression || analysis.summary
  if (impression) {
    drawHeading('Overall Summary')
    drawText(impression, { size: 10.5 })
  }

  const os = analysis.overallSummary
  if (os?.positiveFindings?.length) {
    drawText('Looking good:', { size: 10, f: fontBold, color: COLORS.green, gap: 2 })
    for (const it of os.positiveFindings) drawText('•  ' + it, { size: 9.5, indent: 8, gap: 1 })
    y -= 4
  }
  if (os?.concerningFindings?.length) {
    drawText('Worth discussing with your doctor:', { size: 10, f: fontBold, color: COLORS.red, gap: 2 })
    for (const it of os.concerningFindings) drawText('•  ' + it, { size: 9.5, indent: 8, gap: 1 })
    y -= 4
  }
  if (os?.nextSteps?.length) {
    drawText('Recommended next steps:', { size: 10, f: fontBold, color: COLORS.violet, gap: 2 })
    os.nextSteps.forEach((it, i) => drawText(`${i + 1}.  ${it}`, { size: 9.5, indent: 8, gap: 1 }))
    y -= 4
  }

  // ── Test results table ──
  if (biomarkers.length) {
    drawHeading('Test Results')
    const cols = [
      { w: 0.34, label: 'Test' },
      { w: 0.18, label: 'Value' },
      { w: 0.14, label: 'Unit' },
      { w: 0.20, label: 'Reference' },
      { w: 0.14, label: 'Status' },
    ]
    const colX = []
    let cx = MARGIN
    for (const c of cols) { colX.push(cx); cx += c.w * CONTENT_W }

    ensureSpace(20)
    page.drawRectangle({ x: MARGIN, y: y - 16, width: CONTENT_W, height: 16, color: COLORS.violetLt })
    cols.forEach((c, i) => page.drawText(c.label, { x: colX[i] + 4, y: y - 12, size: 8.5, font: fontBold, color: COLORS.violet }))
    y -= 16

    const statusLabel = { normal: 'Normal', low: 'Low', high: 'High', borderline: 'Borderline', not_available: 'N/A' }
    const statusColor = { normal: COLORS.green, low: COLORS.violet, high: COLORS.red, borderline: COLORS.amber, not_available: COLORS.muted }

    for (const b of biomarkers) {
      const nameLines = wrap(b.test || '', 8.5, font, cols[0].w * CONTENT_W - 8)
      const rowH = Math.max(15, nameLines.length * 11 + 4)
      ensureSpace(rowH)

      if (b.isAbnormal) {
        page.drawRectangle({ x: MARGIN, y: y - rowH, width: CONTENT_W, height: rowH, color: COLORS.redBg })
      }
      nameLines.forEach((ln, li) => page.drawText(ln, { x: colX[0] + 4, y: y - 11 - li * 11, size: 8.5, font: fontBold, color: COLORS.ink }))
      page.drawText(String(b.measuredValue ?? '—'), { x: colX[1] + 4, y: y - 11, size: 8.5, font: fontBold, color: statusColor[b.status] || COLORS.body })
      page.drawText(String(b.unit ?? '—'), { x: colX[2] + 4, y: y - 11, size: 8.5, font, color: COLORS.muted })
      page.drawText(String(b.referenceRange ?? '—'), { x: colX[3] + 4, y: y - 11, size: 8, font, color: COLORS.muted })
      page.drawText(statusLabel[b.status] || 'N/A', { x: colX[4] + 4, y: y - 11, size: 8.5, font: fontBold, color: statusColor[b.status] || COLORS.muted })

      y -= rowH
      page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 0.5, color: COLORS.line })
    }
    y -= 8
  }

  // ── Abnormal detail explanations ──
  const abnormalWithDetail = biomarkers.filter(b => b.isAbnormal && (b.explanation || b.abnormalDetail))
  if (abnormalWithDetail.length) {
    drawHeading('Abnormal Findings — Details')
    for (const b of abnormalWithDetail) {
      drawText(`${b.test}  (${b.measuredValue ?? ''} ${b.unit ?? ''})`, { size: 10.5, f: fontBold, color: COLORS.red, gap: 2 })
      if (b.explanation) drawText(b.explanation, { size: 9.5, indent: 6 })
      if (b.abnormalDetail?.possibleCauses)     drawText('Possible causes: ' + b.abnormalDetail.possibleCauses, { size: 9, indent: 6, color: COLORS.muted })
      if (b.abnormalDetail?.possibleSymptoms)   drawText('Possible symptoms: ' + b.abnormalDetail.possibleSymptoms, { size: 9, indent: 6, color: COLORS.muted })
      if (b.abnormalDetail?.generalHealthRisks) drawText(b.abnormalDetail.generalHealthRisks, { size: 9, indent: 6, color: COLORS.muted })
      if (b.abnormalDetail?.closingLine)        drawText(b.abnormalDetail.closingLine, { size: 8.5, f: fontObl, indent: 6, color: COLORS.red })
      y -= 4
    }
  }

  // ── Possible interpretations ──
  const interps = Array.isArray(analysis.possibleInterpretations) ? analysis.possibleInterpretations : []
  if (interps.length) {
    drawHeading('Possible Interpretations')
    drawText('These are possible patterns only — NOT confirmed diagnoses. Only a doctor can diagnose a condition.', { size: 8.5, f: fontObl, color: COLORS.amber, gap: 6 })
    for (const it of interps) {
      drawText(it.condition, { size: 10.5, f: fontBold, color: COLORS.violet, gap: 1 })
      if (it.reasoning) drawText(it.reasoning, { size: 9.5, indent: 6 })
      if (it.whatToDoNext) drawText('Next: ' + it.whatToDoNext, { size: 9, indent: 6, color: COLORS.teal })
      y -= 4
    }
  }

  // ── Lifestyle guidance ──
  const lg = analysis.lifestyleGuidance
  if (lg) {
    drawHeading('Lifestyle & Wellness Guidance')
    if (lg.diet?.favor?.length) {
      drawText('Foods to favour:', { size: 10, f: fontBold, color: COLORS.green, gap: 2 })
      for (const it of lg.diet.favor) drawText('•  ' + it, { size: 9.5, indent: 8, gap: 1 })
      y -= 3
    }
    if (lg.diet?.limit?.length) {
      drawText('Foods to limit:', { size: 10, f: fontBold, color: COLORS.red, gap: 2 })
      for (const it of lg.diet.limit) drawText('•  ' + it, { size: 9.5, indent: 8, gap: 1 })
      y -= 3
    }
    if (lg.exercise?.suggestions?.length) {
      drawText('Exercise suggestions:', { size: 10, f: fontBold, color: COLORS.violet, gap: 2 })
      for (const it of lg.exercise.suggestions) drawText('•  ' + it, { size: 9.5, indent: 8, gap: 1 })
      y -= 3
    }
    if (lg.sleep?.suggestions?.length) {
      drawText('Sleep:', { size: 10, f: fontBold, color: COLORS.violet, gap: 2 })
      for (const it of lg.sleep.suggestions) drawText('•  ' + it, { size: 9.5, indent: 8, gap: 1 })
      y -= 3
    }
    if (lg.dailyPrecautions?.length) {
      drawText('Daily precautions:', { size: 10, f: fontBold, color: COLORS.violet, gap: 2 })
      for (const it of lg.dailyPrecautions) drawText('•  ' + it, { size: 9.5, indent: 8, gap: 1 })
      y -= 3
    }
  }

  // ── Medication education ──
  const groups = analysis.medicationEducation?.conditionGroups
  if (groups?.length) {
    drawHeading('Medication Education')
    drawText('General education only — NOT a prescription. No dosages provided. Never start, stop, or change medication without consulting your doctor.', { size: 8.5, f: fontObl, color: COLORS.amber, gap: 6 })
    for (const g of groups) {
      drawText(g.condition, { size: 10.5, f: fontBold, color: COLORS.violet, gap: 2 })
      for (const med of (g.medicines || [])) {
        drawText(`${med.genericName}  (${med.medicineClass || ''})`, { size: 10, f: fontBold, indent: 6, gap: 1 })
        if (med.commonPurpose) drawText('Purpose: ' + med.commonPurpose, { size: 9, indent: 12, color: COLORS.muted })
        if (med.howItWorks)    drawText('How it works: ' + med.howItWorks, { size: 9, indent: 12, color: COLORS.muted })
        if (med.commonSideEffects?.length) drawText('Common side effects: ' + med.commonSideEffects.join(', '), { size: 9, indent: 12, color: COLORS.muted })
        if (med.whoShouldAvoid?.length)     drawText('Use with caution: ' + med.whoShouldAvoid.join(', '), { size: 9, indent: 12, color: COLORS.muted })
        y -= 3
      }
    }
  }

  // ── Doctor referral ──
  const dr = analysis.doctorReferral
  if (dr) {
    drawHeading('Doctor Referral Guide')
    if (dr.urgencyAssessment?.label) {
      drawText('Follow-up timing: ' + dr.urgencyAssessment.label, { size: 10.5, f: fontBold, color: COLORS.amber, gap: 2 })
      if (dr.urgencyAssessment.rationale) drawText(dr.urgencyAssessment.rationale, { size: 9.5, indent: 6 })
      y -= 2
    }
    if (dr.specialists?.length) {
      drawText('Suggested specialist(s):', { size: 10, f: fontBold, color: COLORS.violet, gap: 2 })
      for (const s of dr.specialists) {
        drawText(`${s.specialistType}` + (s.reason ? ` — ${s.reason}` : ''), { size: 9.5, indent: 8, gap: 1 })
      }
      y -= 3
    }
    if (dr.questionsToAsk?.length) {
      drawText('Questions to ask your doctor:', { size: 10, f: fontBold, color: COLORS.teal, gap: 2 })
      dr.questionsToAsk.forEach((q, i) => drawText(`${i + 1}.  ${q}`, { size: 9.5, indent: 8, gap: 1 }))
      y -= 3
    }
  }

  // ── General notes ──
  if (analysis.generalNotes) {
    drawHeading('General Notes')
    drawText(analysis.generalNotes, { size: 9.5 })
  }

  // ── Final disclaimer box ──
  ensureSpace(70)
  y -= 6
  const discLines = wrap(
    analysis.disclaimer ||
    'This summary is for educational purposes only. It is not medical advice, a diagnosis, or a treatment recommendation. Always consult a qualified doctor.',
    8.5, font, CONTENT_W - 20
  )
  const boxH = discLines.length * 11 + 20
  page.drawRectangle({ x: MARGIN, y: y - boxH, width: CONTENT_W, height: boxH, color: COLORS.redBg, borderColor: COLORS.red, borderWidth: 1 })
  page.drawText('Important', { x: MARGIN + 10, y: y - 14, size: 9, font: fontBold, color: COLORS.red })
  discLines.forEach((ln, i) => page.drawText(ln, { x: MARGIN + 10, y: y - 26 - i * 11, size: 8.5, font, color: COLORS.body }))
  y -= boxH + 10

  drawFooter(page)

  return await pdf.save()
}

// Derives a safe filename slug from the report type.
export function reportFileName(analysis) {
  const safe = (analysis?.reportType || 'report').replace(/[^a-z0-9]+/gi, '-').toLowerCase()
  return `mediinsight-${safe}.pdf`
}
