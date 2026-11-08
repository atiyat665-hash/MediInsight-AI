import { NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import {
  buildMessages,
  buildBiomarkersMessages,
  buildSummaryMessages,
} from '../../../lib/buildPrompt.js'

export const maxDuration = 60

const DISCLAIMER_TEXT =
  'This structured summary is for educational purposes only. It does not constitute medical advice, a diagnosis, or a treatment recommendation. Reference ranges vary by laboratory and population. Please consult a qualified doctor or specialist to interpret these results in the context of your full medical history, symptoms, and clinical examination.'

let geminiClient = null
function getGemini() {
  if (!geminiClient) {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY is not set in environment.')
    }
    geminiClient = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  }
  return geminiClient
}

/**
 * Strip markdown code fences (```json ... ``` or ``` ... ```) and extract JSON string.
 */
function extractJSON(raw) {
  if (!raw || typeof raw !== 'string') return ''
  let text = raw.trim()

  // 1. Strip markdown code fences
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenceMatch) {
    text = fenceMatch[1].trim()
  }

  // 2. Find first { or [ and last matching } or ]
  const firstBrace = text.indexOf('{')
  const firstBracket = text.indexOf('[')

  let start = -1
  let closeChar = ''
  if (firstBrace === -1 && firstBracket === -1) return text
  if (firstBrace === -1) { start = firstBracket; closeChar = ']' }
  else if (firstBracket === -1) { start = firstBrace; closeChar = '}' }
  else if (firstBrace < firstBracket) { start = firstBrace; closeChar = '}' }
  else { start = firstBracket; closeChar = ']' }

  const end = text.lastIndexOf(closeChar)
  if (end === -1 || end < start) {
    return text.slice(start)
  }

  return text.slice(start, end + 1)
}

/**
 * Basic JSON repair for truncated strings or unclosed brackets/braces.
 */
function repairTruncatedJSON(jsonStr) {
  let str = (jsonStr || '').trim()
  str = str.replace(/,\s*$/, '')

  let inString = false
  let escape = false
  const stack = []

  for (let i = 0; i < str.length; i++) {
    const char = str[i]
    if (escape) {
      escape = false
      continue
    }
    if (char === '\\') {
      escape = true
      continue
    }
    if (char === '"') {
      inString = !inString
      continue
    }
    if (!inString) {
      if (char === '{' || char === '[') {
        stack.push(char === '{' ? '}' : ']')
      } else if (char === '}' || char === ']') {
        if (stack.length && stack[stack.length - 1] === char) {
          stack.pop()
        }
      }
    }
  }

  if (inString) str += '"'
  str = str.replace(/,\s*$/, '')
  while (stack.length > 0) {
    str += stack.pop()
  }
  return str
}

/**
 * Safely parse JSON after stripping markdown fences, with repair fallback.
 */
function safeParseJSON(raw) {
  const cleaned = extractJSON(raw)
  try {
    return { ok: true, data: JSON.parse(cleaned) }
  } catch (err1) {
    try {
      const repaired = repairTruncatedJSON(cleaned)
      return { ok: true, data: JSON.parse(repaired) }
    } catch {
      return { ok: false, error: err1 }
    }
  }
}

/**
 * Execute Gemini model call with 16000 max tokens and retry on truncation.
 */
async function generateWithRetry(messagesBuilder, extraArgs = {}) {
  const genAI = getGemini()

  // Attempt 1: Standard compact instruction
  const messages1 = messagesBuilder({ ultraCompact: false, ...extraArgs })
  const system1 = messages1.find(m => m.role === 'system')?.content || ''
  const user1 = messages1.find(m => m.role === 'user')?.content || ''

  const model1 = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    systemInstruction: system1,
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 16000,
      responseMimeType: 'application/json',
    },
  })

  console.log('[/api/analyze] sending request to Gemini (maxOutputTokens: 16000)…')
  const result1 = await model1.generateContent(user1)
  const candidate1 = result1.response.candidates?.[0]
  const finishReason1 = candidate1?.finishReason
  const rawContent1 = result1.response.text() || ''

  let parsed1 = safeParseJSON(rawContent1)

  // If truncated by token ceiling or unparseable truncated JSON, retry once with shorter instruction
  const isTruncated = finishReason1 === 'MAX_TOKENS' || !parsed1.ok

  if (!isTruncated && parsed1.ok) {
    return parsed1.data
  }

  console.warn(`[/api/analyze] Response truncated or unparseable (${finishReason1}). Retrying once with shorter-output instruction…`)

  // Attempt 2: Retry with ultra-compact instruction
  const messages2 = messagesBuilder({ ultraCompact: true, ...extraArgs })
  const system2 = messages2.find(m => m.role === 'system')?.content || ''
  const user2 = messages2.find(m => m.role === 'user')?.content || ''

  const model2 = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    systemInstruction: system2,
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 16000,
      responseMimeType: 'application/json',
    },
  })

  const result2 = await model2.generateContent(user2)
  const rawContent2 = result2.response.text() || ''
  const parsed2 = safeParseJSON(rawContent2)

  if (parsed2.ok) {
    console.log('[/api/analyze] Retry succeeded with compact instruction.')
    return parsed2.data
  }

  // If retry also failed, throw helpful error with preview
  throw new Error(
    `AI response was truncated and could not be parsed after retry. Preview: ${rawContent2.slice(0, 200)}`
  )
}

/**
 * Handle long reports with many biomarkers by splitting into 2 smaller Gemini calls:
 * Call 1: Extract all biomarkers + patient info
 * Call 2: Generate overall summary, interpretations, lifestyle, medications, and referral
 */
