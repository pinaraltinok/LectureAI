import React from 'react'

class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error, errorInfo) {
    console.error('[AppErrorBoundary]', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#0f172a', padding: '1rem' }}>
          <div style={{ width: 'min(520px, 95vw)', textAlign: 'center', background: '#111827', border: '1px solid rgba(148,163,184,0.25)', borderRadius: '16px', padding: '1.5rem' }}>
            <h2 style={{ margin: 0, color: '#f8fafc', fontSize: '1.2rem' }}>Bir hata oluştu</h2>
            <p style={{ margin: '0.65rem 0 1rem', color: '#94a3b8', fontSize: '0.92rem' }}>
              Uygulama beklenmedik bir hataya girdi. Lütfen sayfayı yenileyin.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{ border: 'none', borderRadius: '11px', padding: '0.6rem 1rem', fontWeight: 700, cursor: 'pointer', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff' }}
            >
              Sayfayı Yenile
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

export default AppErrorBoundary
