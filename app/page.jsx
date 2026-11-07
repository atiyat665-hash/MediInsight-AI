'use client'
import { useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowRight, Brain, Shield, FileText, AlertTriangle, CheckCircle } from 'lucide-react'

const FEATURES = [
  {
    icon: <Brain size={22} />,
    color: 'blue',
    title: 'Plain-language explanations',
    desc: 'Every value, unit, and reference range explained in simple everyday language — no medical degree required.',
  },
  {
    icon: <FileText size={22} />,
    color: 'teal',
    title: 'PDF & image support',
    desc: 'Upload a PDF, JPG, PNG, TIFF, or BMP. OCR handles scanned documents automatically.',
  },
  {
    icon: <Shield size={22} />,
    color: 'green',
    title: 'Verify before analysis',
    desc: 'See the raw extracted text first. Correct any OCR errors before the AI reads it.',
  },
]

const SUPPORTED = [
  'Blood tests — CBC, WBC differential',
  'Liver function (LFT / ALT / AST / ALP)',
  'Kidney function (KFT / creatinine / BUN)',
  'Lipid profile & cholesterol',
  'Thyroid panel (TSH, T3, T4)',
  'Blood glucose & HbA1c',
  'Vitamin B12, D, iron studies',
  'Urinalysis / urine culture',
]

export default function HomePage() {
  const router = useRouter()

  useEffect(() => {
    // ── Auth redirect guard ──────────────────────────────────
    // TODO: Replace this sessionStorage check with your real auth
    // verification (e.g. NextAuth useSession, Supabase getUser, etc.)
    // when a proper auth backend is wired up.
    //
    // For now, the login/signup pages write 'mediinsight_authed' to
    // sessionStorage on successful (mock) login. If it's absent the
    // user hasn't signed in this browser session, so we send them to
    // the login page.
    //
    // Remove or replace this entire block once real auth is in place.
    const authed = sessionStorage.getItem('mediinsight_authed')
    if (!authed) {
      router.replace('/login')
    }
  }, [router])
  return (
    <div>
      <section className="home-hero">
        <div className="hero-eyebrow">
          <AlertTriangle size={12} />
          Educational tool only — not a diagnostic service
        </div>
        <h1>
          Understand your<br />
          <span>medical report</span>
        </h1>
        <p>
          Upload a lab report as a PDF or image. The AI reads every value, explains
          what it measures, and tells you what questions to bring to your doctor —
          all in plain language.
        </p>
        <div className="hero-actions">
          <Link href="/upload" className="btn btn-primary btn-lg">
            Upload a Report
            <ArrowRight size={18} />
          </Link>
        </div>
        <p className="hero-disclaimer">
          MediInsight AI never diagnoses conditions, never recommends medication changes,
          and always defers to your doctor for clinical decisions.
        </p>
      </section>

      <div className="home-sections">
        <section aria-labelledby="features-heading">
          <div className="section-label">Why MediInsight</div>
          <h2 className="section-title" id="features-heading">Simple. Honest. Safe.</h2>
          <div className="features-grid">
            {FEATURES.map((f, i) => (
              <div className="feature-card" key={i}>
                <div className={`feature-icon ${f.color}`}>{f.icon}</div>
                <h3>{f.title}</h3>
                <p>{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

        <section aria-labelledby="how-heading">
          <div className="section-label">Process</div>
          <h2 className="section-title" id="how-heading">Three steps</h2>
          <div className="how-steps">
            <div className="how-step">
              <div className="how-num">1</div>
              <h3>Upload</h3>
              <p>Drop your PDF or image. Files are deleted from the server right after extraction.</p>
            </div>
            <div className="how-arrow" aria-hidden="true"><ArrowRight size={20} /></div>
            <div className="how-step">
              <div className="how-num">2</div>
              <h3>Verify</h3>
              <p>Check the extracted text. Fix any OCR mistakes before sending to the AI.</p>
            </div>
            <div className="how-arrow" aria-hidden="true"><ArrowRight size={20} /></div>
            <div className="how-step">
              <div className="how-num">3</div>
              <h3>Read</h3>
              <p>Get a clear breakdown of every parameter with questions to ask your doctor.</p>
            </div>
          </div>
        </section>

        <section aria-labelledby="supported-heading">
          <div className="section-label">Coverage</div>
          <h2 className="section-title" id="supported-heading">What report types are supported?</h2>
          <div className="features-grid" style={{ marginTop: 24 }}>
            {SUPPORTED.map((item, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 14, color: 'var(--gray-700)' }}>
                <CheckCircle size={16} color="var(--green-600)" style={{ flexShrink: 0, marginTop: 2 }} />
                {item}
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="home-disclaimer-banner" aria-label="Medical disclaimer">
        <div className="home-disclaimer-inner">
          <AlertTriangle size={20} style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            <strong>Medical Disclaimer</strong>
            MediInsight AI is an educational tool that helps you understand the language in your
            lab reports. All explanations use hedged language ("may indicate", "could be associated
            with") because lab values require clinical context to interpret meaningfully.
            This tool does <em>not</em> diagnose, prescribe, or advise on any treatment.
            Please consult a licensed doctor or specialist before making any health-related decision.
          </div>
        </div>
      </section>
    </div>
  )
}
