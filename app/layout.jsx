import './globals.css'
import Navbar from '../components/Navbar.jsx'
import Footer from '../components/Footer.jsx'

export const metadata = {
  title: 'MediInsight AI — Medical Report Analyzer',
  description:
    'Upload your medical report and get a plain-language explanation powered by AI. Not a diagnostic tool — always consult your doctor.',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
      </head>
      <body>
        <div className="app-shell">
          <Navbar />
          <main className="main-content">{children}</main>
          <Footer />
        </div>
      </body>
    </html>
  )
}
