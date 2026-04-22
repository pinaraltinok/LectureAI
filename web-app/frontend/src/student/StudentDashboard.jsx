import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiGet } from '../api'

const StudentDashboard = () => {
  const navigate = useNavigate()
  const [courses, setCourses] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    apiGet('/student/courses')
      .then(data => setCourses(data))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  const goToSurvey = (course) => {
    navigate('/student/anket', { state: { lessonId: course.lessonId, courseName: course.title, instructor: course.teacherName } })
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

  if (courses.length === 0) {
    return (
      <div style={{display:'grid', placeItems:'center', minHeight:'400px'}}>
        <div style={{textAlign:'center', color:'#64748b'}}>
          <div style={{fontSize:'3rem', marginBottom:'1rem'}}>📚</div>
          <h3 style={{fontWeight:800, color:'#1e293b'}}>Henüz kayıtlı ders bulunmuyor</h3>
          <p>Bir derse kaydolduğunuzda burada görünecektir.</p>
        </div>
      </div>
    )
  }

  const courseIcons = ['🐍', '🧩', '🤖', '🎨', '📐', '💻']

  return (
    <div className="student-dashboard" style={{display:'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap:'2rem'}}>
      {courses.map((course, idx) => (
        <div 
          key={course.lessonId}
          className="report-card-internal" 
          onClick={() => goToSurvey(course)}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-6px)';
            e.currentTarget.style.boxShadow = '0 20px 25px -5px rgba(99, 102, 241, 0.1)';
            e.currentTarget.style.borderColor = 'var(--primary)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = 'var(--shadow-sm)';
            e.currentTarget.style.borderColor = 'var(--border)';
          }}
          style={{
            cursor: 'pointer',
            padding: '1.75rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1.5rem',
            transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
            background: course.hasSurvey 
              ? 'linear-gradient(135deg, #ffffff 0%, #f0fdf4 100%)' 
              : 'linear-gradient(135deg, #ffffff 0%, #f5f3ff 100%)',
            border: `1px solid ${course.hasSurvey ? 'rgba(16, 185, 129, 0.2)' : 'var(--border)'}`,
            borderRadius: '16px',
            position: 'relative'
          }}
        >
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
            <div style={{
              fontSize: '10px', fontWeight: 800, padding: '4px 10px', borderRadius: '6px',
              background: course.hasSurvey ? '#10b981' : 'var(--primary)',
              color: '#fff',
              letterSpacing: '0.05em',
              boxShadow: `0 4px 10px ${course.hasSurvey ? 'rgba(16, 185, 129, 0.3)' : 'rgba(99, 102, 241, 0.3)'}`
            }}>
              {course.hasSurvey ? 'ANKET GÖNDERİLDİ' : 'DEVAM EDİYOR'}
            </div>
            {course.hasSurvey && <span style={{color:'#10b981', fontSize:'11px', fontWeight:800}}>✓ TAMAMLANDI</span>}
          </div>

          <div style={{display:'flex', gap:'1.25rem', alignItems:'center'}}>
            <div style={{
              width: '48px', height: '48px', 
              background: course.hasSurvey ? '#f0fdf4' : '#fff', 
              borderRadius: '12px',
              display: 'grid', placeItems: 'center', fontSize: '1.5rem', 
              boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)',
              border: `1px solid ${course.hasSurvey ? 'rgba(16, 185, 129, 0.1)' : '#f1f5f9'}`
            }}>
               {courseIcons[idx % courseIcons.length]}
            </div>
            <div>
              <h3 style={{fontSize:'1.15rem', fontWeight:800, marginBottom:'2px', color:'#0f172a', letterSpacing:'-0.03em'}}>
                {course.title}
              </h3>
              <span style={{color:'var(--text-muted)', fontSize:'0.85rem', fontWeight:600}}>
                {course.teacherName}
              </span>
              {course.moduleCode && (
                <span style={{display:'block', fontSize:'0.75rem', color:'#94a3b8', fontWeight:700, marginTop:'4px'}}>
                  {course.moduleCode}
                </span>
              )}
            </div>
          </div>
          
          <div style={{marginTop:'auto'}}>
            <button 
              className="primary-btn" 
              style={{
                width:'100%', padding:'0.75rem', fontSize:'0.9rem', fontWeight: 800,
                background: course.hasSurvey 
                  ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' 
                  : 'var(--primary)',
                boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
              }}
            >
              {course.hasSurvey ? 'ANKET GÖNDERİLDİ ✓' : 'DERS ANKETİNE GİT'}
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

export default StudentDashboard
