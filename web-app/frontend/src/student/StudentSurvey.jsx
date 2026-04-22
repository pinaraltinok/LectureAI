import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { apiPost } from '../api'

const SurveySection = ({ title, value, onChange, isSubmitted }) => (
  <div style={{
    marginBottom: '0.75rem', padding: '1rem', background: '#fff', borderRadius: '12px',
    border: '1px solid var(--border)', opacity: isSubmitted ? 0.6 : 1,
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    transition: '0.2s'
  }}>
    <h4 style={{ fontSize: '13px', fontWeight: 600, color: '#334155', maxWidth: '300px' }}>
      {title}
    </h4>
    <div style={{ display: 'flex', gap: '6px' }}>
      {[1, 2, 3, 4, 5].map(num => (
        <button
          key={num}
          onClick={() => !isSubmitted && onChange(num)}
          style={{
            width: '36px', height: '36px', borderRadius: '10px',
            border: value === num ? 'none' : '1px solid var(--border)',
            background: value === num ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : '#fff',
            color: value === num ? 'white' : 'var(--text-muted)',
            fontSize: '13px', fontWeight: 800, cursor: isSubmitted ? 'default' : 'pointer',
            transition: 'all 0.2s ease',
            boxShadow: value === num ? '0 4px 12px rgba(16, 185, 129, 0.4)' : 'none'
          }}
        >
          {num}
        </button>
      ))}
    </div>
  </div>
)

