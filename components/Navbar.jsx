'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { LogIn } from 'lucide-react'

// Pages where showing "Sign In" makes no sense (user is already on an auth page)
const AUTH_PATHS = new Set(['/login', '/signup', '/forgot-password'])

export default function Navbar() {
  const pathname = usePathname()
  const router   = useRouter()
  const isAuth   = AUTH_PATHS.has(pathname)

  return (
    <nav className="navbar" role="banner">
      <div className="navbar-inner">
        <Link href="/" className="navbar-brand" aria-label="MediInsight AI home">
          <span className="navbar-logo" aria-hidden="true">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M8 2v12M2 8h12" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
          </span>
          MediInsight <span style={{ color: 'var(--violet-500)' }}>AI</span>
        </Link>

        <nav className="navbar-nav" aria-label="Main navigation">
          <Link
            href="/"
            className={`nav-link${pathname === '/' ? ' active' : ''}`}
          >
            Home
          </Link>

          {/* Sign In — hidden on auth pages themselves */}
          {!isAuth && (
            <Link href="/login" className="nav-link nav-signin">
              <LogIn size={14} aria-hidden="true" />
              Sign In
            </Link>
          )}

          <button
            className="btn btn-primary nav-cta"
            onClick={() => router.push('/upload')}
            style={{ fontSize: 13, padding: '6px 14px' }}
          >
            Analyze Report
          </button>
        </nav>
      </div>
    </nav>
  )
}
