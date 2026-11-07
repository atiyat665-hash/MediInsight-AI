'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { User, Mail, Lock, Eye, EyeOff, ArrowRight, CheckCircle } from 'lucide-react'

const STRENGTH = [
  { label: 'Weak',   color: '#e11d48' },
  { label: 'Fair',   color: '#d97706' },
  { label: 'Good',   color: '#0d9488' },
  { label: 'Strong', color: '#16a34a' },
]

function passwordStrength(pw) {
  if (!pw) return -1
  let score = 0
  if (pw.length >= 8)        score++
  if (/[A-Z]/.test(pw))     score++
  if (/[0-9]/.test(pw))     score++
  if (/[^A-Za-z0-9]/.test(pw)) score++
  return score - 1  // 0..3
}

export default function SignupPage() {
  const router = useRouter()
  const [name,       setName]       = useState('')
  const [email,      setEmail]      = useState('')
  const [password,   setPassword]   = useState('')
  const [confirm,    setConfirm]    = useState('')
  const [showPw,     setShowPw]     = useState(false)
  const [showCf,     setShowCf]     = useState(false)
  const [error,      setError]      = useState('')
  const [loading,    setLoading]    = useState(false)

  const strength = passwordStrength(password)
  const pwMatch  = confirm.length > 0 && password === confirm

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!name.trim())               { setError('Please enter your name.');            return }
    if (!email)                     { setError('Please enter your email.');           return }
    if (password.length < 8)        { setError('Password must be at least 8 characters.'); return }
    if (password !== confirm)       { setError('Passwords do not match.');            return }
    setLoading(true)
    try {
      await new Promise(r => setTimeout(r, 900)) // mock delay
      sessionStorage.setItem('mediinsight_authed', '1')
      router.push('/')
    } catch {
      setError('Signup failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-blob auth-blob-1" aria-hidden="true" />
      <div className="auth-blob auth-blob-2" aria-hidden="true" />
      <div className="auth-blob auth-blob-3" aria-hidden="true" />

      <div className="auth-card" role="main">

        <div className="auth-brand">
          <div className="auth-brand-logo" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
              <path d="M11 2v18M2 11h18" stroke="white" strokeWidth="3" strokeLinecap="round"/>
            </svg>
          </div>
          <span className="auth-brand-name">MediInsight <span>AI</span></span>
        </div>

        <h1 className="auth-heading">Create your account</h1>
        <p className="auth-subheading">Start understanding your health reports today</p>

        {error && (
          <div className="auth-error" role="alert">{error}</div>
        )}

        <form className="auth-form" onSubmit={handleSubmit} noValidate>

          {/* Name */}
          <div className="auth-field">
            <label htmlFor="signup-name" className="auth-label">Full name</label>
            <div className="auth-input-wrap">
              <span className="auth-input-icon" aria-hidden="true"><User size={16}/></span>
              <input
                id="signup-name"
                className="auth-input"
                type="text"
                autoComplete="name"
                placeholder="Jane Smith"
                value={name}
                onChange={e => setName(e.target.value)}
                required
              />
            </div>
          </div>

          {/* Email */}
          <div className="auth-field">
            <label htmlFor="signup-email" className="auth-label">Email address</label>
            <div className="auth-input-wrap">
              <span className="auth-input-icon" aria-hidden="true"><Mail size={16}/></span>
              <input
                id="signup-email"
                className="auth-input"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
              />
            </div>
          </div>

          {/* Password */}
          <div className="auth-field">
            <label htmlFor="signup-password" className="auth-label">Password</label>
            <div className="auth-input-wrap">
              <span className="auth-input-icon" aria-hidden="true"><Lock size={16}/></span>
              <input
                id="signup-password"
                className="auth-input"
                type={showPw ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder="At least 8 characters"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={8}
              />
              <button
                type="button"
                className="auth-pw-toggle"
                onClick={() => setShowPw(v => !v)}
                aria-label={showPw ? 'Hide password' : 'Show password'}
              >
                {showPw ? <EyeOff size={15}/> : <Eye size={15}/>}
              </button>
            </div>

            {/* Strength meter */}
            {password.length > 0 && (
              <div className="auth-strength" aria-label={`Password strength: ${STRENGTH[Math.max(0,strength)]?.label}`}>
                <div className="auth-strength-bars">
                  {STRENGTH.map((s, i) => (
                    <div
                      key={i}
                      className="auth-strength-bar"
                      style={{ background: i <= strength ? STRENGTH[strength]?.color : undefined }}
                    />
                  ))}
                </div>
                <span
                  className="auth-strength-label"
                  style={{ color: STRENGTH[Math.max(0,strength)]?.color }}
                >
                  {STRENGTH[Math.max(0,strength)]?.label}
                </span>
              </div>
            )}
          </div>

          {/* Confirm password */}
          <div className="auth-field">
            <label htmlFor="signup-confirm" className="auth-label">Confirm password</label>
            <div className="auth-input-wrap">
              <span className="auth-input-icon" aria-hidden="true"><Lock size={16}/></span>
              <input
                id="signup-confirm"
                className="auth-input"
                type={showCf ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder="Repeat your password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                required
              />
              <button
                type="button"
                className="auth-pw-toggle"
                onClick={() => setShowCf(v => !v)}
                aria-label={showCf ? 'Hide confirm password' : 'Show confirm password'}
              >
                {showCf ? <EyeOff size={15}/> : <Eye size={15}/>}
              </button>
              {pwMatch && (
                <span className="auth-match-icon" aria-label="Passwords match">
                  <CheckCircle size={15} color="#16a34a"/>
                </span>
              )}
            </div>
          </div>

          <button
            type="submit"
            className="auth-btn-primary"
            disabled={loading}
            aria-busy={loading}
          >
            {loading
              ? <><span className="auth-spinner" aria-hidden="true"/>Creating account…</>
              : <>Create account <ArrowRight size={16}/></>}
          </button>

        </form>

        <p className="auth-terms">
          By signing up you agree to our{' '}
          <Link href="/terms" className="auth-switch-link">Terms</Link>{' '}
          and{' '}
          <Link href="/privacy" className="auth-switch-link">Privacy Policy</Link>.
        </p>

        <p className="auth-switch">
          Already have an account?{' '}
          <Link href="/login" className="auth-switch-link">Sign in</Link>
        </p>

      </div>
    </div>
  )
}
