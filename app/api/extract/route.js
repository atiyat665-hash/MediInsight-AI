import { NextResponse } from 'next/server'
import { writeFile, unlink } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { v4 as uuidv4 } from 'uuid'
import { extractText } from '../../../lib/textExtractor.js'

const MAX_SIZE_MB    = parseInt(process.env.MAX_FILE_SIZE_MB || '20', 10)
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024

const ALLOWED_MIME = new Set([
  'application/pdf', 'image/jpeg', 'image/jpg', 'image/png',
  'image/tiff', 'image/bmp', 'image/webp',
])
const ALLOWED_EXT = new Set(['.pdf', '.jpg', '.jpeg', '.png', '.tiff', '.tif', '.bmp', '.webp'])

export async function POST(request) {
  let tempPath = null
  try {
    const formData = await request.formData()
    const file = formData.get('report')

    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: 'No file uploaded. Please attach a PDF or image file.' }, { status: 400 })
    }

    // Validate MIME type
    if (!ALLOWED_MIME.has(file.type)) {
      return NextResponse.json(
        { error: `Unsupported file type: ${file.type}. Please upload a PDF or image (JPG, PNG, TIFF, BMP, WEBP).` },
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
    if (!ALLOWED_EXT.has(ext)) {
      return NextResponse.json(
        { error: `Unsupported file extension: ${ext}.` },
        { status: 415 }
      )
    }

    // Write to OS temp dir
    tempPath = join(tmpdir(), `${uuidv4()}${ext}`)
    await writeFile(tempPath, Buffer.from(arrayBuffer))

    // Extract text
    const result = await extractText(tempPath)

    if (!result.text || result.text.trim().length < 10) {
      return NextResponse.json(
        { error: 'Very little text could be extracted. The report may be low-quality or graphics-only. Try a higher-resolution image.' },
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
        confidence: result.confidence != null ? Math.round(result.confidence) : null,
        sizeKB:     Math.round(arrayBuffer.byteLength / 1024),
      },
    })
  } catch (err) {
    console.error('[/api/extract]', err.message)
    return NextResponse.json({ error: err.message || 'Extraction failed.' }, { status: 500 })
  } finally {
    // Always clean up temp file
    if (tempPath && existsSync(tempPath)) {
      unlink(tempPath).catch(e => console.warn('[Cleanup]', e.message))
    }
  }
}
