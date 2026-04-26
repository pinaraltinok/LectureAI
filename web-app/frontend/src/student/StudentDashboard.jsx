import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiGet } from '../api'

const COURSE_THEMES = [
  { bg: '#6366f1', gradient: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)', light: '#ede9fe', icon: '🐍' },
  { bg: '#f43f5e', gradient: 'linear-gradient(135deg, #f43f5e 0%, #ec4899 100%)', light: '#ffe4e6', icon: '🎮' },
  { bg: '#10b981', gradient: 'linear-gradient(135deg, #10b981 0%, #34d399 100%)', light: '#d1fae5', icon: '🤖' },
  { bg: '#f59e0b', gradient: 'linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%)', light: '#fef3c7', icon: '🎨' },
  { bg: '#06b6d4', gradient: 'linear-gradient(135deg, #06b6d4 0%, #22d3ee 100%)', light: '#cffafe', icon: '💻' },
  { bg: '#8b5cf6', gradient: 'linear-gradient(135deg, #8b5cf6 0%, #a78bfa 100%)', light: '#ede9fe', icon: '🧩' },
]

const StudentDashboard = () => {
  const navigate = useNavigate()
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    apiGet('/student/courses')
      .then(data => setGroups(data))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  const goToSurvey = (lesson, group) => {
    navigate('/student/anket', { state: { lessonId: lesson.lessonId, courseName: group.courseName, instructor: group.teacherName, lessonNo: lesson.lessonNo } })
  }

  if (loading) {
    return (
      <div style={{display:'grid', placeItems:'center', minHeight:'400px'}}>
        <div style={{textAlign:'center', color:'#64748b'}}>
          <div style={{fontSize:'3rem', marginBottom:'1rem', animation: 'bounce 1s infinite'}}>🚀</div>
          <p style={{fontWeight:700, fontSize:'1.1rem'}}>Dersler yükleniyor...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{display:'grid', placeItems:'center', minHeight:'400px'}}>
        <div style={{textAlign:'center', color:'#f43f5e'}}>
          <div style={{fontSize:'3rem', marginBottom:'1rem'}}>😵</div>
          <p style={{fontWeight:800, fontSize:'1.1rem'}}>{error}</p>
        </div>
      </div>
    )
  }

  if (groups.length === 0) {
    return (
      <div style={{display:'grid', placeItems:'center', minHeight:'400px'}}>
        <div style={{textAlign:'center', padding:'3rem'}}>
          <div style={{fontSize:'4rem', marginBottom:'1.5rem'}}>📚</div>
          <h3 style={{fontWeight:900, color:'#1e293b', fontSize:'1.5rem', marginBottom:'0.5rem'}}>Henüz kayıtlı ders yok</h3>
          <p style={{color:'#94a3b8', fontSize:'1rem'}}>Bir gruba kaydolduğunda burada görünecek!</p>
        </div>
      </div>
    )
  }

  return (
    <div style={{animation: 'fadeIn 0.5s ease'}}>
      {/* Welcome Banner */}
      <div style={{
        background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #4338ca 100%)',
        borderRadius: '28px', padding: '2.5rem', marginBottom: '2rem',
        position: 'relative', overflow: 'hidden', color: 'white',
      }}>
        <div style={{ position: 'absolute', top: '-40px', right: '-20px', fontSize: '8rem', opacity: 0.08, transform: 'rotate(15deg)' }}>🎓</div>
        <h2 style={{fontSize:'1.8rem', fontWeight:900, letterSpacing:'-0.03em', margin:'0 0 0.5rem'}}>
          Hoş geldin! 👋
        </h2>
        <p style={{fontSize:'1rem', opacity:0.8, fontWeight:500, margin:0}}>
          {groups.length} aktif kursun var. Derslerini takip et, anketlerini doldur!
        </p>
      </div>

      {/* Course Cards Grid */}
      <div style={{display:'grid', gridTemplateColumns: groups.length === 1 ? '1fr' : 'repeat(auto-fill, minmax(420px, 1fr))', gap:'1.5rem'}}>
        {groups.map((group, gIdx) => {
          const theme = COURSE_THEMES[gIdx % COURSE_THEMES.length]
          return (
            <div key={group.groupId} style={{
              background: '#fff', borderRadius: '28px', overflow: 'hidden',
              border: '1px solid #f1f5f9',
              boxShadow: '0 4px 20px rgba(0,0,0,0.04)',
              transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = '0 20px 40px rgba(0,0,0,0.08)'; }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,0.04)'; }}
            >
              {/* Course Header */}
              <div style={{
                background: theme.gradient, padding: '1.75rem 2rem',
                position: 'relative', overflow: 'hidden',
              }}>
                <div style={{ position: 'absolute', top: '-15px', right: '15px', fontSize: '4rem', opacity: 0.15 }}>{theme.icon}</div>
                <div style={{display:'flex', alignItems:'center', gap:'1rem', position:'relative'}}>
                  <div style={{
                    width:'52px', height:'52px', background:'rgba(255,255,255,0.2)',
                    borderRadius:'16px', display:'grid', placeItems:'center',
                    fontSize:'1.6rem', backdropFilter: 'blur(8px)',
                  }}>
                    {theme.icon}
                  </div>
                  <div>
                    <h3 style={{margin:0, fontSize:'1.3rem', fontWeight:900, color:'#fff', letterSpacing:'-0.02em'}}>
                      {group.courseName}
                    </h3>
                    <p style={{margin:'4px 0 0', fontSize:'0.85rem', color:'rgba(255,255,255,0.8)', fontWeight:600}}>
                      {group.teacherName} • {group.age} yaş
                    </p>
                  </div>
                </div>
                {group.schedule && (
                  <div style={{
                    display:'inline-flex', alignItems:'center', gap:'6px',
                    marginTop:'12px', padding:'6px 14px', borderRadius:'100px',
                    background:'rgba(255,255,255,0.15)', backdropFilter:'blur(4px)',
                    fontSize:'0.78rem', fontWeight:700, color:'#fff',
                  }}>
                    📅 {group.schedule}
                  </div>
                )}
              </div>

              {/* Lessons */}
              <div style={{padding: '1.5rem'}}>
                <div style={{display:'flex', gap:'6px', marginBottom:'12px', alignItems:'center'}}>
                  <span style={{fontSize:'0.7rem', fontWeight:800, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.08em'}}>
                    DERSLER
                  </span>
                  <span style={{
                    fontSize:'10px', fontWeight:800, padding:'2px 8px',
                    borderRadius:'100px', background:theme.light, color:theme.bg,
                  }}>
                    {group.lessons.length}
                  </span>
                </div>
                <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(180px, 1fr))', gap:'10px'}}>
                  {group.lessons.map(lesson => (
                    <div
                      key={lesson.lessonId}
                      style={{
                        padding:'1rem 1.1rem', borderRadius:'16px',
                        background: lesson.hasSurvey ? '#f0fdf4' : '#f8fafc',
                        border: `2px solid ${lesson.hasSurvey ? '#bbf7d0' : '#f1f5f9'}`,
                        transition:'all 0.25s ease',
                        position:'relative', overflow:'hidden',
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.transform = 'translateY(-2px)'
                        e.currentTarget.style.boxShadow = `0 8px 20px ${theme.bg}20`
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.transform = 'translateY(0)'
                        e.currentTarget.style.boxShadow = 'none'
                      }}
                    >
                      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'6px'}}>
                        <span style={{fontSize:'0.95rem', fontWeight:900, color:'#1e293b'}}>Ders {lesson.lessonNo}</span>
                        <span style={{
                          fontSize:'8px', fontWeight:800, padding:'3px 8px', borderRadius:'100px',
                          background: lesson.hasSurvey ? '#10b981' : theme.bg, color:'#fff',
                        }}>
                          {lesson.hasSurvey ? '✓ TAMAM' : 'ANKET'}
                        </span>
                      </div>
                      <span style={{fontSize:'0.72rem', color:'#94a3b8', fontWeight:600, display:'block', marginBottom:'10px'}}>
                        {new Date(lesson.dateTime).toLocaleDateString('tr-TR', { day:'numeric', month:'short', year:'numeric' })}
                      </span>
                      <div style={{display:'flex', gap:'6px'}}>
                        <button
                          onClick={() => navigate(`/student/ders-kaydi?id=${lesson.lessonId}`)}
                          style={{
                            flex:1, padding:'6px 0', borderRadius:'10px', border:'none',
                            background:'linear-gradient(135deg, #8b5cf6, #6366f1)', color:'#fff',
                            fontSize:'0.68rem', fontWeight:800, cursor:'pointer',
                            transition:'all 0.2s',
                          }}
                          onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
                          onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                        >🎬 Kayıt</button>
                        {!lesson.hasSurvey && (
                          <button
                            onClick={() => goToSurvey(lesson, group)}
                            style={{
                              flex:1, padding:'6px 0', borderRadius:'10px', border:'none',
                              background: theme.bg, color:'#fff',
                              fontSize:'0.68rem', fontWeight:800, cursor:'pointer',
                              transition:'all 0.2s',
                            }}
                            onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
                            onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                          >📋 Anket</button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default StudentDashboard
