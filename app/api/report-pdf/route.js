import { NextResponse } from 'next/server'
import { buildReportPdf, reportFileName } from '../../../lib/buildReportPdf.js'

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/report-pdf
// Body: { analysis, metadata }
// Returns: application/pdf (download) — layout lives in lib/buildReportPdf.js
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(request) {
  try {
    const { analysis, metadata } = await request.json()
    if (!analysis || typeof analysis !== 'object') {
      return NextResponse.json({ error: 'analysis object is required.' }, { status: 400 })
    }

    const bytes = await buildReportPdf(analysis, metadata)

    return new Response(bytes, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${reportFileName(analysis)}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    console.error('[/api/report-pdf]', err.message)
    return NextResponse.json({ error: err.message || 'PDF generation failed.' }, { status: 500 })
  }
}
