/**
 * ocr-worker.mjs
 *
 * Standalone Node.js script — intentionally NEVER imported or bundled
 * by Next.js. Spawned as a child process by lib/textExtractor.js.
 *
 * Receives the image file path as process.argv[2].
 * Writes exactly one JSON line to stdout when done:
 *   { ok: true,  text: "...", confidence: 87 }
 *   { ok: false, error: "..." }
 *
 * Why a separate process instead of importing tesseract.js directly?
 * Next.js's webpack bundler rewrites internal require() paths so that
 * tesseract.js tries to load its worker thread from
 *   .next/worker-script/node/index.js
 * which does not exist. This causes a silent infinite retry loop that
 * hangs for over an hour. Running tesseract.js in a child process that
 * Next.js never touches bypasses the bundler entirely.
 */

import { createWorker } from 'tesseract.js'
import sharp            from 'sharp'
import { writeFileSync, unlinkSync, existsSync } from 'fs'
import { tmpdir }       from 'os'
import { join, resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname  = dirname(__filename)

// ── Paths resolved at startup, before any async work ──────────────────────
//
// node_modules/ sits one level above scripts/ (i.e. at mediinsight/).
// We use resolve() + fileURLToPath so Windows paths are correct —
// new URL().pathname produces /C:/... on Windows which Node can't open.
const NODE_MODULES = resolve(__dirname, '..', 'node_modules')

// The worker-script that Tesseract spawns as a worker thread.
// Confirmed present: node_modules/tesseract.js/src/worker-script/node/index.js
const WORKER_PATH  = join(NODE_MODULES, 'tesseract.js', 'src', 'worker-script', 'node', 'index.js')

// The WASM core binary. simd-lstm is the most capable variant and is present
// in all recent tesseract.js-core versions.
// Confirmed present: node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js
const CORE_PATH    = join(NODE_MODULES, 'tesseract.js-core', 'tesseract-core-simd-lstm.wasm.js')

// NOTE: langPath is intentionally NOT set.
// tesseract.js v5 removed the lang-data directory from the package.
// Omitting langPath lets Tesseract use its default OS cache directory
// (~/.tesseract.js) and download traineddata on first use, which is the
// correct behaviour for v5. Passing a non-existent directory causes a
// traineddata load failure.

// Fail immediately at process startup if either required file is missing,
// rather than failing deep inside an async call with a confusing error.
for (const [label, p] of [['WORKER_PATH', WORKER_PATH], ['CORE_PATH', CORE_PATH]]) {
  if (!existsSync(p)) {
    write({ ok: false, error: `Tesseract path not found (${label}): ${p}` })
    process.exit(1)
  }
}

// ── Hard timeout ───────────────────────────────────────────────────────────
// If Tesseract hangs (e.g. WASM fails to load), exit with a clear error
// rather than retrying silently. The parent process has its own 130s guard
// on top of this.
const TIMEOUT_MS = 120_000
const killTimer  = setTimeout(() => {
  write({ ok: false, error: 'OCR timed out after 2 minutes.' })
  process.exit(1)
}, TIMEOUT_MS)
// Don't let this timer keep the process alive if everything else finished
killTimer.unref()

function write(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n')
}

async function run() {
  const imagePath = process.argv[2]
  if (!imagePath) {
    write({ ok: false, error: 'No image path supplied to ocr-worker.' })
    process.exit(1)
  }

  let processedPath = null
  let worker        = null

  try {
    // ── Pre-process image for better OCR accuracy ────────────────────────
    const processedBuffer = await sharp(imagePath)
      .resize(3000, 3000, { fit: 'inside', withoutEnlargement: true })
      .grayscale()
      .normalize()
      .sharpen()
      .toBuffer()

    processedPath = join(tmpdir(), `mediinsight-ocr-${Date.now()}.png`)
    writeFileSync(processedPath, processedBuffer)

    // ── Create Tesseract worker with fully explicit paths ────────────────
    //
    // workerPath — points directly into node_modules so Next.js's bundled
    //              path (.next/worker-script/...) is never consulted.
    // corePath   — the WASM core; also bypasses any CDN fallback.
    // langPath   — local lang-data directory; prevents network downloads.
    //
    // All three are required to guarantee the worker starts correctly in
    // environments where the process is not running from the project root
    // (e.g. inside Next.js's server runtime working directory).
    worker = await createWorker('eng', 1, {
      workerPath: WORKER_PATH,   // was `workerPath` (undefined) — fix: use WORKER_PATH constant
      corePath:   CORE_PATH,
      // langPath omitted — tesseract.js v5 uses OS cache dir; no lang-data/ in package
      logger:       m => process.stderr.write(
        `[OCR] ${m.status}: ${Math.round((m.progress ?? 0) * 100)}%\n`
      ),
      errorHandler: err => process.stderr.write(`[OCR error] ${String(err)}\n`),
    })

    const { data } = await worker.recognize(processedPath)

    write({
      ok:         true,
      text:       data.text.trim(),
      confidence: Math.round(data.confidence ?? 0),
    })

  } catch (err) {
    write({ ok: false, error: err?.message || String(err) })
    process.exit(1)

  } finally {
    clearTimeout(killTimer)
    if (worker) {
      try { await worker.terminate() } catch {}
    }
    if (processedPath && existsSync(processedPath)) {
      try { unlinkSync(processedPath) } catch {}
    }
  }
}

run()
