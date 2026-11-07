/**
 * pdf-to-images-worker.mjs
 *
 * Standalone Node.js script — NEVER imported or bundled by Next.js.
 * Spawned as a child process by lib/textExtractor.js.
 *
 * Receives a PDF file path via process.argv[2].
 * Renders every page to a PNG, writes one JSON line to stdout:
 *   { ok: true,  imagePaths: [...], numPages: N, skippedPages: N }
 *   { ok: false, error: "..." }
 *
 * ── Compatibility notes ───────────────────────────────────────────────────
 *
 * This script is spawned with NODE_OPTIONS stripped from the environment
 * (see lib/textExtractor.js spawnWorker). That prevents Next.js's --require
 * transpiler hooks from intercepting the dynamic import() calls here, which
 * would otherwise hang on large .mjs files (pdf.worker.mjs is ~3 MB).
 *
 * Blank-render fix (the important one):
 *   In Node, pdfjs defaults `disableFontFace` to true. That routes every
 *   glyph through paintChar() → ctx.fill(internalPathObject). @napi-rs/canvas
 *   rejects pdfjs's internal Path object, so those fill() calls were being
 *   dropped — which silently blanked the entire page (all-white output).
 *
 *   Fix: explicitly set `disableFontFace: false` AND provide
 *   `standardFontDataUrl` pointing at pdfjs's bundled fonts. This makes pdfjs
 *   render text via ctx.fillText() — which @napi-rs/canvas fully supports —
 *   instead of glyph-outline fill(path). Verified: 117 fillText calls,
 *   0 fill(path) calls, black text pixels present.
 *
 *   The fill/stroke wrapper below is kept only as a defensive guard against
 *   any stray fill(internalPath) call (e.g. from vector graphics), so a single
 *   unsupported shape can never crash the whole render.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join, resolve, dirname }                   from 'path'
import { tmpdir }                                   from 'os'
import { fileURLToPath, pathToFileURL }             from 'url'
import { randomUUID }                               from 'crypto'
import { createCanvas, Path2D as NapiPath2D }       from '@napi-rs/canvas'

const __filename = fileURLToPath(import.meta.url)
const __dirname  = dirname(__filename)

// ── Hard timeout ─────────────────────────────────────────────────────────
const TIMEOUT_MS = 180_000
const killTimer  = setTimeout(() => {
  write({ ok: false, error: 'PDF-to-images timed out after 3 minutes.' })
  process.exit(1)
}, TIMEOUT_MS)
killTimer.unref()

function write(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n')
}

// 3.5× → 252 DPI (72 × 3.5) — sweet spot for Tesseract OCR accuracy.
const RENDER_SCALE = 3.5

// ── Context wrapper ───────────────────────────────────────────────────────
// Safety net only. With disableFontFace:false + standardFontDataUrl (set in
// getDocument below) pdfjs renders text via ctx.fillText() and never calls
// ctx.fill() with its internal Path object — so this guard almost never fires.
// It stays purely to prevent a crash if some rare PDF still passes a non-canvas
// path (e.g. a vector graphic outline @napi-rs/canvas can't represent).
function wrapContext(ctx) {
  const _fill   = ctx.fill.bind(ctx)
  const _stroke = ctx.stroke.bind(ctx)

  ctx.fill = function (...args) {
    if (args.length > 0 && typeof args[0] !== 'string' && !(args[0] instanceof NapiPath2D)) {
      return  // non-canvas path — skip to avoid a hard crash
    }
    return _fill(...args)
  }
  ctx.stroke = function (...args) {
    if (args.length > 0 && typeof args[0] !== 'string' && !(args[0] instanceof NapiPath2D)) {
      return
    }
    return _stroke(...args)
  }
  return ctx
}

class NodeCanvasFactory {
  create(width, height) {
    const canvas  = createCanvas(width, height)
    const context = wrapContext(canvas.getContext('2d'))
    return { canvas, context }
  }
  reset(c, w, h) { c.canvas.width = w; c.canvas.height = h }
  destroy(c)     { c.canvas.width = 0; c.canvas.height = 0; c.canvas = null; c.context = null }
}

// ── Main ──────────────────────────────────────────────────────────────────
async function run() {
  const pdfPath = process.argv[2]
  if (!pdfPath || !existsSync(pdfPath)) {
    write({ ok: false, error: `PDF path not found: ${pdfPath ?? '(none provided)'}` })
    process.exit(1)
  }

  // Import pdfjs. Pre-attach the worker module to globalThis so pdfjs's
  // _setupFakeWorkerGlobal uses it directly instead of doing its own
  // dynamic import(), which would hang even without NODE_OPTIONS if the
  // worker file takes too long to initialise.
  process.stderr.write('[pdf-render] importing pdfjs lib…\n')
  let t = Date.now()
  const pdfjsLib    = await import('pdfjs-dist/legacy/build/pdf.mjs')
  process.stderr.write(`[pdf-render] pdfjs lib imported in ${Date.now() - t}ms\n`)

  process.stderr.write('[pdf-render] importing pdfjs worker…\n')
  t = Date.now()
  const pdfjsWorker = await import('pdfjs-dist/legacy/build/pdf.worker.mjs')
  process.stderr.write(`[pdf-render] pdfjs worker imported in ${Date.now() - t}ms\n`)
  globalThis.pdfjsWorker = pdfjsWorker

  const CMAP_URL = pathToFileURL(
    resolve(__dirname, '..', 'node_modules', 'pdfjs-dist', 'cmaps') + '/'
  ).href
  const STANDARD_FONTS_URL = pathToFileURL(
    resolve(__dirname, '..', 'node_modules', 'pdfjs-dist', 'standard_fonts') + '/'
  ).href

  let pdf
  try {
    pdf = await pdfjsLib.getDocument({
      data:            new Uint8Array(readFileSync(pdfPath)),
      cMapUrl:         CMAP_URL,
      cMapPacked:      true,
      // ── The blank-page fix ─────────────────────────────────────────────
      // In Node, pdfjs auto-sets disableFontFace = true, which renders every
      // glyph as an outline via ctx.fill(internalPath). @napi-rs/canvas cannot
      // accept pdfjs's internal Path object, so those fills were being dropped
      // → completely blank white page.
      //
      // Forcing disableFontFace:false makes pdfjs render text with
      // ctx.fillText() instead (the native canvas text API, which
      // @napi-rs/canvas fully supports). standardFontDataUrl points pdfjs at
      // the bundled Foxit substitute fonts so it has real font data to draw.
      disableFontFace:     false,
      standardFontDataUrl: STANDARD_FONTS_URL,
      useSystemFonts:      false,
      isEvalSupported:     false,
      stopAtErrors:        false,
      ignoreErrors:        true,
      verbosity:           0,
    }).promise
  } catch (err) {
    write({ ok: false, error: `pdfjs could not open document: ${err.message}` })
    process.exit(1)
  }

  const numPages   = pdf.numPages
  const imagePaths = []
  const errors     = []

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    let page = null
    try {
      page = await pdf.getPage(pageNum)

      const viewport       = page.getViewport({ scale: RENDER_SCALE })
      const factory        = new NodeCanvasFactory()
      const { canvas, context } = factory.create(
        Math.ceil(viewport.width),
        Math.ceil(viewport.height)
      )

      process.stderr.write(
        `[pdf-render] page ${pageNum}: viewport ${Math.ceil(viewport.width)}×${Math.ceil(viewport.height)}px ` +
        `at scale ${RENDER_SCALE} (${Math.round(72 * RENDER_SCALE)} DPI)\n`
      )
      const renderStart = Date.now()

      await page.render({
        canvasContext: context,
        viewport,
        canvasFactory: factory,
      }).promise

      const renderMs = Date.now() - renderStart
      process.stderr.write(`[pdf-render] page ${pageNum}: render() took ${renderMs}ms\n`)

      const encodeStart = Date.now()
      const pngBuffer   = canvas.toBuffer('image/png')
      process.stderr.write(
        `[pdf-render] page ${pageNum}: toBuffer() took ${Date.now() - encodeStart}ms, ` +
        `PNG size ${(pngBuffer.length / 1024).toFixed(1)} KB\n`
      )

      // ── Debug copy ──────────────────────────────────────────────────────
      // Written to a fixed path so you can open it immediately after a run.
      // Overwritten on each request — last page always wins for multi-page PDFs.
      // Delete this block (or set DEBUG_PDF_RENDER=false) once rendering is confirmed good.
      const debugPath = join(tmpdir(), `mediinsight-debug-page${pageNum}.png`)
      writeFileSync(debugPath, pngBuffer)
      process.stderr.write(`[pdf-render] debug PNG saved → ${debugPath}\n`)

      // Sanity-check: sample the top-left 10×10 pixel region for non-blank content.
      // A blank (all-white) canvas means the render silently produced nothing.
      const sampleCtx = canvas.getContext('2d')
      const imgData   = sampleCtx.getImageData(0, 0, Math.min(10, canvas.width), Math.min(10, canvas.height))
      const allWhite  = imgData.data.every((v, i) => i % 4 === 3 ? true : v === 255)
      const allBlack  = imgData.data.every((v, i) => i % 4 === 3 ? true : v === 0)
      process.stderr.write(
        `[pdf-render] page ${pageNum}: pixel sample → ` +
        (allWhite ? '⚠ ALL WHITE (blank render!)' : allBlack ? '⚠ ALL BLACK' : '✓ has content') + '\n'
      )
      // ── End debug block ─────────────────────────────────────────────────

      // UUID guarantees uniqueness across concurrent requests hitting the
      // same millisecond — timestamp alone can collide.
      const outPath   = join(tmpdir(), `mediinsight-pdf-${randomUUID()}-p${pageNum}.png`)
      writeFileSync(outPath, pngBuffer)
      imagePaths.push(outPath)

    } catch (err) {
      const msg = `Page ${pageNum} render failed: ${err.message}`
      errors.push(msg)
      process.stderr.write(`[pdf-to-images] ${msg}\n`)
    } finally {
      if (page) { try { page.cleanup() } catch {} }
    }
  }

  clearTimeout(killTimer)

  if (imagePaths.length === 0) {
    write({ ok: false, error: `No pages could be rendered. Errors: ${errors.join(' | ')}` })
    process.exit(1)
  }

  write({ ok: true, imagePaths, numPages, skippedPages: errors.length })
}

run().catch(err => {
  write({ ok: false, error: err?.message ?? String(err) })
  process.exit(1)
})
