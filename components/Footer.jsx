export default function Footer() {
  return (
    <footer className="footer" role="contentinfo">
      <div className="footer-inner">
        <p><strong>MediInsight AI</strong> — Educational medical report explainer.</p>
        <p>Not a diagnostic tool. Never provides diagnoses, prescriptions, or treatment advice. Always consult a qualified healthcare professional for medical decisions.</p>
        <p style={{ marginTop: 12, fontSize: 12, color: 'var(--gray-500)' }}>Uploaded files are deleted immediately after text extraction. No data is stored.</p>
      </div>
    </footer>
  )
}
