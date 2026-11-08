import { NextResponse } from 'next/server'
import { extractText } from '../../../lib/textExtractor.js'

export const maxDuration = 60

const MAX_SIZE_MB    = parseInt(process.env.MAX_FILE_SIZE_MB || '20', 10)
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024

const ALLOWED_MIME = new Set([
  'application/pdf', 'image/jpeg', 'image/jpg', 'image/png',
  'image/webp', 'image/heic', 'image/heif',
])
const ALLOWED_EXT = new Set(['.pdf', '.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif'])

export async function POST(request) {
  try {
    const contentType = request.headers.get('content-type') || ''
    if (!contentType.includes('multipart/form-data')) {
      return NextResponse.json({ error: 'Expected multipart/form-data request.' }, { status: 400 })
    }

    const formData = await request.formData()
    const file = formData.get('report')

    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: 'No file uploaded. Please attach a PDF or image file.' }, { status: 400 })
    }

    // Validate MIME type
    if (!ALLOWED_MIME.has(file.type)) {
      return NextResponse.json(
        { error: `Unsupported file type: ${file.type}. Please upload a PDF or image (JPG, PNG, WEBP, HEIC).` },
        { status: 415 }
      )
    }

    // Validate file size
    const arrayBuffer = await file.arrayBuffer()
    if (arrayBuffer.byteLength > MAX_SIZE_BYTES) {
      return NextResponse.json(
        { error: `File too large. Maximum allowed size is ${MAX_SIZE_MB} MB.` },
        { status: 413 }
      )
    }

    // Derive and validate extension
    const originalName = file.name || 'upload'
    const extMatch = originalName.match(/\.[^.]+$/)
    const ext = extMatch ? extMatch[0].toLowerCase() : ''
    if (ext && !ALLOWED_EXT.has(ext)) {
      return NextResponse.json(
        { error: `Unsupported file extension: ${ext}.` },
        { status: 415 }
      )
    }

    // Process entirely in memory — no writing to disk
    const buffer = Buffer.from(arrayBuffer)
    const result = await extractText({
      buffer,
      mimeType: file.type,
      filename: originalName,
    })

    if (!result.text || result.text.trim().length < 10) {
      return NextResponse.json(
        { error: 'Very little text could be extracted. The report may be low-quality or blank.' },
        { status: 422 }
      )
    }

    return NextResponse.json({
      extractedText: result.text,
      metadata: {
        filename:   originalName,
        mimeType:   file.type,
        method:     result.method,
        numPages:   result.numPages   || null,
        confidence: result.confidence != null ? Math.round(result.confidence) : 95,
        sizeKB:     Math.round(arrayBuffer.byteLength / 1024),
      },
    })
  } catch (err) {
    console.error('[/api/extract]', err.message)
    return NextResponse.json({ error: err.message || 'Extraction failed.' }, { status: 500 })
  }
}
