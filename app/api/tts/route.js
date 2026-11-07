import { NextResponse } from 'next/server'
import OpenAI from 'openai'

let openaiClient = null
function getOpenAI() {
  if (!openaiClient) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is not set in .env.local. It is required for text-to-speech.')
    }
    openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  }
  return openaiClient
}

const VALID_VOICES = new Set(['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'])

export async function POST(request) {
  try {
    const { text, voice = 'nova' } = await request.json()

    if (!text || typeof text !== 'string' || !text.trim()) {
      return NextResponse.json({ error: 'text is required.' }, { status: 400 })
    }

    const safeVoice = VALID_VOICES.has(voice) ? voice : 'nova'
    const clipped   = text.trim().slice(0, 4000)

    const openai   = getOpenAI()
    const response = await openai.audio.speech.create({
      model:           'tts-1',
      voice:           safeVoice,
      input:           clipped,
      response_format: 'mp3',
    })

    const audioBuffer = Buffer.from(await response.arrayBuffer())
    return new Response(audioBuffer, {
      headers: {
        'Content-Type':  'audio/mpeg',
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    if (err?.status === 401) return NextResponse.json({ error: 'Invalid OpenAI API key. OPENAI_API_KEY is used for text-to-speech.' }, { status: 401 })
    if (err?.status === 429) return NextResponse.json({ error: 'OpenAI rate limit reached (text-to-speech). Please wait a moment.' }, { status: 429 })
    console.error('[/api/tts]', err.message)
    return NextResponse.json({ error: err.message || 'TTS failed.' }, { status: 500 })
  }
}