const StudentSurvey = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const { lessonId, courseName, instructor } = location.state || {}

  const [isSubmitted, setIsSubmitted] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [comment, setComment] = useState('')
  const [error, setError] = useState('')
  const [ratings, setRatings] = useState({ clarity: 0, support: 0, energy: 0, satisfaction: 0 })

  const canSubmit = ratings.clarity && ratings.support && ratings.energy && ratings.satisfaction && lessonId

  const handleSubmit = async () => {
    if (!canSubmit) return
    setIsSubmitting(true)
    setError('')

    try {
      await apiPost('/student/survey/submit', {
        lessonId,
        contentQuality: ratings.clarity,
        teachingMethod: ratings.support,
        engagement: ratings.energy,
        materials: ratings.satisfaction,
        overall: Math.round((ratings.clarity + ratings.support + ratings.energy + ratings.satisfaction) / 4),
        anonymousComment: comment || null,
      })
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
        <p style={{ opacity: 0.9, fontSize: '0.95rem', marginBottom: '2.5rem' }}>
          Anketiniz başarıyla gönderildi. Teşekkürler!
        </p>
        <button className="primary-btn" style={{ margin: '0 auto', padding: '0.75rem 2.5rem', background: 'white', color: 'var(--primary)' }} onClick={() => navigate('/student/derslerim')}>Derslerime Dön</button>
      </div>
    )
  }

  return (
    <div style={{
      minHeight: '80vh', paddingBottom: '3rem',
      background: 'radial-gradient(at 0% 0%, rgba(99, 102, 241, 0.03) 0px, transparent 50%), radial-gradient(at 100% 100%, rgba(16, 185, 129, 0.03) 0px, transparent 50%)',
      position: 'relative'
    }}>
      {/* Background Decorative Elements for Depth */}
      <div style={{ position: 'absolute', top: '10%', left: '-5%', width: '300px', height: '300px', background: 'var(--primary)', borderRadius: '50%', opacity: 0.02, filter: 'blur(80px)', pointerEvents: 'none' }}></div>
      <div style={{ position: 'absolute', bottom: '10%', right: '-5%', width: '250px', height: '250px', background: '#10b981', borderRadius: '50%', opacity: 0.02, filter: 'blur(80px)', pointerEvents: 'none' }}></div>

      <div style={{ maxWidth: '740px', margin: '0 auto', animation: 'fadeIn 0.5s ease', position: 'relative', zIndex: 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem', alignItems: 'center' }}>
          <button onClick={() => navigate('/student/derslerim')} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontWeight: 700, fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span>←</span> DERSLERİME DÖN
          </button>
          <div style={{ background: 'linear-gradient(135deg, #ef4444, #f43f5e)', color: '#fff', padding: '4px 12px', borderRadius: '100px', fontSize: '9px', fontWeight: 800, boxShadow: '0 4px 10px rgba(239, 68, 68, 0.2)' }}>ANONİM MOD AKTİF</div>
        </div>

        <div className="report-card-internal" style={{
          padding: '0', overflow: 'hidden', background: '#fff',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.08), 0 0 1px 0 rgba(0,0,0,0.1)',
          border: '1px solid rgba(0,0,0,0.03)',
          borderRadius: '24px'
        }}>
          {/* Vibrant Header with Depth */}
          <div style={{
            background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
            padding: '2.5rem 2rem', color: 'white', position: 'relative'
          }}>
            <h2 style={{ fontSize: '1.8rem', fontWeight: 800, letterSpacing: '-0.03em', marginBottom: '0.2rem' }}>{courseName || 'Ders Anketi'}</h2>
            <p style={{ opacity: 0.9, fontSize: '1rem', fontWeight: 600 }}>{instructor ? `${instructor} için değerlendirme` : 'Ders değerlendirmesi'}</p>
            <div style={{ position: 'absolute', right: '2.5rem', bottom: '1.5rem', fontSize: '5rem', opacity: 0.1, pointerEvents: 'none', transform: 'rotate(-5deg)' }}>✏️</div>
          </div>

          <div style={{ padding: '2.5rem 2rem' }}>
            {error && (
              <div style={{color: '#f43f5e', background: '#ffe4e6', padding: '0.75rem 1.5rem', borderRadius: '12px', fontSize: '0.9rem', marginBottom: '1.5rem', fontWeight: 600}}>
                {error}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <SurveySection title="İçerik Kalitesi & Anlatım Netliği" value={ratings.clarity} onChange={(v) => setRatings({ ...ratings, clarity: v })} />
              <SurveySection title="İletişim & Destek Hızı" value={ratings.support} onChange={(v) => setRatings({ ...ratings, support: v })} />
              <SurveySection title="Ders Enerjisi & Motivasyon" value={ratings.energy} onChange={(v) => setRatings({ ...ratings, energy: v })} />
              <SurveySection title="Genel Memnuniyet Skoru" value={ratings.satisfaction} onChange={(v) => setRatings({ ...ratings, satisfaction: v })} />
            </div>

            <div style={{ marginTop: '3rem', borderTop: '1px solid #f1f5f9', paddingTop: '2.5rem' }}>
              <label style={{ fontSize: '11px', fontWeight: 800, color: '#64748b', display: 'block', marginBottom: '1rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Eğitmene özel anonim geri bildirim
              </label>
              <textarea
                placeholder="Deneyiminizi anonim olarak paylaşın..."
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                style={{
                  width: '100%', minHeight: '120px', border: '1px solid #e2e8f0', borderRadius: '16px',
                  padding: '1.25rem', fontSize: '1rem', outline: 'none', background: '#f8fafc',
                  transition: 'all 0.3s ease', boxShadow: 'inset 0 2px 4px 0 rgba(0,0,0,0.02)'
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = 'var(--primary)';
                  e.currentTarget.style.background = '#fff';
                  e.currentTarget.style.boxShadow = '0 0 0 4px rgba(99, 102, 241, 0.05)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = '#e2e8f0';
                  e.currentTarget.style.background = '#f8fafc';
                  e.currentTarget.style.boxShadow = 'inset 0 2px 4px 0 rgba(0,0,0,0.02)';
                }}
              ></textarea>

              <button
                className="primary-btn"
                onClick={handleSubmit}
                disabled={!canSubmit || isSubmitting}
                style={{
                  marginTop: '2.5rem', width: '100%', padding: '1.25rem', fontSize: '1.1rem', fontWeight: 800,
                  background: canSubmit ? 'linear-gradient(135deg, #6366f1, #a855f7)' : '#e2e8f0',
                  color: canSubmit ? 'white' : '#94a3b8',
                  border: 'none',
                  boxShadow: canSubmit ? '0 15px 30px -5px rgba(99, 102, 241, 0.4)' : 'none',
                  borderRadius: '16px',
                  cursor: canSubmit ? 'pointer' : 'not-allowed',
                  transition: 'all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
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
