import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiGet } from '../api'

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
          <div style={{fontSize:'2rem', marginBottom:'1rem'}}>⏳</div>
          <p style={{fontWeight:700}}>Dersler yükleniyor...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{display:'grid', placeItems:'center', minHeight:'400px'}}>
        <div style={{textAlign:'center', color:'#f43f5e'}}>
          <div style={{fontSize:'2rem', marginBottom:'1rem'}}>⚠️</div>
          <p style={{fontWeight:700}}>{error}</p>
        </div>
      </div>
    )
  }

  if (groups.length === 0) {
    return (
      <div style={{display:'grid', placeItems:'center', minHeight:'400px'}}>
        <div style={{textAlign:'center', color:'#64748b'}}>
          <div style={{fontSize:'3rem', marginBottom:'1rem'}}>📚</div>
          <h3 style={{fontWeight:800, color:'#1e293b'}}>Henüz kayıtlı ders bulunmuyor</h3>
          <p>Bir gruba kaydolduğunuzda burada görünecektir.</p>
        </div>
      </div>
    )
  }

  const courseIcons = ['🐍', '🧩', '🤖', '🎨', '📐', '💻']

  return (
    <div style={{display:'flex', flexDirection:'column', gap:'2rem', animation: 'fadeIn 0.5s ease'}}>
      {groups.map((group, gIdx) => (
        <div key={group.groupId} className="report-card-internal" style={{padding: '2rem', borderRadius: '20px'}}>
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1.5rem'}}>
            <div style={{display:'flex', gap:'1rem', alignItems:'center'}}>
              <div style={{
                width: '48px', height: '48px', background: '#f5f3ff', borderRadius: '14px',
                display: 'grid', placeItems: 'center', fontSize: '1.5rem',
                boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', border: '1px solid #f1f5f9'
              }}>
                {courseIcons[gIdx % courseIcons.length]}
              </div>
              <div>
                <h3 style={{fontSize:'1.2rem', fontWeight:800, color:'#0f172a', letterSpacing:'-0.03em', margin:0}}>
                  {group.courseName}
                </h3>
                <span style={{color:'var(--text-muted)', fontSize:'0.85rem', fontWeight:600}}>
                  {group.teacherName} • {group.age} yaş • {group.schedule || ''}
                </span>
              </div>
            </div>
          </div>

          <div style={{display:'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap:'1rem'}}>
            {group.lessons.map(lesson => (
              <div
                key={lesson.lessonId}
                onClick={() => !lesson.hasSurvey && goToSurvey(lesson, group)}
                onMouseEnter={(e) => { if (!lesson.hasSurvey) { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = '0 10px 20px -5px rgba(99, 102, 241, 0.15)'; } }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}
                style={{
                  padding: '1.25rem', borderRadius: '14px', cursor: lesson.hasSurvey ? 'default' : 'pointer',
                  background: lesson.hasSurvey ? 'linear-gradient(135deg, #f0fdf4, #dcfce7)' : '#f8fafc',
                  border: `1px solid ${lesson.hasSurvey ? 'rgba(16, 185, 129, 0.2)' : '#e2e8f0'}`,
                  transition: 'all 0.3s ease',
                }}
              >
                <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'8px'}}>
                  <span style={{fontSize:'0.9rem', fontWeight:800, color:'#1e293b'}}>Ders {lesson.lessonNo}</span>
                  <span style={{
                    fontSize:'9px', fontWeight:800, padding:'3px 8px', borderRadius:'6px',
                    background: lesson.hasSurvey ? '#10b981' : 'var(--primary)', color: '#fff',
                  }}>
                    {lesson.hasSurvey ? '✓ GÖNDERİLDİ' : 'ANKET BEKLİYOR'}
                  </span>
                </div>
                <span style={{fontSize:'0.75rem', color:'#94a3b8', fontWeight:600}}>
                  {new Date(lesson.dateTime).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' })}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

export default StudentDashboard