async function analyzeSplitReport(trimmedText) {
  console.log('[/api/analyze] Report has many biomarkers / lines — running split analysis…')

  // Call 1: Extract all biomarkers and patient metadata
  console.log('[/api/analyze] Call 1/2: Extracting biomarkers table…')
  const biomarkersData = await generateWithRetry(
    ({ ultraCompact }) => buildBiomarkersMessages(trimmedText, { ultraCompact })
  )

  const biomarkers = Array.isArray(biomarkersData?.biomarkers) ? biomarkersData.biomarkers : []
  const reportType = biomarkersData?.reportType || 'General Lab Report'
  const patientInfo = biomarkersData?.patientInfo || {}
  const testDate = biomarkersData?.testDate || null
  const abnormalBiomarkers = biomarkers.filter(b => b.isAbnormal === true)
  const normalTests = biomarkers.filter(b => !b.isAbnormal).map(b => b.test)

  console.log(`[/api/analyze] Call 1 extracted ${biomarkers.length} biomarkers (${abnormalBiomarkers.length} abnormal).`)

  // Call 2: Generate clinical interpretations, summary, lifestyle, and precautions
  console.log('[/api/analyze] Call 2/2: Generating summary and precautions…')
  let summaryData = {}
  try {
    summaryData = await generateWithRetry(
      () => buildSummaryMessages({
        reportType,
        patientInfo,
        abnormalBiomarkers,
        normalTests,
        reportSummaryText: trimmedText.slice(0, 1200),
      })
    )
  } catch (summaryErr) {
    console.warn('[/api/analyze] Call 2 had an error, using safe fallback summary:', summaryErr.message)
    summaryData = {
      overallSummary: {
        healthImpression: `This report includes ${biomarkers.length} test results with ${abnormalBiomarkers.length} flagged values.`,
        positiveFindings: normalTests.slice(0, 5).map(t => `Your ${t} appears normal.`),
        concerningFindings: abnormalBiomarkers.slice(0, 5).map(b => `Your ${b.test} is flagged as ${b.status}.`),
        nextSteps: [
          'Review these results with your doctor or healthcare provider.',
          'Ask your doctor whether any follow-up tests are appropriate.',
        ],
      },
      possibleInterpretations: [],
      lifestyleGuidance: null,
      medicationEducation: null,
      doctorReferral: null,
    }
  }

  // Merge Call 1 and Call 2 results
  return {
    reportType,
    testDate,
    patientInfo,
    overallSummary: summaryData.overallSummary || {
      healthImpression: 'Report analysis completed.',
      positiveFindings: [],
      concerningFindings: [],
      nextSteps: ['Discuss these findings with your doctor.'],
    },
    possibleInterpretations: summaryData.possibleInterpretations || [],
    lifestyleGuidance: summaryData.lifestyleGuidance || null,
    medicationEducation: summaryData.medicationEducation || null,
    doctorReferral: summaryData.doctorReferral || null,
    biomarkers,
    abnormalCount: abnormalBiomarkers.length,
    findings: biomarkers,
    generalNotes: biomarkersData?.generalNotes || summaryData?.generalNotes || null,
    disclaimer: DISCLAIMER_TEXT,
  }
}

export async function POST(request) {
  try {
    const { reportText } = await request.json()

    if (!reportText || typeof reportText !== 'string') {
      return NextResponse.json({ error: 'reportText is required.' }, { status: 400 })
    }
    const trimmed = reportText.trim()
    if (trimmed.length < 20) {
      return NextResponse.json({ error: 'Report text is too short.' }, { status: 400 })
    }
    if (trimmed.length > 50000) {
      return NextResponse.json({ error: 'Report text exceeds 50,000 characters.' }, { status: 400 })
    }

    const lines = trimmed.split('\n').map(l => l.trim()).filter(Boolean)
    // If report is long or has many lines, use the split analysis
    const hasManyBiomarkers = trimmed.length > 2500 || lines.length > 28

    let analysis
    if (hasManyBiomarkers) {
      analysis = await analyzeSplitReport(trimmed)
    } else {
      try {
        analysis = await generateWithRetry(
          ({ ultraCompact }) => buildMessages(trimmed, { ultraCompact })
        )
      } catch (singlePassErr) {
        console.warn('[/api/analyze] Single pass failed, falling back to split analysis:', singlePassErr.message)
        analysis = await analyzeSplitReport(trimmed)
      }
    }

    // Enforce server-side disclaimer and normalize biomarker counts
    analysis.disclaimer = DISCLAIMER_TEXT
    if (Array.isArray(analysis.biomarkers)) {
      analysis.abnormalCount = analysis.biomarkers.filter(b => b.isAbnormal === true).length
      analysis.findings = analysis.biomarkers
    }

    return NextResponse.json({ analysis })
  } catch (err) {
    const status = err?.status ?? err?.code ?? ''
    if (status === 'UNAUTHENTICATED' || String(status) === '401') {
      return NextResponse.json({ error: 'Invalid Gemini API key. Check GEMINI_API_KEY in environment.' }, { status: 401 })
    }
    if (status === 'RESOURCE_EXHAUSTED' || String(status) === '429') {
      return NextResponse.json({ error: 'Gemini rate limit reached. Please wait a moment and try again.' }, { status: 429 })
    }
    console.error('[/api/analyze]', err.message)
    return NextResponse.json({ error: err.message || 'Analysis failed.' }, { status: 500 })
  }
}
