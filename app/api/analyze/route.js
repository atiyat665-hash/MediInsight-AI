import { NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { buildMessages } from '../../../lib/buildPrompt.js'

let geminiClient = null
function getGemini() {
  if (!geminiClient) {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY is not set in .env.local.')
    }
    geminiClient = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  }
  return geminiClient
}

/**
 * Strip markdown code fences and any surrounding prose that Gemini sometimes
 * wraps around its JSON output, then return the first {...} or [...] block.
 *
 * Handles all of these real Gemini output patterns:
 *   ```json\n{...}\n```
 *   ```\n{...}\n```
 *   Here is the JSON:\n{...}
 *   {... raw JSON ...}
 */
function extractJSON(raw) {
  // 1. Strip ```json ... ``` or ``` ... ``` fences (case-insensitive, dotAll)
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenceMatch) return fenceMatch[1].trim()

  // 2. Find the first { or [ and the matching last } or ] in the whole string.
  //    This handles "Here is the result: {...}" prose wrappers.
  const firstBrace   = raw.indexOf('{')
  const firstBracket = raw.indexOf('[')

  let start = -1
  let closeChar = ''
  if (firstBrace === -1 && firstBracket === -1) return raw  // no JSON found — let parse fail naturally
  if (firstBrace === -1)                        { start = firstBracket; closeChar = ']' }
  else if (firstBracket === -1)                 { start = firstBrace;   closeChar = '}' }
  else if (firstBrace < firstBracket)           { start = firstBrace;   closeChar = '}' }
  else                                          { start = firstBracket; closeChar = ']' }

  const end = raw.lastIndexOf(closeChar)
  if (end === -1 || end < start) return raw  // malformed — let parse fail with original

  return raw.slice(start, end + 1)
}

export async function POST(request) {
  try {
    const { reportText } = await request.json()

    if (!reportText || typeof reportText !== 'string') {
      return NextResponse.json({ error: 'reportText is required.' }, { status: 400 })
    }
    const trimmed = reportText.trim()
    if (trimmed.length < 20)    return NextResponse.json({ error: 'Report text is too short.' }, { status: 400 })
    if (trimmed.length > 40000) return NextResponse.json({ error: 'Report text exceeds 40,000 characters.' }, { status: 400 })

    // buildMessages returns [{ role: 'system', content }, { role: 'user', content }].
    // For Gemini the system instruction is a separate field, not a chat turn.
    const messages      = buildMessages(trimmed)
    const systemMessage = messages.find(m => m.role === 'system')
    const userMessage   = messages.find(m => m.role === 'user')

    const genAI = getGemini()
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction: systemMessage?.content ?? '',
      generationConfig: {
        temperature:      0.2,
        // 8192 tokens — the analysis schema is large (biomarkers, summary,
        // interpretations, lifestyle, medication, referral). 4096 truncated
        // full reports mid-JSON, causing parse failures.
        maxOutputTokens:  8192,
        // Instructs Gemini to return valid JSON — equivalent to OpenAI's
        // response_format: { type: 'json_object' }
        responseMimeType: 'application/json',
      },
    })

    const result     = await model.generateContent(userMessage?.content ?? '')
    const rawContent = result.response.text()

    if (!rawContent) throw new Error('AI returned an empty response.')

    // If Gemini hit the token ceiling the JSON will be truncated mid-object.
    // Surface a clear, actionable error rather than a cryptic parse failure.
    const finishReason = result.response.candidates?.[0]?.finishReason
    if (finishReason === 'MAX_TOKENS') {
      console.warn('[/api/analyze] Gemini response truncated (MAX_TOKENS).')
      throw new Error(
        'The report is too long to analyse in one pass — the AI response was ' +
        'truncated. Try analysing a shorter report or fewer pages.'
      )
    }

    // Log the raw response before any parsing so failures are debuggable.
    console.log('[/api/analyze] raw Gemini response:\n', rawContent)

    let analysis
    try {
      analysis = JSON.parse(extractJSON(rawContent))
    } catch {
      // Include the first 300 chars of raw output so the server log shows
      // exactly what Gemini returned — makes fence/wrapping issues obvious.
      throw new Error(
        `AI response could not be parsed. Raw output started with: ${rawContent.slice(0, 300)}`
      )
    }

    // Enforce server-side disclaimer and recompute abnormal count
    analysis.disclaimer = 'This structured summary is for educational purposes only. It does not constitute medical advice, a diagnosis, or a treatment recommendation. Reference ranges vary by laboratory and population. Please consult a qualified doctor or specialist to interpret these results in the context of your full medical history, symptoms, and clinical examination.'
    if (Array.isArray(analysis.biomarkers)) {
      analysis.abnormalCount = analysis.biomarkers.filter(b => b.isAbnormal === true).length
      analysis.findings = analysis.biomarkers // back-compat alias
    }

    return NextResponse.json({ analysis })
  } catch (err) {
    // Gemini error codes are strings, not HTTP integers
    const status = err?.status ?? err?.code ?? ''
    if (status === 'UNAUTHENTICATED'  || String(status) === '401') return NextResponse.json({ error: 'Invalid Gemini API key. Check GEMINI_API_KEY in .env.local.' }, { status: 401 })
    if (status === 'RESOURCE_EXHAUSTED' || String(status) === '429') return NextResponse.json({ error: 'Gemini rate limit reached. Please wait a moment and try again.' }, { status: 429 })
    console.error('[/api/analyze]', err.message)
    return NextResponse.json({ error: err.message || 'Analysis failed.' }, { status: 500 })
  }
}
