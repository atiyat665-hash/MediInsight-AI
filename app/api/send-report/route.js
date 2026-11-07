import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import { buildReportPdf, reportFileName } from '../../../lib/buildReportPdf.js'

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/send-report
// Body: { analysis, metadata, email }
// Builds the report PDF and emails it as an attachment via Resend.
// ─────────────────────────────────────────────────────────────────────────────

// Lazy client init with a clear key check (mirrors the Gemini key pattern).
let resendClient = null
function getResend() {
  if (!resendClient) {
    if (!process.env.RESEND_API_KEY) {
      throw new Error('RESEND_API_KEY is not set in .env.local.')
    }
    resendClient = new Resend(process.env.RESEND_API_KEY)
  }
  return resendClient
}

// Resend's shared test sender works with no domain verification.
// Override with EMAIL_FROM once you verify your own domain.
const FROM_ADDRESS = process.env.EMAIL_FROM || 'MediInsight AI <onboarding@resend.dev>'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(request) {
  try {
    const { analysis, metadata, email } = await request.json()

    if (!analysis || typeof analysis !== 'object') {
      return NextResponse.json({ error: 'analysis object is required.' }, { status: 400 })
    }
    if (!email || typeof email !== 'string' || !EMAIL_RE.test(email.trim())) {
      return NextResponse.json({ error: 'A valid email address is required.' }, { status: 400 })
    }

    const recipient = email.trim()

    // Build the PDF (same layout as the download route)
    const pdfBytes  = await buildReportPdf(analysis, metadata)
    const pdfBase64 = Buffer.from(pdfBytes).toString('base64')
    const fileName  = reportFileName(analysis)

    const reportType = analysis.reportType || 'Lab Report'

    const resend = getResend()
    const { data, error } = await resend.emails.send({
      from:    FROM_ADDRESS,
      to:      recipient,
      subject: `Your MediInsight AI report — ${reportType}`,
      html: `
        <div style="font-family: Arial, sans-serif; color: #2a211a; line-height: 1.6;">
          <h2 style="color: #7c3aed; margin-bottom: 4px;">Your MediInsight AI Report</h2>
          <p style="color: #7d6e65; margin-top: 0;">Report type: <strong>${reportType}</strong></p>
          <p>Your analysed medical report is attached as a PDF.</p>
          <p style="background:#fff1f0;border:1px solid #ffe4e1;border-radius:8px;padding:12px 14px;font-size:13px;color:#be123c;">
            <strong>Important:</strong> This summary is for educational purposes only. It is not
            medical advice, a diagnosis, or a treatment recommendation. Always consult a qualified
            doctor to interpret these results.
          </p>
          <p style="font-size:12px;color:#a8998f;">Sent by MediInsight AI. If you didn't request this, you can ignore this email.</p>
        </div>
      `,
      attachments: [
        {
          filename: fileName,
          content:  pdfBase64,   // Resend accepts base64 string content
        },
      ],
    })

    if (error) {
      console.error('[/api/send-report] Resend error:', error)
      // Resend returns structured errors; surface a readable message.
      const msg = error.message || 'Email service rejected the request.'
      return NextResponse.json({ error: msg }, { status: 502 })
    }

    return NextResponse.json({ ok: true, id: data?.id ?? null, to: recipient })
  } catch (err) {
    console.error('[/api/send-report]', err.message)
    return NextResponse.json({ error: err.message || 'Failed to send email.' }, { status: 500 })
  }
}
