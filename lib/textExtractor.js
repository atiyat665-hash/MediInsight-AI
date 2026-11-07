import { existsSync, unlinkSync, readFileSync } from 'fs'
import { extname, resolve, dirname }            from 'path'
import { fileURLToPath }                        from 'url'
import { spawn }                                from 'child_process'
import { GoogleGenerativeAI }                   from '@google/generative-ai'

const __filename = fileURLToPath(import.meta.url)
const __dirname  = dirname(__filename)

// ─────────────────────────────────────────────────────────────────────────────
// Worker script paths (Tesseract fallback)
// ─────────────────────────────────────────────────────────────────────────────

const PDF_WORKER = resolve(__dirname, '..', 'scripts', 'pdf-to-images-worker.mjs')
const OCR_WORKER = resolve(__dirname, '..', 'scripts', 'ocr-worker.mjs')

for (const [label, p] of [['PDF_WORKER', PDF_WORKER], ['OCR_WORKER', OCR_WORKER]]) {
  if (!existsSync(p)) {
    throw new Error(
      `Worker script not found at ${p}. ` +
      `Check that scripts/${label.toLowerCase().replace('_', '-')}.mjs exists.`
    )
  }
}

// Parent-side timeouts
const PDF_RENDER_TIMEOUT_MS = 190_000
const OCR_TIMEOUT_MS        = 130_000

// ─────────────────────────────────────────────────────────────────────────────
// Child-process helper (used by PDF renderer + Tesseract fallback)
// ─────────────────────────────────────────────────────────────────────────────

function spawnWorker(scriptPath, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    let stdout   = ''
    let timedOut = false

    const childEnv = { ...process.env }
    delete childEnv.NODE_OPTIONS

    const child = spawn(process.execPath, [scriptPath, ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env:   childEnv,
    })

    child.stdout.on('data', chunk => { stdout += chunk.toString() })
    child.stderr.on('data', chunk => { process.stdout.write(chunk) })

    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGKILL')
      reject(new Error(`Worker timed out after ${Math.round(timeoutMs / 1000)}s: ${scriptPath}`))
    }, timeoutMs)

    child.on('close', code => {
      clearTimeout(timer)
      if (timedOut) return
      const line = stdout.trim().split('\n').filter(Boolean).pop() ?? ''
      let result
      try { result = JSON.parse(line) } catch {
        return reject(new Error(
          `Worker returned unparseable output (exit ${code}). Raw: ${line.slice(0, 200)}`
        ))
      }
      if (result.ok === false) reject(new Error(result.error || `Worker exited with code ${code}`))
      else resolve(result)
    })

    child.on('error', err => {
      clearTimeout(timer)
      reject(new Error(`Failed to start worker process: ${err.message}`))
    })
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// GEMINI VISION EXTRACTION
//
// Sends the image directly to the Gemini API as inline base64 data and
// instructs the model to transcribe every line of text verbatim, preserving
// the table structure (columns, spacing, units, reference ranges).
//
// Why Gemini instead of Tesseract for tables:
//   Tesseract treats each text region independently — it garbles multi-column
//   tables, drops rows, and merges adjacent cells. Gemini's vision model reads
//   the whole image as a unit and understands columnar layout natively.
//
// Supported image MIME types for Gemini inline data:
//   image/png, image/jpeg, image/webp, image/heic, image/heif
//
// Returns: { text: string, method: 'gemini-vision' }
// Throws on API error so callers can fall back to Tesseract.
// ─────────────────────────────────────────────────────────────────────────────

