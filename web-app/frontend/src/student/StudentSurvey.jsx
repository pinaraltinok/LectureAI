import { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ClipboardCheck, Star, ArrowLeft, Lock, Send, Loader2, CheckCircle2, MessageCircle, Calendar, BookOpen, ChevronRight, Sparkles } from 'lucide-react'
import { apiPost, apiGet } from '../api'
import { formatLessonLabel } from '../utils/lessonLabel'

const RATING_ICONS = [
  { label: 'Kötü', color: '#ef4444' },
  { label: 'Geliştirilebilir', color: '#f59e0b' },
  { label: 'Fena Değil', color: '#eab308' },
  { label: 'İyi', color: '#22c55e' },
  { label: 'Mükemmel', color: '#6366f1' },
]

const StudentSurvey = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const { lessonId, courseName, instructor, lessonNo, moduleSize } = location.state || {}

  const [isSubmitted, setIsSubmitted] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [note, setNote] = useState('')
  const [rating, setRating] = useState(0)
  const [error, setError] = useState('')

  // Past surveys state
  const [pastSurveys, setPastSurveys] = useState([])
  const [loadingSurveys, setLoadingSurveys] = useState(true)

  const canSubmit = rating > 0 && lessonId

  useEffect(() => {
    if (!lessonId) {
      apiGet('/student/surveys')
        .then(data => setPastSurveys(data))
        .catch(() => setPastSurveys([]))
        .finally(() => setLoadingSurveys(false))
    }
  }, [lessonId])

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

  // ── No lesson selected → Show past surveys ──
  if (!lessonId) {
    return (
      <div className="dashboard-page" style={{ animation: 'fadeIn 0.5s ease' }}>
        {/* Header Banner */}
        <div className="welcome-banner" style={{
          background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #4338ca 100%)',
          marginBottom: '2rem',
          animation: 'cardPopIn 0.6s cubic-bezier(0.22, 1, 0.36, 1) 0.05s both',
        }}>
          <div className="banner-particle"></div>
          <div className="banner-particle"></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                <span style={{ fontSize: '0.7rem', fontWeight: 800, padding: '4px 12px', borderRadius: '100px', background: 'rgba(99, 102, 241, 0.3)', color: '#c7d2fe', letterSpacing: '0.08em' }}>
                  DERS ANKETLERİ
                </span>
              </div>
              <h2 style={{ fontSize: '1.6rem', fontWeight: 950, letterSpacing: '-0.03em', margin: '0 0 0.5rem', lineHeight: 1.2 }}>
                Gönderilen Anketler <span style={{ display: 'inline-flex', verticalAlign: 'middle' }}><Sparkles size={20} /></span>
              </h2>
              <p style={{ fontSize: '0.95rem', opacity: 0.6, fontWeight: 500, margin: 0 }}>
                Dersler için gönderdiğin tüm anketleri burada görebilirsin
              </p>
            </div>
            <div style={{
              width: '80px', height: '80px', borderRadius: '20px',
              background: 'rgba(99, 102, 241, 0.15)', backdropFilter: 'blur(10px)',
              display: 'grid', placeItems: 'center',
              animation: 'rotateFloat 4s ease-in-out infinite',
              border: '1px solid rgba(99, 102, 241, 0.2)',
            }}>
              <ClipboardCheck size={36} />
            </div>
          </div>
          {/* Quick stat */}
          <div style={{
            display: 'flex', gap: '1.5rem', marginTop: '1.5rem',
            paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.1)'
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              padding: '8px 16px', borderRadius: '14px',
              background: 'rgba(255,255,255,0.08)', backdropFilter: 'blur(4px)',
              animation: 'slideInRight 0.4s ease 0.3s both',
            }}>
              <span style={{ color: 'rgba(255,255,255,0.9)' }}><ClipboardCheck size={18} /></span>
              <div>
                <span style={{ fontSize: '1.1rem', fontWeight: 900, display: 'block', lineHeight: 1 }}>{pastSurveys.length}</span>
                <span style={{ fontSize: '0.6rem', fontWeight: 700, opacity: 0.5, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Gönderilen Anket</span>
              </div>
            </div>
          </div>
        </div>

        {/* Survey List or Empty State */}
        {loadingSurveys ? (
          <div style={{ display: 'grid', placeItems: 'center', minHeight: '200px' }}>
            <div className="premium-loader">
              <div className="loader-ring"></div>
              <p style={{ fontWeight: 700, color: '#64748b', fontSize: '0.9rem' }}>Anketler yükleniyor...</p>
            </div>
          </div>
        ) : pastSurveys.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: '4rem 2rem',
            background: 'var(--bg-card)', borderRadius: '24px',
            border: '1px solid var(--border)',
            animation: 'cardPopIn 0.5s ease 0.3s both',
          }}>
            <div style={{ marginBottom: '1.5rem' }}><ClipboardCheck size={56} color="#cbd5e1" /></div>
            <h3 style={{ fontWeight: 900, color: '#1e293b', fontSize: '1.3rem', marginBottom: '0.5rem' }}>Henüz anket göndermedin</h3>
            <p style={{ color: '#94a3b8', fontSize: '0.95rem', marginBottom: '2rem' }}>
              Derslerim sayfasından bir dersin "Anket" butonuna tıklayarak değerlendirme yapabilirsin.
            </p>
            <button onClick={() => navigate('/student/derslerim')} className="primary-btn" style={{
              padding: '14px 36px', borderRadius: '100px', fontSize: '0.95rem',
            }}>
              <BookOpen size={16} style={{ marginRight: '8px' }} /> Derslerime Git
            </button>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '1rem' }}>
            {pastSurveys.map((survey, idx) => (
              <div
                key={survey.id}
                style={{
                  background: 'var(--bg-card)',
                  backdropFilter: 'blur(16px)',
                  borderRadius: '20px',
                  border: '1px solid var(--border)',
                  padding: '1.5rem 2rem',
                  transition: 'all 0.3s ease',
                  animation: `cardPopIn 0.4s ease ${0.1 + idx * 0.06}s both`,
                  cursor: 'default',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.transform = 'translateY(-2px)'
                  e.currentTarget.style.boxShadow = '0 12px 30px rgba(99,102,241,0.08)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.transform = 'translateY(0)'
                  e.currentTarget.style.boxShadow = 'none'
                }}
              >
                <div className="responsive-survey-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                      <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 900, color: '#1e293b' }}>
                        {survey.courseName}
                      </h4>
                      <span style={{
                        fontSize: '9px', fontWeight: 800, padding: '3px 10px', borderRadius: '100px',
                        background: '#dcfce7', color: '#16a34a',
                      }}>
                        <CheckCircle2 size={10} style={{ marginRight: '3px', verticalAlign: 'middle' }} />
                        GÖNDERİLDİ
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <BookOpen size={13} /> {formatLessonLabel(survey.lessonNo, survey.moduleSize)}
                      </span>
                      <span style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Calendar size={13} /> {new Date(survey.createdAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                      <span style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600 }}>
                        {survey.teacherName}
                      </span>
                    </div>
                    {survey.note && (
                      <div style={{
                        marginTop: '12px', padding: '10px 14px', borderRadius: '12px',
                        background: '#f8fafc', border: '1px solid #f1f5f9',
                        fontSize: '0.85rem', color: '#475569', fontStyle: 'italic',
                        display: 'flex', alignItems: 'flex-start', gap: '8px',
                      }}>
                        <MessageCircle size={14} style={{ flexShrink: 0, marginTop: '2px', color: '#94a3b8' }} />
                        {survey.note}
                      </div>
                    )}
                  </div>

                  {/* Rating Display */}
                  <div className="responsive-survey-rating" style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                    padding: '12px 18px', borderRadius: '16px',
                    background: `${RATING_ICONS[survey.rating - 1]?.color}10`,
                    marginLeft: '1.5rem', flexShrink: 0,
                  }}>
                    <div style={{ display: 'flex', gap: '3px', marginBottom: '4px' }}>
                      {[1, 2, 3, 4, 5].map(s => (
                        <Star
                          key={s}
                          size={16}
                          fill={s <= survey.rating ? RATING_ICONS[survey.rating - 1]?.color : 'none'}
                          color={s <= survey.rating ? RATING_ICONS[survey.rating - 1]?.color : '#cbd5e1'}
                          strokeWidth={s <= survey.rating ? 0 : 1.5}
                        />
                      ))}
                    </div>
                    <span style={{
                      fontSize: '0.7rem', fontWeight: 800,
                      color: RATING_ICONS[survey.rating - 1]?.color,
                    }}>
                      {RATING_ICONS[survey.rating - 1]?.label}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  // ── Success State ──
  if (isSubmitted) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: '400px', animation: 'fadeIn 0.5s ease' }}>
        <div style={{
          textAlign: 'center', padding: '3.5rem', borderRadius: '32px',
          background: 'linear-gradient(135deg, #1e1b4b 0%, #4338ca 100%)',
          color: 'white', maxWidth: '420px', width: '100%',
          boxShadow: '0 20px 60px rgba(67, 56, 202, 0.3)',
        }}>
          <div style={{ marginBottom: '1.5rem' }}><CheckCircle2 size={64} /></div>
          <h1 style={{ fontSize: '2rem', fontWeight: 900, marginBottom: '0.5rem', letterSpacing: '-0.03em' }}>Harika!</h1>
          <p style={{ opacity: 0.85, fontSize: '1rem', marginBottom: '2.5rem', fontWeight: 500 }}>
            Anketin başarıyla gönderildi. Teşekkürler!
          </p>
          <button onClick={() => navigate('/student/anket')} style={{
            padding: '14px 36px', borderRadius: '100px', border: 'none',
            background: 'white', color: '#4338ca', fontSize: '1rem',
            fontWeight: 800, cursor: 'pointer', transition: 'all 0.3s',
            boxShadow: '0 8px 20px rgba(0,0,0,0.15)',
          }}
          onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)' }}
          onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)' }}
          >
            Anketlerime Dön
          </button>
        </div>
      </div>
    )
  }

  // ── Survey Form ──
  return (
    <div style={{ maxWidth: '600px', margin: '0 auto', paddingBottom: '3rem', animation: 'fadeIn 0.5s ease' }}>
      {/* Back + Anonymous */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.25rem', alignItems: 'center' }}>
        <button onClick={() => navigate('/student/derslerim')} style={{
          background: 'none', border: 'none', color: '#64748b', fontWeight: 700,
          fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
        }}>
          <ArrowLeft size={16} /> Derslerime Dön
        </button>
        <div style={{
          background: 'linear-gradient(135deg, #ef4444, #f43f5e)', color: '#fff',
          padding: '5px 14px', borderRadius: '100px', fontSize: '10px', fontWeight: 800,
          display: 'flex', alignItems: 'center', gap: '4px',
        }}>
          <Lock size={10} /> ANONİM
        </div>
      </div>

      {/* Survey Card */}
      <div style={{
        background: '#fff', borderRadius: '28px', overflow: 'hidden',
        border: '1px solid #f1f5f9',
        boxShadow: '0 8px 30px rgba(0,0,0,0.06)',
      }}>
        {/* Header */}
        <div style={{
          background: 'linear-gradient(135deg, #1e1b4b 0%, #4338ca 100%)',
          padding: '2rem 2rem 2.5rem', color: 'white', position: 'relative', overflow: 'hidden',
        }}>
          <div style={{ position: 'absolute', top: '-10px', right: '20px', opacity: 0.08 }}>
            <ClipboardCheck size={80} />
          </div>
          <p style={{ margin: '0 0 4px', fontSize: '0.8rem', fontWeight: 700, opacity: 0.6, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Ders Anketi</p>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 900, letterSpacing: '-0.03em', margin: '0 0 4px' }}>
            {courseName || 'Ders Değerlendirmesi'}
          </h2>
          <p style={{ opacity: 0.75, fontSize: '0.9rem', fontWeight: 600, margin: 0 }}>
            {instructor ? `${instructor} • ${formatLessonLabel(lessonNo, moduleSize)}` : ''}
          </p>
        </div>

        <div style={{ padding: '2rem' }}>
          {error && (
            <div style={{
              color: '#dc2626', background: '#fef2f2', padding: '12px 16px',
              borderRadius: '14px', fontSize: '0.85rem', marginBottom: '1.5rem',
              fontWeight: 700, border: '1px solid #fecaca',
            }}>
              {error}
            </div>
          )}

          {/* Star Rating */}
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <p style={{ fontSize: '0.75rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '1.25rem' }}>
              Bu dersi nasıl buldun?
            </p>
            <div className="responsive-star-grid" style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
              {[1, 2, 3, 4, 5].map(num => {
                const isSelected = rating >= num
                const hoverColor = RATING_ICONS[(rating || num) - 1]?.color || '#6366f1'
                return (
                  <button
                    key={num}
                    onClick={() => setRating(num)}
                    style={{
                      width: '64px', height: '64px', borderRadius: '18px',
                      border: isSelected ? `2px solid ${hoverColor}` : '2px solid #e2e8f0',
                      background: isSelected ? `${hoverColor}10` : '#fff',
                      cursor: 'pointer',
                      transition: 'all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                      transform: isSelected ? 'scale(1.1)' : 'scale(1)',
                      boxShadow: isSelected ? `0 8px 25px ${hoverColor}25` : 'none',
                      display: 'grid', placeItems: 'center',
                    }}
                  >
                    <Star
                      size={28}
                      fill={isSelected ? hoverColor : 'none'}
                      color={isSelected ? hoverColor : '#cbd5e1'}
                      strokeWidth={isSelected ? 0 : 1.5}
                    />
                  </button>
                )
              })}
            </div>
            <p style={{
              marginTop: '12px', fontSize: '0.9rem', fontWeight: 800,
              color: rating > 0 ? RATING_ICONS[rating - 1]?.color : '#cbd5e1',
              transition: 'color 0.3s',
            }}>
              {rating > 0 ? RATING_ICONS[rating - 1]?.label : 'Bir puan seç!'}
            </p>
          </div>

          {/* Note */}
          <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '1.5rem' }}>
            <p style={{ fontSize: '0.75rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.75rem' }}>
              Notun (isteğe bağlı)
            </p>
            <textarea
              placeholder="Aklına ne geliyorsa yaz..."
              value={note}
              onChange={e => setNote(e.target.value)}
              style={{
                width: '100%', minHeight: '100px', border: '2px solid #f1f5f9',
                borderRadius: '16px', padding: '1rem 1.2rem', fontSize: '0.95rem',
                outline: 'none', background: '#fafafe', resize: 'vertical',
                transition: 'all 0.3s', fontFamily: 'inherit',
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
              marginTop: '1.5rem', width: '100%', padding: '16px',
              fontSize: '1.05rem', fontWeight: 900, border: 'none',
              borderRadius: '100px', cursor: canSubmit ? 'pointer' : 'not-allowed',
              background: canSubmit ? 'linear-gradient(135deg, #1e1b4b, #4338ca)' : '#f1f5f9',
              color: canSubmit ? 'white' : '#94a3b8',
              boxShadow: canSubmit ? '0 12px 30px rgba(67, 56, 202, 0.3)' : 'none',
              transition: 'all 0.3s',
              letterSpacing: '-0.01em',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
            }}
            onMouseEnter={e => { if (canSubmit) e.currentTarget.style.transform = 'translateY(-2px)' }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)' }}
          >
            {isSubmitting ? (
              <><Loader2 size={18} className="spin" /> Gönderiliyor...</>
            ) : (
              <><Send size={18} /> Anketi Gönder</>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

export default StudentSurvey
