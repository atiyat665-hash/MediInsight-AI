'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Mail, Lock, Eye, EyeOff, ArrowRight } from 'lucide-react'

export default function LoginPage() {
  const router = useRouter()
  const [email,      setEmail]      = useState('')
  const [password,   setPassword]   = useState('')
  const [remember,   setRemember]   = useState(false)
  const [showPw,     setShowPw]     = useState(false)
  const [error,      setError]      = useState('')
  const [loading,    setLoading]    = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!email || !password) { setError('Please enter your email and password.'); return }
    setLoading(true)
    // TODO: replace with real auth call (e.g. NextAuth signIn, Supabase, Firebase)
    try {
      await new Promise(r => setTimeout(r, 800)) // mock delay
      // Write session flag so the home page redirect guard recognises the user
      sessionStorage.setItem('mediinsight_authed', '1')
      router.push('/')
    } catch {
      setError('Login failed. Please check your credentials.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-screen">
      {/* Background blobs */}
      <div className="auth-blob auth-blob-1" aria-hidden="true" />
      <div className="auth-blob auth-blob-2" aria-hidden="true" />
      <div className="auth-blob auth-blob-3" aria-hidden="true" />

      {/* Glass card */}
      <div className="auth-card" role="main">

        {/* Logo / brand */}
        <div className="auth-brand">
          <div className="auth-brand-logo" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
              <path d="M11 2v18M2 11h18" stroke="white" strokeWidth="3" strokeLinecap="round"/>
            </svg>
          </div>
          <span className="auth-brand-name">MediInsight <span>AI</span></span>
        </div>

        <h1 className="auth-heading">Welcome back</h1>
        <p className="auth-subheading">Sign in to your account to continue</p>

        {/* Error notice */}
        {error && (
          <div className="auth-error" role="alert">{error}</div>
        )}

        <form className="auth-form" onSubmit={handleSubmit} noValidate>

          {/* Email */}
          <div className="auth-field">
            <label htmlFor="login-email" className="auth-label">Email address</label>
            <div className="auth-input-wrap">
              <span className="auth-input-icon" aria-hidden="true"><Mail size={16}/></span>
              <input
                id="login-email"
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
            <div className="auth-label-row">
              <label htmlFor="login-password" className="auth-label">Password</label>
              <Link href="/forgot-password" className="auth-forgot">Forgot password?</Link>
            </div>
            <div className="auth-input-wrap">
              <span className="auth-input-icon" aria-hidden="true"><Lock size={16}/></span>
              <input
                id="login-password"
                className="auth-input"
                type={showPw ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
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
          </div>

          {/* Remember me */}
          <div className="auth-remember">
            <label className="auth-checkbox-label">
              <input
                type="checkbox"
                className="auth-checkbox"
                checked={remember}
                onChange={e => setRemember(e.target.checked)}
              />
              <span className="auth-checkbox-custom" aria-hidden="true" />
              Remember me for 30 days
            </label>
          </div>

          {/* Submit */}
          <button
            type="submit"
            className="auth-btn-primary"
            disabled={loading}
            aria-busy={loading}
          >
            {loading
              ? <><span className="auth-spinner" aria-hidden="true" />Signing in…</>
              : <>Sign in <ArrowRight size={16}/></>}
          </button>

        </form>

        {/* Divider */}
        <div className="auth-divider" aria-hidden="true">
          <span>or continue with</span>
        </div>

        {/* Google SSO */}
        <button type="button" className="auth-btn-google" onClick={() => {/* TODO: Google OAuth */}}>
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
            <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
            <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
            <path d="M3.964 10.706A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.038l3.007-2.332z" fill="#FBBC05"/>
            <path d="M9 3.576c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.962L3.964 7.294C4.672 5.163 6.656 3.576 9 3.576z" fill="#EA4335"/>
          </svg>
          Sign in with Google
        </button>

        <p className="auth-switch">
          Don&apos;t have an account?{' '}
          <Link href="/signup" className="auth-switch-link">Create one</Link>
        </p>

      </div>
    </div>
  )
}
