import { NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'

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

function buildReportSummary(ctx) {
  const lines = []
  lines.push(`Report type: ${ctx.reportType || 'Unknown'}`)
  if (ctx.testDate)            lines.push(`Test date: ${ctx.testDate}`)
  if (ctx.patientInfo?.name)   lines.push(`Patient name: ${ctx.patientInfo.name}`)
  if (ctx.patientInfo?.age)    lines.push(`Age: ${ctx.patientInfo.age}`)
  if (ctx.patientInfo?.gender) lines.push(`Gender: ${ctx.patientInfo.gender}`)
  const impression = ctx.overallSummary?.healthImpression
  if (impression) lines.push(`\nOverall impression: ${impression}`)
  const biomarkers = Array.isArray(ctx.biomarkers) ? ctx.biomarkers : []
  if (biomarkers.length > 0) {
    lines.push('\nTest results:')
    for (const b of biomarkers) {
      const val    = b.measuredValue ?? 'N/A'
      const unit   = (b.unit && !String(val).includes(b.unit)) ? ` ${b.unit}` : ''
      const ref    = b.referenceRange ? ` (ref: ${b.referenceRange})` : ''
      const status = b.status && b.status !== 'not_available' ? ` [${b.status.toUpperCase()}]` : ''
      const abbr   = b.abbreviation ? ` (${b.abbreviation})` : ''
      lines.push(`  • ${b.test}${abbr}: ${val}${unit}${ref}${status}`)
    }
  }
  return lines.join('\n')
}

function buildSystemPrompt(reportContext) {
  return `You are MediInsight AI, a friendly assistant helping a user understand their medical lab report.

The user has already received a structured analysis. Here is the full report context — refer to it when answering every question:

--- REPORT CONTEXT ---
${buildReportSummary(reportContext)}
--- END REPORT CONTEXT ---

RULES YOU MUST NEVER BREAK:
1. You are NOT a doctor. Never diagnose any condition.
2. Never say the user "has" a disease. Use hedged language: "may suggest", "could be associated with".
3. Never recommend starting, stopping, or changing any medication or supplement.
4. If asked "is this dangerous?", explain the value, note it is worth discussing with a doctor, never declare it safe or dangerous.
5. Always end answers to clinical questions with a brief reminder to confirm with a doctor.
6. Keep answers concise: 2–4 short paragraphs. No walls of text.`
}

export async function POST(request) {
  try {
    const { messages, reportContext } = await request.json()

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: 'messages array is required.' }, { status: 400 })
    }
    if (!reportContext || typeof reportContext !== 'object') {
      return NextResponse.json({ error: 'reportContext is required.' }, { status: 400 })
    }

    // Sanitise and window to last 20 turns
    const sanitised = messages
      .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
      .slice(-20)
      .map(m => ({
        // Gemini requires 'user' | 'model' — map 'assistant' → 'model'
        role:  m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content.trim().slice(0, 2000) }],
      }))

    if (sanitised.length === 0) {
      return NextResponse.json({ error: 'No valid messages provided.' }, { status: 400 })
    }

    // The last message must be from 'user' — Gemini rejects histories that
    // end on 'model'. Split it off and send as the new turn.
    const lastMessage  = sanitised.at(-1)
    const historyTurns = sanitised.slice(0, -1)

    // Ensure history alternates correctly: Gemini requires user/model/user...
    // Filter out any consecutive same-role entries (defensive, shouldn't happen
    // with normal chat but guards against edge cases in stored state).
    const cleanHistory = historyTurns.reduce((acc, turn) => {
      if (acc.length === 0 || acc.at(-1).role !== turn.role) acc.push(turn)
      return acc
    }, [])

    const genAI = getGemini()
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction: buildSystemPrompt(reportContext),
      generationConfig: {
        temperature:     0.4,
        maxOutputTokens: 800,
      },
    })

    // startChat() with prior history, then send the latest user message
    const chat   = model.startChat({ history: cleanHistory })
    const result = await chat.sendMessage(lastMessage.parts[0].text)
    const reply  = result.response.text().trim()

    if (!reply) throw new Error('AI returned an empty response.')
    return NextResponse.json({ reply })
  } catch (err) {
    const status = err?.status ?? err?.code ?? ''
    if (status === 'UNAUTHENTICATED'    || String(status) === '401') return NextResponse.json({ error: 'Invalid Gemini API key. Check GEMINI_API_KEY in .env.local.' }, { status: 401 })
    if (status === 'RESOURCE_EXHAUSTED' || String(status) === '429') return NextResponse.json({ error: 'Gemini rate limit reached. Please wait a moment and try again.' }, { status: 429 })
    console.error('[/api/chat]', err.message)
    return NextResponse.json({ error: err.message || 'Chat failed.' }, { status: 500 })
  }
}
