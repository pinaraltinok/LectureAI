import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { apiPost } from '../api'

const StudentSurvey = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const { lessonId, courseName, instructor, lessonNo } = location.state || {}

  const [isSubmitted, setIsSubmitted] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [note, setNote] = useState('')
  const [rating, setRating] = useState(0)
  const [error, setError] = useState('')

  const canSubmit = rating > 0 && lessonId

  const handleSubmit = async () => {
    if (!canSubmit) return
    setIsSubmitting(true)
    setError('')
    try {
      await apiPost('/student/survey/submit', { lessonId, rating, note: note || null })
      setIsSubmitted(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!lessonId) {
    return (
      <div style={{display:'grid', placeItems:'center', minHeight:'400px'}}>
        <div style={{textAlign:'center', color:'#64748b'}}>
          <div style={{fontSize:'3rem', marginBottom:'1rem'}}>📋</div>
          <h3 style={{fontWeight:800, color:'#1e293b'}}>Ders seçilmedi</h3>
          <p>Lütfen önce "Derslerim" sayfasından bir ders seçin.</p>
          <button className="primary-btn" style={{marginTop:'1rem', padding:'0.75rem 2rem'}} onClick={() => navigate('/student/derslerim')}>Derslerime Git</button>
        </div>
      </div>
    )
  }

  if (isSubmitted) {
    return (
      <div className="report-card-internal" style={{ maxWidth: '400px', margin: '100px auto', textAlign: 'center', padding: '3rem', border: 'none', background: 'linear-gradient(135deg, #6366f1, #a855f7)', color: 'white' }}>
        <div style={{ fontSize: '3.5rem', marginBottom: '1.5rem' }}>🦁</div>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 800, marginBottom: '0.5rem' }}>Başarılı!</h1>
        <p style={{ opacity: 0.9, fontSize: '0.95rem', marginBottom: '2.5rem' }}>Anketiniz başarıyla gönderildi. Teşekkürler!</p>
        <button className="primary-btn" style={{ margin: '0 auto', padding: '0.75rem 2.5rem', background: 'white', color: 'var(--primary)' }} onClick={() => navigate('/student/derslerim')}>Derslerime Dön</button>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '80vh', paddingBottom: '3rem', position: 'relative' }}>
      <div style={{ maxWidth: '640px', margin: '0 auto', animation: 'fadeIn 0.5s ease' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem', alignItems: 'center' }}>
          <button onClick={() => navigate('/student/derslerim')} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontWeight: 700, fontSize: '12px', cursor: 'pointer' }}>
            ← DERSLERİME DÖN
          </button>
          <div style={{ background: 'linear-gradient(135deg, #ef4444, #f43f5e)', color: '#fff', padding: '4px 12px', borderRadius: '100px', fontSize: '9px', fontWeight: 800 }}>ANONİM MOD AKTİF</div>
        </div>

        <div className="report-card-internal" style={{ padding: '0', overflow: 'hidden', borderRadius: '16px', boxShadow: '0 12px 32px -8px rgba(0, 0, 0, 0.08)' }}>
          {/* Header */}
          <div style={{ background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)', padding: '2.5rem 2rem', color: 'white', position: 'relative' }}>
            <h2 style={{ fontSize: '1.8rem', fontWeight: 800, letterSpacing: '-0.03em', marginBottom: '0.2rem' }}>{courseName || 'Ders Anketi'}</h2>
            <p style={{ opacity: 0.9, fontSize: '1rem', fontWeight: 600 }}>{instructor ? `${instructor} • Ders ${lessonNo || ''}` : 'Ders değerlendirmesi'}</p>
          </div>

          <div style={{ padding: '2.5rem 2rem' }}>
            {error && (
              <div style={{color: '#f43f5e', background: '#ffe4e6', padding: '0.75rem 1.5rem', borderRadius: '12px', fontSize: '0.9rem', marginBottom: '1.5rem', fontWeight: 600}}>
                {error}
              </div>
            )}

            {/* Rating */}
            <div style={{ marginBottom: '2rem' }}>
              <label style={{ fontSize: '11px', fontWeight: 800, color: '#64748b', display: 'block', marginBottom: '1rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Dersi Puanlayın (1-5)
              </label>
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                {[1, 2, 3, 4, 5].map(num => (
                  <button
                    key={num}
                    onClick={() => setRating(num)}
                    style={{
                      width: '64px', height: '64px', borderRadius: '16px',
                      border: rating === num ? 'none' : '2px solid #e2e8f0',
                      background: rating === num ? 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)' : '#fff',
                      color: rating === num ? 'white' : '#64748b',
                      fontSize: '1.5rem', fontWeight: 900, cursor: 'pointer',
                      transition: 'all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                      boxShadow: rating === num ? '0 8px 25px rgba(99, 102, 241, 0.4)' : 'none',
                      transform: rating === num ? 'scale(1.1)' : 'scale(1)',
                    }}
                  >
                    {num}
                  </button>
                ))}
              </div>
              <div style={{ textAlign: 'center', marginTop: '12px', fontSize: '0.85rem', fontWeight: 700, color: rating > 0 ? '#6366f1' : '#94a3b8' }}>
                {rating === 0 ? 'Henüz puan verilmedi' : rating <= 2 ? 'Geliştirilmeli' : rating === 3 ? 'Orta' : rating === 4 ? 'İyi' : 'Mükemmel'}
              </div>
            </div>

            {/* Note */}
            <div style={{ marginTop: '2rem', borderTop: '1px solid #f1f5f9', paddingTop: '2rem' }}>
              <label style={{ fontSize: '11px', fontWeight: 800, color: '#64748b', display: 'block', marginBottom: '1rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Anonim Not (İsteğe bağlı)
              </label>
              <textarea
                placeholder="Deneyiminizi anonim olarak paylaşın..."
                value={note}
                onChange={(e) => setNote(e.target.value)}
                style={{
                  width: '100%', minHeight: '120px', border: '1px solid #e2e8f0', borderRadius: '16px',
                  padding: '1.25rem', fontSize: '1rem', outline: 'none', background: '#f8fafc',
                  transition: 'all 0.3s ease',
                }}
                onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.background = '#fff'; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.background = '#f8fafc'; }}
              ></textarea>

              <button
                className="primary-btn"
                onClick={handleSubmit}
                disabled={!canSubmit || isSubmitting}
                style={{
                  marginTop: '2rem', width: '100%', padding: '1.25rem', fontSize: '1.1rem', fontWeight: 800,
                  background: canSubmit ? 'linear-gradient(135deg, #6366f1, #a855f7)' : '#e2e8f0',
                  color: canSubmit ? 'white' : '#94a3b8', border: 'none', borderRadius: '16px',
                  cursor: canSubmit ? 'pointer' : 'not-allowed',
                  boxShadow: canSubmit ? '0 15px 30px -5px rgba(99, 102, 241, 0.4)' : 'none',
                }}
              >
                {isSubmitting ? 'GÖNDERİLİYOR...' : 'ANKETİ GÖNDER'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default StudentSurvey
