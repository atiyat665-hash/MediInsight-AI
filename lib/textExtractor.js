import { GoogleGenerativeAI } from '@google/generative-ai'

const GEMINI_EXTRACTION_PROMPT = `You are a precise medical document transcription engine.

Your task: extract ALL text from this medical report exactly as it appears.

Rules:
- Preserve every row of every table — do not skip any test or biomarker.
- Keep columns aligned using spaces or tabs so the structure is clear:
    Test Name        Value    Unit      Reference Range
- Transcribe numbers exactly — do not round or guess missing digits.
- Include all header information: patient name, date, lab name, doctor name if visible.
- Include all footnotes, flags (H/L/*/↑/↓), and comments.
- Do NOT interpret, explain, or summarise — only transcribe what you see.
- Do NOT add markdown formatting, bullet points, or headers that are not in the original.
- If a cell is blank or illegible, write [blank] or [illegible].
- Output plain text only.`

let _geminiClient = null
function getGeminiClient() {
  if (!_geminiClient) {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY is not set in environment.')
    }
    _geminiClient = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  }
  return _geminiClient
}

/**
 * Normalise MIME type from file type or filename extension.
 */
function resolveMimeType(mimeType = '', filename = '') {
  const mime = mimeType.toLowerCase().trim()
  const lowerName = filename.toLowerCase().trim()

  if (mime === 'application/pdf' || lowerName.endsWith('.pdf')) {
    return 'application/pdf'
  }
  if (mime === 'image/png' || lowerName.endsWith('.png')) {
    return 'image/png'
  }
  if (
    mime === 'image/jpeg' ||
    mime === 'image/jpg' ||
    lowerName.endsWith('.jpg') ||
    lowerName.endsWith('.jpeg')
  ) {
    return 'image/jpeg'
  }
  if (mime === 'image/webp' || lowerName.endsWith('.webp')) {
    return 'image/webp'
  }
  if (mime === 'image/heic' || lowerName.endsWith('.heic')) {
    return 'image/heic'
  }
  if (mime === 'image/heif' || lowerName.endsWith('.heif')) {
    return 'image/heif'
  }

  return mime || 'application/pdf'
}

/**
 * Extract text from a PDF or image in memory using Gemini Vision / Multimodal API.
 * No disk writes, no workers, no native packages (canvas/sharp/tesseract).
 *
 * @param {Buffer|Uint8Array|string|object} input Buffer or { buffer, mimeType, filename } or file path
 * @param {string} [inputMime]
 * @param {string} [inputFilename]
 * @returns {Promise<{ text: string, method: string, numPages: number|null, confidence: number }>}
 */
export async function extractText(input, inputMime, inputFilename) {
  let buffer
  let mimeType = inputMime
  let filename = inputFilename || ''

  if (typeof input === 'string') {
    // Path provided (e.g. testing) — read into memory
    const { readFileSync } = await import('fs')
    buffer = readFileSync(input)
    filename = input
  } else if (Buffer.isBuffer(input) || input instanceof Uint8Array) {
    buffer = Buffer.from(input)
  } else if (input && typeof input === 'object') {
    if (input.buffer) {
      buffer = Buffer.isBuffer(input.buffer) ? input.buffer : Buffer.from(input.buffer)
    }
    mimeType = input.mimeType || input.type || mimeType
    filename = input.filename || input.name || filename
  }

  if (!buffer || buffer.length === 0) {
    throw new Error('No valid file buffer provided for text extraction.')
  }

  const resolvedMime = resolveMimeType(mimeType, filename)
  const isPdf = resolvedMime === 'application/pdf'

  // Estimate or calculate page count for PDFs if possible in memory
  let numPages = isPdf ? 1 : null
  if (isPdf) {
    try {
      const { PDFDocument } = await import('pdf-lib')
      const doc = await PDFDocument.load(buffer, { ignoreEncryption: true })
      numPages = doc.getPageCount()
    } catch {
      numPages = 1
    }
  }

  const base64Data = buffer.toString('base64')
  const genAI = getGeminiClient()
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: {
      temperature: 0,
      maxOutputTokens: 8192,
    },
  })

  console.log(`[extract] sending in-memory ${resolvedMime} (${Math.round(buffer.length / 1024)} KB) to Gemini…`)

  const result = await model.generateContent([
    { text: GEMINI_EXTRACTION_PROMPT },
    {
      inlineData: {
        mimeType: resolvedMime,
        data: base64Data,
      },
    },
  ])

  const text = result?.response?.text()?.trim() || ''

  if (!text || text.length < 5) {
    throw new Error('Gemini vision returned empty text.')
  }

  console.log(`[extract] Gemini extraction succeeded (${text.length} chars)`)

  return {
    text,
    method: 'gemini-vision',
    numPages,
    confidence: 95,
  }
}
