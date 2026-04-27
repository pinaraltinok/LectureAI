import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { apiPost } from '../api'
import { formatLessonLabel } from '../utils/lessonLabel'

const EMOJIS = ['😢', '😕', '😐', '😊', '🤩']
const EMOJI_LABELS = ['Kötü', 'Geliştirilebilir', 'Fena Değil', 'İyi', 'Mükemmel']

const StudentSurvey = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const { lessonId, courseName, instructor, lessonNo, moduleSize } = location.state || {}

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
        <div style={{
          textAlign:'center', padding:'3rem', background:'#fff',
          borderRadius:'28px', border:'1px solid #f1f5f9',
          boxShadow:'0 4px 20px rgba(0,0,0,0.04)',
        }}>
          <div style={{fontSize:'4rem', marginBottom:'1rem'}}>📋</div>
          <h3 style={{fontWeight:900, color:'#1e293b', fontSize:'1.3rem'}}>Ders seçilmedi</h3>
          <p style={{color:'#94a3b8', margin:'0.5rem 0 1.5rem'}}>Lütfen önce "Derslerim" sayfasından bir ders seçin.</p>
          <button onClick={() => navigate('/student/derslerim')} style={{
            padding:'14px 32px', borderRadius:'100px', border:'none',
            background:'#1e1b4b', color:'#fff', fontSize:'0.95rem',
            fontWeight:800, cursor:'pointer', transition:'all 0.3s',
          }}
          onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.05)' }}
          onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)' }}
          >
            Derslerime Git →
          </button>
        </div>
      </div>
    )
  }

  if (isSubmitted) {
    return (
      <div style={{display:'grid', placeItems:'center', minHeight:'400px', animation:'fadeIn 0.5s ease'}}>
        <div style={{
          textAlign:'center', padding:'3.5rem', borderRadius:'32px',
          background:'linear-gradient(135deg, #1e1b4b 0%, #4338ca 100%)',
          color:'white', maxWidth:'420px', width:'100%',
          boxShadow:'0 20px 60px rgba(67, 56, 202, 0.3)',
        }}>
          <div style={{fontSize:'4.5rem', marginBottom:'1.5rem'}}>🎉</div>
          <h1 style={{fontSize:'2rem', fontWeight:900, marginBottom:'0.5rem', letterSpacing:'-0.03em'}}>Harika!</h1>
          <p style={{opacity:0.85, fontSize:'1rem', marginBottom:'2.5rem', fontWeight:500}}>
            Anketin başarıyla gönderildi. Teşekkürler! 💜
          </p>
          <button onClick={() => navigate('/student/derslerim')} style={{
            padding:'14px 36px', borderRadius:'100px', border:'none',
            background:'white', color:'#4338ca', fontSize:'1rem',
            fontWeight:800, cursor:'pointer', transition:'all 0.3s',
            boxShadow:'0 8px 20px rgba(0,0,0,0.15)',
          }}
          onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)' }}
          onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)' }}
          >
            Derslerime Dön
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth:'600px', margin:'0 auto', paddingBottom:'3rem', animation:'fadeIn 0.5s ease' }}>
      {/* Back + Anonymous */}
      <div style={{display:'flex', justifyContent:'space-between', marginBottom:'1.25rem', alignItems:'center'}}>
        <button onClick={() => navigate('/student/derslerim')} style={{
          background:'none', border:'none', color:'#64748b', fontWeight:700,
          fontSize:'0.85rem', cursor:'pointer', display:'flex', alignItems:'center', gap:'6px',
        }}>
          ← Derslerime Dön
        </button>
        <div style={{
          background:'linear-gradient(135deg, #ef4444, #f43f5e)', color:'#fff',
          padding:'5px 14px', borderRadius:'100px', fontSize:'10px', fontWeight:800,
        }}>
          🔒 ANONİM
        </div>
      </div>

      {/* Survey Card */}
      <div style={{
        background:'#fff', borderRadius:'28px', overflow:'hidden',
        border:'1px solid #f1f5f9',
        boxShadow:'0 8px 30px rgba(0,0,0,0.06)',
      }}>
        {/* Header */}
        <div style={{
          background:'linear-gradient(135deg, #1e1b4b 0%, #4338ca 100%)',
          padding:'2rem 2rem 2.5rem', color:'white', position:'relative', overflow:'hidden',
        }}>
          <div style={{position:'absolute', top:'-20px', right:'10px', fontSize:'5rem', opacity:0.08}}>📝</div>
          <p style={{margin:'0 0 4px', fontSize:'0.8rem', fontWeight:700, opacity:0.6, textTransform:'uppercase', letterSpacing:'0.1em'}}>Ders Anketi</p>
          <h2 style={{fontSize:'1.5rem', fontWeight:900, letterSpacing:'-0.03em', margin:'0 0 4px'}}>
            {courseName || 'Ders Değerlendirmesi'}
          </h2>
          <p style={{opacity:0.75, fontSize:'0.9rem', fontWeight:600, margin:0}}>
            {instructor ? `${instructor} • ${formatLessonLabel(lessonNo, moduleSize)}` : ''}
          </p>
        </div>

        <div style={{padding:'2rem'}}>
          {error && (
            <div style={{
              color:'#dc2626', background:'#fef2f2', padding:'12px 16px',
              borderRadius:'14px', fontSize:'0.85rem', marginBottom:'1.5rem',
              fontWeight:700, border:'1px solid #fecaca',
            }}>
              ⚠️ {error}
            </div>
          )}

          {/* Emoji Rating */}
          <div style={{textAlign:'center', marginBottom:'2rem'}}>
            <p style={{fontSize:'0.75rem', fontWeight:800, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:'1.25rem'}}>
              Bu dersi nasıl buldun?
            </p>
            <div style={{display:'flex', gap:'12px', justifyContent:'center'}}>
              {EMOJIS.map((emoji, idx) => {
                const num = idx + 1
                const isSelected = rating === num
                return (
                  <button
                    key={num}
                    onClick={() => setRating(num)}
                    style={{
                      width:'68px', height:'68px', borderRadius:'20px',
                      border: isSelected ? '3px solid #4338ca' : '2px solid #e2e8f0',
                      background: isSelected ? '#ede9fe' : '#fff',
                      fontSize:'2rem', cursor:'pointer',
                      transition:'all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                      transform: isSelected ? 'scale(1.15)' : 'scale(1)',
                      boxShadow: isSelected ? '0 8px 25px rgba(67, 56, 202, 0.2)' : 'none',
                      display:'grid', placeItems:'center',
                    }}
                  >
                    {emoji}
                  </button>
                )
              })}
            </div>
            <p style={{
              marginTop:'12px', fontSize:'0.9rem', fontWeight:800,
              color: rating > 0 ? '#4338ca' : '#cbd5e1',
              transition:'color 0.3s',
            }}>
              {rating > 0 ? EMOJI_LABELS[rating - 1] : 'Bir emoji seç!'}
            </p>
          </div>

          {/* Note */}
          <div style={{borderTop:'1px solid #f1f5f9', paddingTop:'1.5rem'}}>
            <p style={{fontSize:'0.75rem', fontWeight:800, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:'0.75rem'}}>
              Notun (isteğe bağlı)
            </p>
            <textarea
              placeholder="Aklına ne geliyorsa yaz... 💭"
              value={note}
              onChange={e => setNote(e.target.value)}
              style={{
                width:'100%', minHeight:'100px', border:'2px solid #f1f5f9',
                borderRadius:'16px', padding:'1rem 1.2rem', fontSize:'0.95rem',
                outline:'none', background:'#fafafe', resize:'vertical',
                transition:'all 0.3s', fontFamily:'inherit',
              }}
              onFocus={e => { e.currentTarget.style.borderColor = '#4338ca'; e.currentTarget.style.background = '#fff'; }}
              onBlur={e => { e.currentTarget.style.borderColor = '#f1f5f9'; e.currentTarget.style.background = '#fafafe'; }}
            />
          </div>

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={!canSubmit || isSubmitting}
            style={{
              marginTop:'1.5rem', width:'100%', padding:'16px',
              fontSize:'1.05rem', fontWeight:900, border:'none',
              borderRadius:'100px', cursor: canSubmit ? 'pointer' : 'not-allowed',
              background: canSubmit ? 'linear-gradient(135deg, #1e1b4b, #4338ca)' : '#f1f5f9',
              color: canSubmit ? 'white' : '#94a3b8',
              boxShadow: canSubmit ? '0 12px 30px rgba(67, 56, 202, 0.3)' : 'none',
              transition:'all 0.3s',
              letterSpacing:'-0.01em',
            }}
            onMouseEnter={e => { if (canSubmit) e.currentTarget.style.transform = 'translateY(-2px)' }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)' }}
          >
            {isSubmitting ? '⏳ Gönderiliyor...' : '🚀 Anketi Gönder'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default StudentSurvey
