'use client'
import React, {
  useState, useRef, useEffect, useCallback
} from 'react'
import axios from 'axios'
import {
  Send, Mic, MicOff, Volume2, VolumeX,
  MessageCircle, Loader2, AlertTriangle, RotateCcw
} from 'lucide-react'

// ─────────────────────────────────────────────────────────────
// Suggested starter questions shown before first message
// ─────────────────────────────────────────────────────────────
const SUGGESTIONS = [
  'What should I eat based on my results?',
  'Which of my results are abnormal and why?',
  'Is my situation something I should worry about?',
  'What does this test measure in simple terms?',
  'What questions should I ask my doctor?',
]

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

/** Build the compact reportContext object sent to /api/chat */
function buildReportContext(analysis) {
  return {
    reportType:     analysis.reportType   || null,
    testDate:       analysis.testDate     || null,
    patientInfo:    analysis.patientInfo  || {},
    overallSummary: analysis.overallSummary || null,
    biomarkers:     (analysis.biomarkers || analysis.findings || []).map(b => ({
      test:          b.test,
      abbreviation:  b.abbreviation  || null,
      measuredValue: b.measuredValue || null,
      unit:          b.unit          || null,
      referenceRange:b.referenceRange|| null,
      status:        b.status        || 'not_available',
      isAbnormal:    b.isAbnormal    || false,
    })),
  }
}

/** Detect Web Speech API support */
const SpeechRecognition =
  typeof window !== 'undefined' &&
  (window.SpeechRecognition || window.webkitSpeechRecognition)