const GEMINI_VISION_PROMPT = `You are a precise medical document transcription engine.

Your task: extract ALL text from this medical report image exactly as it appears.

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
      throw new Error('GEMINI_API_KEY is not set in .env.local.')
    }
    _geminiClient = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  }
  return _geminiClient
}

// Map file extensions to Gemini's accepted inline MIME types.
// Gemini vision does not accept TIFF or BMP — those are converted to JPEG
// by sharp in the pdf-to-images-worker before reaching here, but for direct
// image uploads we normalise here too.
const EXT_TO_MIME = {
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png':  'image/png',
  '.webp': 'image/webp',
  '.heic': 'image/heic',
  '.heif': 'image/heif',
  // TIFF and BMP are not supported by Gemini inline — callers must convert first
}

async function extractWithGemini(imagePath) {
  const ext      = extname(imagePath).toLowerCase()
  const mimeType = EXT_TO_MIME[ext]

  if (!mimeType) {
    throw new Error(
      `Gemini vision does not support ${ext} images directly. ` +
      `Convert to PNG or JPEG first.`
    )
  }

  const imageBytes = readFileSync(imagePath)
  const base64Data = imageBytes.toString('base64')

  const genAI = getGeminiClient()
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: {
      temperature:     0,     // deterministic — we want exact transcription
      maxOutputTokens: 8192,  // large reports can be long
    },
  })

  const result = await model.generateContent([
    { text: GEMINI_VISION_PROMPT },
    { inlineData: { mimeType, data: base64Data } },
  ])

  const text = result.response.text().trim()

  if (!text || text.length < 5) {
    throw new Error('Gemini vision returned empty text.')
  }

  return { text, method: 'gemini-vision' }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tesseract fallback (child process, unchanged)
// ─────────────────────────────────────────────────────────────────────────────

async function extractWithTesseract(imagePath) {
  const result = await spawnWorker(OCR_WORKER, [imagePath], OCR_TIMEOUT_MS)
  return {
    text:       result.text,
    confidence: result.confidence,
    method:     'tesseract-ocr',
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// IMAGE EXTRACTION — Gemini primary, Tesseract fallback
// ─────────────────────────────────────────────────────────────────────────────

async function extractFromImage(filePath) {
  // Primary: Gemini vision
  try {
    console.log('[extract] trying Gemini vision…')
    const result = await extractWithGemini(filePath)
    console.log(`[extract] Gemini vision succeeded (${result.text.length} chars)`)
    return result
  } catch (geminiErr) {
    console.warn(`[extract] Gemini vision failed: ${geminiErr.message} — falling back to Tesseract`)
  }

  // Fallback: Tesseract
  console.log('[extract] running Tesseract OCR…')
  return await extractWithTesseract(filePath)
}

// ─────────────────────────────────────────────────────────────────────────────
// PDF EXTRACTION
//
//  1. pdf-to-images-worker renders each page to a temp PNG
//  2. Each PNG is sent to Gemini vision (primary) or Tesseract (fallback)
//  3. Per-page texts concatenated, temp PNGs deleted after each page
// ─────────────────────────────────────────────────────────────────────────────

async function extractFromPDF(filePath) {
  console.log('[PDF] rendering pages to images…')
  let renderResult
  try {
    renderResult = await spawnWorker(PDF_WORKER, [filePath], PDF_RENDER_TIMEOUT_MS)
  } catch (err) {
    throw new Error(`PDF rendering failed: ${err.message}`)
  }

  const { imagePaths, numPages, skippedPages = 0 } = renderResult
  console.log(`[PDF] rendered ${imagePaths.length}/${numPages} pages (${skippedPages} skipped)`)

  const pageTexts        = []
  let   totalConfidence  = 0
  let   methodUsed       = 'gemini-vision'  // updated to 'tesseract-ocr' if fallback fires

  for (let i = 0; i < imagePaths.length; i++) {
    const imgPath = imagePaths[i]
    try {
      console.log(`[PDF] extracting page ${i + 1}/${imagePaths.length}…`)

      // Try Gemini first
      let pageResult
      try {
        pageResult = await extractWithGemini(imgPath)
        console.log(`[PDF] page ${i + 1}: Gemini vision succeeded (${pageResult.text.length} chars)`)
      } catch (geminiErr) {
        console.warn(`[PDF] page ${i + 1}: Gemini failed (${geminiErr.message}) — falling back to Tesseract`)
        pageResult = await extractWithTesseract(imgPath)
        methodUsed = 'tesseract-ocr'  // at least one page used fallback
      }

      if (pageResult.text) pageTexts.push(pageResult.text)
      totalConfidence += pageResult.confidence ?? 90  // Gemini has no confidence score; assume 90

    } catch (err) {
      console.warn(`[PDF] page ${i + 1}: extraction failed completely: ${err.message}`)
    } finally {
      // Delete temp PNG only after extraction has fully resolved
      if (existsSync(imgPath)) {
        try { unlinkSync(imgPath) } catch (e) {
          console.warn(`[PDF] Could not delete temp PNG ${imgPath}: ${e.message}`)
        }
      }
    }
  }

  if (pageTexts.length === 0) {
    throw new Error(
      'No text could be extracted from any page of this PDF. ' +
      'The document may be blank or the pages could not be rendered.'
    )
  }

  const avgConfidence = Math.round(totalConfidence / imagePaths.length)
  const combinedText  = pageTexts.join('\n\n').trim()

  return {
    text:       combinedText,
    numPages,
    confidence: avgConfidence,
    method:     methodUsed === 'gemini-vision' ? 'gemini-vision' : 'pdf-ocr',
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC ENTRY POINT
// ─────────────────────────────────────────────────────────────────────────────

export async function extractText(filePath) {
  const ext = extname(filePath).toLowerCase()
  if (ext === '.pdf') return await extractFromPDF(filePath)
  if (['.jpg', '.jpeg', '.png', '.tiff', '.tif', '.bmp', '.webp'].includes(ext)) return await extractFromImage(filePath)
  throw new Error(`Unsupported file extension: ${ext}`)
}
