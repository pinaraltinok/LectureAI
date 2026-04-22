import { useState, useEffect } from 'react'
import { apiGet, apiPost } from '../api'

const TeacherAttendance = () => {
  const [lessons, setLessons] = useState([])
  const [selectedLessonId, setSelectedLessonId] = useState('')
  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Load lessons first
  useEffect(() => {
    apiGet('/teacher/lessons')
      .then(data => {
        setLessons(data)
        if (data.length > 0) setSelectedLessonId(data[0].id)
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  // Load students when lesson changes
  useEffect(() => {
    if (!selectedLessonId) return
    apiGet(`/teacher/lessons/${selectedLessonId}/students`)
      .then(data => {
        setStudents(data.map(s => ({ ...s, note: '', sent: false, sending: false })))
      })
      .catch(err => setError(err.message))
  }, [selectedLessonId])

  const handleSend = async (studentId) => {
    const student = students.find(s => s.id === studentId)
    if (!student || !student.note) return

    setStudents(prev => prev.map(s =>
      s.id === studentId ? { ...s, sending: true } : s
    ))

    try {
      await apiPost('/teacher/mentor-feedback', {
        studentId,
        lessonId: selectedLessonId,
        note: student.note,
      })
      setStudents(prev => prev.map(s =>
        s.id === studentId ? { ...s, sent: true, sending: false } : s
      ))
      setTimeout(() => {
        setStudents(prev => prev.map(s =>
          s.id === studentId ? { ...s, sent: false, note: '' } : s
        ))
      }, 3000)
    } catch (err) {
      setError(err.message)
      setStudents(prev => prev.map(s =>
        s.id === studentId ? { ...s, sending: false } : s
      ))
    }
  }

  if (loading) {
    return (
      <div style={{display:'grid', placeItems:'center', minHeight:'400px'}}>
        <div style={{textAlign:'center', color:'#64748b'}}>
          <div style={{fontSize:'2rem', marginBottom:'1rem'}}>⏳</div>
          <p style={{fontWeight:700}}>Veriler yükleniyor...</p>
        </div>
      </div>
    )
  }

  return (
    <div style={{padding: '1.5rem'}}>
      {/* Header Area */}
      <div style={{marginBottom: '2.5rem'}}>
         <h1 style={{fontSize: '1.8rem', fontWeight: 900, color: '#0f172a', marginBottom: '8px'}}>Öğrenci Gelişim Notları</h1>
         <p style={{color: '#64748b', fontSize: '1rem'}}>Öğrencilerinizle doğrudan iletişim kurun ve gelişim notlarını iletin.</p>
      </div>

      {error && (
        <div style={{color: '#f43f5e', background: '#ffe4e6', padding: '0.75rem 1.5rem', borderRadius: '12px', fontSize: '0.9rem', marginBottom: '1.5rem', fontWeight: 600}}>
          {error}
        </div>
      )}

      {/* Lesson Selector */}
      {lessons.length > 0 && (
        <div style={{marginBottom: '2rem'}}>
          <label style={{fontSize: '11px', fontWeight: 800, color: '#64748b', marginBottom: '8px', display: 'block'}}>DERS SEÇİMİ</label>
          <select
            value={selectedLessonId}
            onChange={(e) => setSelectedLessonId(e.target.value)}
            style={{padding:'0.9rem 1.5rem', borderRadius:'14px', border:'1px solid #e2e8f0', fontWeight:700, outline:'none', background:'#fff', minWidth:'300px'}}
          >
            {lessons.map(l => (
              <option key={l.id} value={l.id}>{l.title} ({l.moduleCode}) — {l.studentCount} öğrenci</option>
            ))}
          </select>
        </div>
      )}

      {students.length === 0 ? (
        <div style={{textAlign:'center', padding:'4rem', color:'#64748b'}}>
          <div style={{fontSize:'3rem', marginBottom:'1rem'}}>👥</div>
          <h3 style={{fontWeight:800, color:'#1e293b'}}>
            {lessons.length === 0 ? 'Henüz ders atanmamış' : 'Bu derse kayıtlı öğrenci bulunamadı'}
          </h3>
          <p>Öğrenciler derse kaydedildiğinde burada görünecektir.</p>
        </div>
      ) : (
        <div className="report-card-internal" style={{padding: '0', background: '#fff', border: '1px solid #e2e8f0', overflow: 'hidden'}}>
          {/* Table Header */}
          <div style={{
            display:'grid', gridTemplateColumns:'2fr 3.5fr 1fr', padding:'1.25rem 2.5rem', 
            background: '#f8fafc', borderBottom: '1px solid #e2e8f0',
            color:'#64748b', fontSize:'11px', fontWeight:900, letterSpacing: '0.05em'
          }}>
            <span>ÖĞRENCİ PROFİLİ</span>
            <span>GELİŞİM NOTU YAZ</span>
            <span style={{textAlign: 'right'}}>AKSİYON</span>
          </div>

          {/* Student Rows */}
          <div style={{display: 'flex', flexDirection: 'column'}}>
            {students.map(s => (
              <div key={s.id} style={{
                display:'grid', gridTemplateColumns:'2fr 3.5fr 1fr', alignItems:'center', 
                padding:'1.75rem 2.5rem', borderBottom: '1px solid #f1f5f9',
                background: s.sent ? 'rgba(16, 185, 129, 0.02)' : 'transparent',
                transition: '0.3s ease'
              }}>
                {/* Profile Column */}
                <div style={{display: 'flex', alignItems: 'center', gap: '1rem'}}>
                  <div style={{
                    width: '46px', height: '46px', borderRadius: '14px', 
                    background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
                    display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 900, fontSize: '0.9rem'
                  }}>
                    {s.name.split(' ').map(n=>n[0]).join('').slice(0, 2)}
                  </div>
                  <div>
                    <div style={{fontSize: '1rem', fontWeight: 800, color: '#1e293b'}}>{s.name}</div>
                    <div style={{fontSize: '0.75rem', color: '#94a3b8'}}>{s.email}</div>
                  </div>
                </div>

                {/* Input Column */}
                <div style={{paddingRight: '2rem'}}>
                  <div style={{position: 'relative', width: '100%'}}>
                     <input 
                      placeholder={s.sent ? "Gelişim notu iletildi..." : "Öğrenciye özel geri bildirim veya övgü yazın..."} 
                      value={s.note}
                      disabled={s.sent || s.sending}
                      onChange={(e) => {
                        const val = e.target.value
                        setStudents(prev => prev.map(st => st.id === s.id ? { ...st, note: val } : st))
                      }}
                      style={{
                        width: '100%', outline: 'none', border: '1px solid #e2e8f0',
                        background: s.sent ? '#f0fdf4' : '#f8fafc',
                        padding: '0.9rem 1.25rem 0.9rem 2.5rem', borderRadius: '14px',
                        fontSize: '0.9rem', color: '#334155', fontWeight: 500, transition: '0.3s'
                      }}
                      onFocus={(e) => e.target.style.borderColor = 'var(--primary)'}
                      onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
                    />
                    <span style={{position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', fontSize: '0.9rem', opacity: 0.4}}>✉️</span>
                  </div>
                </div>

                {/* Action Column */}
                <div style={{textAlign: 'right'}}>
                  <button 
                    className="primary-btn" 
                    onClick={() => handleSend(s.id)}
                    disabled={s.sent || s.sending || !s.note}
                    style={{
                      padding:'10px 24px', fontSize:'0.85rem', fontWeight: 800,
                      background: s.sent ? '#10b981' : 'var(--primary)',
                      boxShadow: (s.sent || !s.note) ? 'none' : '0 10px 20px -5px rgba(99, 102, 241, 0.3)',
                      transition: '0.4s'
                    }}
                  >
                    {s.sent ? '✓ İLETİLDİ' : s.sending ? '...' : 'GÖNDER'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default TeacherAttendance
