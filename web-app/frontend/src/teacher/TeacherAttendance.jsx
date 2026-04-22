import { useState } from 'react'

const TeacherAttendance = () => {
  const [students, setStudents] = useState([
    { id: 1, name: 'Ali Vural', status: 'Aktif', lastUpdate: '2 gün önce', note: '', sent: false },
    { id: 2, name: 'Selin Gür', status: 'Destek Gerekli', lastUpdate: '5 gün önce', note: '', sent: false },
    { id: 3, name: 'Mert Aksoy', status: 'Aktif', lastUpdate: '1 hafta önce', note: '', sent: false }
  ])

  const handleSend = (id) => {
    setStudents(prev => prev.map(s => 
      s.id === id ? { ...s, sent: true } : s
    ))
    setTimeout(() => {
      setStudents(prev => prev.map(s => 
        s.id === id ? { ...s, sent: false, note: '', lastUpdate: 'Şimdi' } : s
      ))
    }, 3000)
  }

  const getStatusColor = (status) => {
    return status === 'Aktif' ? '#10b981' : '#f59e0b';
  }

  return (
    <div style={{padding: '1.5rem'}}>
      {/* Header Area */}
      <div style={{marginBottom: '2.5rem'}}>
         <h1 style={{fontSize: '1.8rem', fontWeight: 900, color: '#0f172a', marginBottom: '8px'}}>Öğrenci Gelişim Notları</h1>
         <p style={{color: '#64748b', fontSize: '1rem'}}>Öğrencilerinizle doğrudan iletişim kurun ve gelişim notlarını iletin.</p>
      </div>

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
                  {s.name.split(' ').map(n=>n[0]).join('')}
                </div>
                <div style={{fontSize: '1rem', fontWeight: 800, color: '#1e293b'}}>{s.name}</div>
              </div>

              {/* Input Column */}
              <div style={{paddingRight: '2rem'}}>
                <div style={{position: 'relative', width: '100%'}}>
                   <input 
                    placeholder={s.sent ? "Gelişim notu iletildi..." : "Öğrenciye özel geri bildirim veya övgü yazın..."} 
                    value={s.note}
                    disabled={s.sent}
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
                  disabled={s.sent || !s.note}
                  style={{
                    padding:'10px 24px', fontSize:'0.85rem', fontWeight: 800,
                    background: s.sent ? '#10b981' : 'var(--primary)',
                    boxShadow: (s.sent || !s.note) ? 'none' : '0 10px 20px -5px rgba(99, 102, 241, 0.3)',
                    transition: '0.4s'
                  }}
                >
                  {s.sent ? '✓ İLETİLDİ' : 'GÖNDER'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default TeacherAttendance
