import { useState, useEffect } from 'react'
import { apiGet } from '../api'

const StudentNotes = () => {
  const [notes, setNotes] = useState([])
  const [activeTab, setActiveTab] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    apiGet('/student/evaluations')
      .then(data => {
        setNotes(data)
        if (data.length > 0) setActiveTab(0)
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  const colorPalette = [
    { color: '#6366f1', secondaryColor: '#a855f7' },
    { color: '#f59e0b', secondaryColor: '#d97706' },
    { color: '#10b981', secondaryColor: '#059669' },
    { color: '#ec4899', secondaryColor: '#db2777' },
    { color: '#06b6d4', secondaryColor: '#0891b2' },
  ]

  const tabIcons = ['💬', '📝', '🎯', '💡', '✨']

  if (loading) {
    return (
      <div style={{display:'grid', placeItems:'center', minHeight:'400px'}}>
        <div style={{textAlign:'center', color:'#64748b'}}>
          <div style={{fontSize:'2rem', marginBottom:'1rem'}}>⏳</div>
          <p style={{fontWeight:700}}>Notlar yükleniyor...</p>
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

  if (notes.length === 0) {
    return (
      <div style={{display:'grid', placeItems:'center', minHeight:'400px'}}>
        <div style={{textAlign:'center', color:'#64748b'}}>
          <div style={{fontSize:'3rem', marginBottom:'1rem'}}>🗨</div>
          <h3 style={{fontWeight:800, color:'#1e293b'}}>Henüz eğitmen notu bulunmuyor</h3>
          <p>Eğitmenleriniz size not gönderdiğinde burada görünecektir.</p>
        </div>
      </div>
    )
  }

  const currentNote = notes[activeTab]
  const colors = colorPalette[activeTab % colorPalette.length]

  return (
    <div style={{maxWidth:'700px', marginTop:'1rem', animation: 'fadeIn 0.5s ease'}}>
      {/* Tabs */}
      <div style={{display:'flex', gap:'8px', marginBottom:'-2px', paddingLeft:'15px', position:'relative', zIndex:5, flexWrap:'wrap'}}>
        {notes.map((note, idx) => {
          const c = colorPalette[idx % colorPalette.length]
          return (
            <button
              key={note.id}
              onClick={() => setActiveTab(idx)}
              style={{
                padding: '12px 24px',
                background: activeTab === idx ? c.color : '#e2e8f0',
                color: activeTab === idx ? 'white' : '#475569',
                border: '1px solid ' + (activeTab === idx ? c.color : '#cbd5e1'),
                borderBottom: 'none', borderRadius: '16px 16px 0 0',
                fontSize: '12px', fontWeight: 800, cursor: 'pointer',
                transition: 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                boxShadow: activeTab === idx ? `0 -6px 15px ${c.color}55` : 'none',
                transform: activeTab === idx ? 'translateY(0)' : 'translateY(4px)',
                display: 'flex', alignItems: 'center', gap: '8px',
              }}
            >
              <span style={{fontSize: '1.25rem'}}>{tabIcons[idx % tabIcons.length]}</span>
              <span>{note.teacherName.split(' ')[0]}</span>
            </button>
          )
        })}
      </div>

      <div className="report-card-internal" style={{
        padding: '0', overflow: 'hidden', border: `1px solid ${colors.color}33`,
        boxShadow: `0 20px 40px -20px ${colors.color}44`,
        borderRadius: '0 16px 16px 16px', position: 'relative', zIndex: 2
      }}>
        <div style={{
          background: `linear-gradient(135deg, ${colors.color} 0%, ${colors.secondaryColor} 100%)`,
          padding: '1.5rem 2rem', display: 'flex', alignItems: 'center', gap: '1rem',
        }}>
          <div style={{ width:'40px', height:'40px', background:'rgba(255,255,255,0.2)', borderRadius:'12px', display:'flex', alignItems:'center', justifyContent:'center', color: 'white', fontSize: '1.2rem' }}>💬</div>
          <div>
            <h2 style={{margin:0, fontSize:'1.1rem', fontWeight:800, color:'#fff'}}>Eğitmen Değerlendirmesi</h2>
            <p style={{margin:0, fontSize:'10px', color:'rgba(255,255,255,0.7)', fontWeight:700}}>Eğitmen Geri Bildirimi</p>
          </div>
        </div>

        <div style={{padding: '2rem', position: 'relative'}}>
          <div style={{ position: 'absolute', left: '0', top: '2rem', bottom: '2rem', width: '5px', background: `linear-gradient(to bottom, ${colors.color}, ${colors.secondaryColor})`, borderRadius: '0 5px 5px 0' }}></div>
          <div style={{paddingLeft: '1.5rem'}}>
            <p style={{ margin:0, fontSize: '0.92rem', fontStyle: 'italic', lineHeight: 1.75, color: '#334155', fontWeight: 500, minHeight: '120px' }}>
              "{currentNote.note}"
            </p>
            <div style={{marginTop: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop:'1.5rem', borderTop:'1px solid #f1f5f9'}}>
              <div style={{display: 'flex', alignItems: 'center', gap: '0.75rem'}}>
                <div style={{ width:'32px', height:'32px', borderRadius:'10px', background: `linear-gradient(135deg, ${colors.color}, ${colors.secondaryColor})`, display:'grid', placeItems:'center', color:'white', fontSize:'12px', fontWeight:800 }}>
                  {currentNote.teacherName.split(' ').map(n=>n[0]).join('').slice(0, 2)}
                </div>
                <div>
                  <span style={{fontSize: '0.9rem', fontWeight: 800, color: '#0f172a', display:'block'}}>{currentNote.teacherName}</span>
                  <span style={{fontSize: '10px', color: 'var(--text-muted)', fontWeight: 700}}>
                    {currentNote.createdAt ? new Date(currentNote.createdAt).toLocaleDateString('tr-TR', { year: 'numeric', month: 'long', day: 'numeric' }) : ''}
                  </span>
                </div>
              </div>
              <div style={{ padding: '4px 10px', background: `${colors.color}11`, color: colors.color, borderRadius: '6px', fontSize: '9px', fontWeight: 800 }}>
                RESMİ GERİ BİLDİRİM
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default StudentNotes