// ─────────────────────────────────────────────────────────────
// Single message bubble
// ─────────────────────────────────────────────────────────────
function MessageBubble({ msg, onSpeak, isSpeaking, ttsEnabled }) {
  const isUser = msg.role === 'user'
  return (
    <div className={`chat-bubble-row ${isUser ? 'chat-bubble-row-user' : 'chat-bubble-row-ai'}`}>
      {!isUser && (
        <div className="chat-avatar chat-avatar-ai" aria-hidden="true">AI</div>
      )}
      <div className={`chat-bubble ${isUser ? 'chat-bubble-user' : 'chat-bubble-ai'}`}>
        {/* Whitespace-preserve so newlines in AI replies render correctly */}
        <p className="chat-bubble-text">{msg.content}</p>

        {/* TTS play button on AI messages */}
        {!isUser && ttsEnabled && (
          <button
            className={`chat-speak-btn ${isSpeaking ? 'chat-speak-btn-active' : ''}`}
            onClick={() => onSpeak(msg.content, msg.id)}
            aria-label={isSpeaking ? 'Stop speaking' : 'Read this aloud'}
            title={isSpeaking ? 'Stop' : 'Read aloud'}
          >
            {isSpeaking ? <VolumeX size={13} /> : <Volume2 size={13} />}
          </button>
        )}
      </div>
      {isUser && (
        <div className="chat-avatar chat-avatar-user" aria-hidden="true">You</div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────
export default function ReportChat({ analysis }) {
  const reportContext = buildReportContext(analysis)

  // ── State ──────────────────────────────────────────────────
  const [messages,    setMessages]    = useState([])   // { id, role, content }
  const [input,       setInput]       = useState('')
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState(null)

  // Voice: STT
  const [sttSupported] = useState(!!SpeechRecognition)
  const [listening,    setListening]  = useState(false)
  const recognitionRef = useRef(null)

  // Voice: TTS
  const [ttsEnabled,   setTtsEnabled] = useState(false)
  const [speakingId,   setSpeakingId] = useState(null) // id of message being spoken
  const audioRef       = useRef(null)  // current HTMLAudioElement

  const bottomRef  = useRef(null)
  const inputRef   = useRef(null)
  const msgCounter = useRef(0)

  const nextId = () => { msgCounter.current += 1; return msgCounter.current }

  // ── Auto-scroll to latest message ─────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  // ── Send a message ─────────────────────────────────────────
  const sendMessage = useCallback(async (text) => {
    const trimmed = text.trim()
    if (!trimmed || loading) return

    setError(null)
    setInput('')

    const userMsg = { id: nextId(), role: 'user', content: trimmed }
    const updated = [...messages, userMsg]
    setMessages(updated)
    setLoading(true)

    try {
      const { data } = await axios.post('/api/chat', {
        messages: updated.map(m => ({ role: m.role, content: m.content })),
        reportContext,
      })

      const aiMsg = { id: nextId(), role: 'assistant', content: data.reply }
      setMessages(prev => [...prev, aiMsg])

      // Auto-speak if TTS is on
      if (ttsEnabled) speakText(data.reply, aiMsg.id)
    } catch (err) {
      const msg = err.response?.data?.error || 'Something went wrong. Please try again.'
      setError(msg)
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }, [messages, loading, reportContext, ttsEnabled])

  const handleSubmit = (e) => {
    e.preventDefault()
    sendMessage(input)
  }

  const handleSuggestion = (text) => sendMessage(text)

  // ── STT: start / stop listening ───────────────────────────
  const startListening = useCallback(() => {
    if (!SpeechRecognition || listening) return

    const rec = new SpeechRecognition()
    rec.lang = 'en-US'
    rec.continuous = false
    rec.interimResults = false

    rec.onstart  = () => setListening(true)
    rec.onend    = () => setListening(false)
    rec.onerror  = () => setListening(false)

    rec.onresult = (e) => {
      const transcript = e.results[0]?.[0]?.transcript?.trim()
      if (transcript) {
        setInput(transcript)
        // Auto-send after STT result
        sendMessage(transcript)
      }
    }

    recognitionRef.current = rec
    rec.start()
  }, [listening, sendMessage])

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop()
    setListening(false)
  }, [])

  const toggleMic = () => listening ? stopListening() : startListening()

  // ── TTS: speak a message via /api/tts ─────────────────────
  const speakText = useCallback(async (text, msgId) => {
    // If already speaking this message, stop it
    if (speakingId === msgId) {
      audioRef.current?.pause()
      audioRef.current = null
      setSpeakingId(null)
      return
    }

    // Stop any currently playing audio
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
    setSpeakingId(msgId)

    try {
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      if (!response.ok) throw new Error('TTS request failed')

      const blob = await response.blob()
      const url  = URL.createObjectURL(blob)
      const audio = new Audio(url)
      audioRef.current = audio

      audio.onended  = () => { setSpeakingId(null); URL.revokeObjectURL(url) }
      audio.onerror  = () => { setSpeakingId(null); URL.revokeObjectURL(url) }
      audio.play()
    } catch {
      setSpeakingId(null)
    }
  }, [speakingId])

  // Stop audio when TTS is toggled off
  const toggleTts = () => {
    if (ttsEnabled) {
      audioRef.current?.pause()
      audioRef.current = null
      setSpeakingId(null)
    }
    setTtsEnabled(v => !v)
  }

  // Stop audio on unmount
  useEffect(() => () => {
    audioRef.current?.pause()
    recognitionRef.current?.stop()
  }, [])

  const clearChat = () => {
    audioRef.current?.pause()
    audioRef.current = null
    setSpeakingId(null)
    setMessages([])
    setError(null)
    setInput('')
  }

  const isEmpty = messages.length === 0

  // ── Render ─────────────────────────────────────────────────
  return (
    <section className="chat-section" aria-labelledby="chat-heading">

      {/* Section header */}
      <div className="chat-header">
        <div className="chat-header-left">
          <MessageCircle size={17} />
          <h2 id="chat-heading">Ask a follow-up question</h2>
          <span className="chat-context-pill">
            Report context active
          </span>
        </div>
        <div className="chat-header-controls">
          {/* TTS toggle */}
          <button
            className={`chat-ctrl-btn ${ttsEnabled ? 'chat-ctrl-btn-on' : ''}`}
            onClick={toggleTts}
            aria-pressed={ttsEnabled}
            title={ttsEnabled ? 'Turn off read-aloud' : 'Turn on read-aloud'}
          >
            {ttsEnabled ? <Volume2 size={15} /> : <VolumeX size={15} />}
            <span>{ttsEnabled ? 'Voice on' : 'Voice off'}</span>
          </button>

          {/* Clear */}
          {!isEmpty && (
            <button
              className="chat-ctrl-btn"
              onClick={clearChat}
              title="Clear conversation"
              aria-label="Clear conversation"
            >
              <RotateCcw size={14} />
              <span>Clear</span>
            </button>
          )}
        </div>
      </div>

      {/* Disclaimer */}
      <div className="chat-disclaimer" role="note">
        <AlertTriangle size={13} style={{ flexShrink: 0 }} />
        The AI assistant knows your report but is not a doctor. Answers are for
        educational purposes only — always confirm with a qualified healthcare professional.
      </div>

      {/* Message list */}
      <div className="chat-messages" aria-live="polite" aria-label="Conversation">
        {isEmpty ? (
          <div className="chat-empty">
            <p className="chat-empty-title">Your report is loaded. Ask anything.</p>
            <p className="chat-empty-sub">Try one of these:</p>
            <div className="chat-suggestions">
              {SUGGESTIONS.map((s, i) => (
                <button
                  key={i}
                  className="chat-suggestion-btn"
                  onClick={() => handleSuggestion(s)}
                  disabled={loading}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map(msg => (
              <MessageBubble
                key={msg.id}
                msg={msg}
                onSpeak={speakText}
                isSpeaking={speakingId === msg.id}
                ttsEnabled={ttsEnabled}
              />
            ))}
            {loading && (
              <div className="chat-bubble-row chat-bubble-row-ai">
                <div className="chat-avatar chat-avatar-ai" aria-hidden="true">AI</div>
                <div className="chat-bubble chat-bubble-ai chat-bubble-typing" aria-label="Thinking…">
                  <span className="typing-dot" /><span className="typing-dot" /><span className="typing-dot" />
                </div>
              </div>
            )}
          </>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Error */}
      {error && (
        <div className="notice error chat-error" role="alert">
          <AlertTriangle size={14} />
          <span>{error}</span>
        </div>
      )}

      {/* Input bar */}
      <form className="chat-input-bar" onSubmit={handleSubmit} aria-label="Send a message">
        {/* Mic button */}
        {sttSupported && (
          <button
            type="button"
            className={`chat-mic-btn ${listening ? 'chat-mic-btn-active' : ''}`}
            onClick={toggleMic}
            disabled={loading}
            aria-label={listening ? 'Stop listening' : 'Speak your question'}
            title={listening ? 'Stop' : 'Speak'}
          >
            {listening ? <MicOff size={18} /> : <Mic size={18} />}
            {listening && <span className="chat-mic-pulse" aria-hidden="true" />}
          </button>
        )}

        <input
          ref={inputRef}
          className="chat-input"
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder={
            listening
              ? 'Listening…'
              : sttSupported
                ? 'Type or tap the mic to speak…'
                : 'Ask a follow-up question…'
          }
          disabled={loading || listening}
          aria-label="Your message"
          maxLength={1000}
          autoComplete="off"
        />

        <button
          type="submit"
          className="chat-send-btn"
          disabled={!input.trim() || loading || listening}
          aria-label="Send message"
        >
          {loading
            ? <Loader2 size={17} className="chat-spin" />
            : <Send size={17} />}
        </button>
      </form>

      {/* STT hint */}
      {!sttSupported && (
        <p className="chat-stt-unsupported">
          Speech input is not supported in this browser. Try Chrome or Edge for voice.
        </p>
      )}
    </section>
  )
}
