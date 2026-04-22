import { useNavigate } from 'react-router-dom'

const StudentDashboard = () => {
  const navigate = useNavigate()

  const courses = [
    {
      id: 1,
      title: "Python ile Programlama",
      instructor: "Zehra Bozkurt",
      progress: 65,
      status: "DEVAM EDİYOR",
      badgeColor: "#eff6ff",
      badgeTextColor: "#3b82f6"
    },
    {
      id: 2,
      title: "Scratch ile Giriş",
      instructor: "Mehmet Demir",
      progress: 100,
      status: "TAMAMLANDI",
      badgeColor: "#f8fafc",
      badgeTextColor: "#94a3b8",
      completed: true
    }
  ]

  const goToSurvey = (course) => {
    navigate('/student/anket', { state: { courseName: course.title, instructor: course.instructor } })
  }

  return (
    <div className="student-dashboard" style={{display:'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap:'2rem'}}>
      {courses.map(course => (
        <div 
          key={course.id}
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
            background: course.completed ? 'linear-gradient(135deg, #ffffff 0%, #f0fdf4 100%)' : 'linear-gradient(135deg, #ffffff 0%, #f5f3ff 100%)',
            border: `1px solid ${course.completed ? 'rgba(16, 185, 129, 0.2)' : 'var(--border)'}`,
            borderRadius: '16px',
            position: 'relative'
          }}
        >
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
            <div style={{
              fontSize: '10px', fontWeight: 800, padding: '4px 10px', borderRadius: '6px',
              background: course.completed ? '#10b981' : 'var(--primary)',
              color: '#fff',
              letterSpacing: '0.05em',
              boxShadow: `0 4px 10px ${course.completed ? 'rgba(16, 185, 129, 0.3)' : 'rgba(99, 102, 241, 0.3)'}`
            }}>
              {course.status}
            </div>
            {course.completed && <span style={{color:'#10b981', fontSize:'11px', fontWeight:800, letterSpacing:'0.02em'}}>⭐ ACHİEVEMENT</span>}
          </div>

          <div style={{display:'flex', gap:'1.25rem', alignItems:'center'}}>
            <div style={{
              width: '48px', height: '48px', 
              background: course.completed ? '#f0fdf4' : '#fff', 
              borderRadius: '12px',
              display: 'grid', placeItems: 'center', fontSize: '1.5rem', 
              boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)',
              border: `1px solid ${course.completed ? 'rgba(16, 185, 129, 0.1)' : '#f1f5f9'}`
            }}>
               {course.completed ? '📜' : (course.id === 1 ? '🐍' : '🧩')}
            </div>
            <div>
              <h3 style={{fontSize:'1.15rem', fontWeight:800, marginBottom:'2px', color:'#0f172a', letterSpacing:'-0.03em'}}>
                {course.title}
              </h3>
              <span style={{color:'var(--text-muted)', fontSize:'0.85rem', fontWeight:600}}>
                {course.instructor}
              </span>
            </div>
          </div>
          
          <div style={{marginTop:'auto'}}>
            {!course.completed ? (
              <>
                <div style={{display:'flex', justifyContent:'space-between', fontSize:'11px', fontWeight:700, color:'#475569', marginBottom:'0.6rem'}}>
                  <span>Learning Journey</span>
                  <span style={{color:'var(--primary)'}}>{course.progress}%</span>
                </div>
                <div style={{height:'6px', background:'#f1f5f9', borderRadius:'10px', overflow:'hidden', marginBottom: '1.5rem'}}>
                   <div style={{
                     width: `${course.progress}%`, height:'100%', 
                     background: 'linear-gradient(90deg, var(--primary), #a855f7)', 
                     borderRadius:'10px',
                     transition: 'width 1s ease-in-out'
                   }}></div>
                </div>
                <button className="primary-btn" style={{width:'100%', padding:'0.75rem', fontSize:'0.9rem', fontWeight: 800, boxShadow: '0 4px 12px rgba(0,0,0,0.1)'}}>
                  CONTINUE LESSON
                </button>
              </>
            ) : (
              <button 
                className="primary-btn" 
                style={{
                  width:'100%', padding:'0.75rem', fontSize:'0.9rem', fontWeight: 800,
                  background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', 
                  color: '#fff', border: 'none',
                  boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)', cursor: 'pointer'
                }}
              >
                VIEW CERTIFICATE
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

export default StudentDashboard
