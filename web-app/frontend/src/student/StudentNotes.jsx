import { useState, useEffect } from 'react'
import { apiGet } from '../api'

const THEMES = [
  { bg: '#6366f1', gradient: 'linear-gradient(135deg, #6366f1, #8b5cf6)', light: '#ede9fe' },
  { bg: '#f59e0b', gradient: 'linear-gradient(135deg, #f59e0b, #fbbf24)', light: '#fef3c7' },
  { bg: '#10b981', gradient: 'linear-gradient(135deg, #10b981, #34d399)', light: '#d1fae5' },
  { bg: '#ec4899', gradient: 'linear-gradient(135deg, #ec4899, #f472b6)', light: '#fce7f3' },
  { bg: '#06b6d4', gradient: 'linear-gradient(135deg, #06b6d4, #22d3ee)', light: '#cffafe' },
]

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

  if (loading) {
    return (
      <div style={{display:'grid', placeItems:'center', minHeight:'400px'}}>
        <div style={{textAlign:'center', color:'#64748b'}}>
          <div style={{fontSize:'3rem', marginBottom:'1rem'}}>💬</div>
          <p style={{fontWeight:700, fontSize:'1.1rem'}}>Notlar yükleniyor...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{display:'grid', placeItems:'center', minHeight:'400px'}}>
        <div style={{textAlign:'center', color:'#f43f5e'}}>
          <div style={{fontSize:'3rem', marginBottom:'1rem'}}>😵</div>
          <p style={{fontWeight:800}}>{error}</p>
        </div>
      </div>
    )
  }

  if (notes.length === 0) {
    return (
      <div style={{display:'grid', placeItems:'center', minHeight:'400px'}}>
        <div style={{
          textAlign:'center', padding:'3rem', background:'#fff',
          borderRadius:'28px', border:'1px solid #f1f5f9',
          boxShadow:'0 4px 20px rgba(0,0,0,0.04)',
        }}>
          <div style={{fontSize:'4rem', marginBottom:'1rem'}}>🗨️</div>
          <h3 style={{fontWeight:900, color:'#1e293b', fontSize:'1.3rem'}}>Henüz not yok</h3>
          <p style={{color:'#94a3b8'}}>Eğitmenlerin sana not gönderdiğinde burada görünecek!</p>
        </div>
      </div>
    )
  }

  const currentNote = notes[activeTab]
  const theme = THEMES[activeTab % THEMES.length]
  const initials = currentNote.teacherName.split(' ').map(n => n[0]).join('').slice(0, 2)

  return (
    <div style={{maxWidth:'700px', marginTop:'0.5rem', animation:'fadeIn 0.5s ease'}}>
      {/* Teacher Selector Chips */}
      <div style={{display:'flex', gap:'10px', marginBottom:'1.5rem', flexWrap:'wrap'}}>
        {notes.map((note, idx) => {
          const t = THEMES[idx % THEMES.length]
          const isActive = activeTab === idx
          const ini = note.teacherName.split(' ').map(n => n[0]).join('').slice(0, 2)
          return (
            <button
              key={note.id}
              onClick={() => setActiveTab(idx)}
              style={{
                display:'flex', alignItems:'center', gap:'10px',
                padding: isActive ? '10px 20px' : '10px 18px',
                background: isActive ? t.gradient : '#fff',
                color: isActive ? '#fff' : '#475569',
                border: isActive ? 'none' : '2px solid #e2e8f0',
                borderRadius:'100px', cursor:'pointer',
                transition:'all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                boxShadow: isActive ? `0 8px 20px ${t.bg}40` : 'none',
                transform: isActive ? 'scale(1.05)' : 'scale(1)',
                fontWeight: 800, fontSize:'0.85rem',
              }}
            >
              <div style={{
                width:'28px', height:'28px', borderRadius:'50%',
                background: isActive ? 'rgba(255,255,255,0.25)' : t.light,
                display:'grid', placeItems:'center',
                fontSize:'0.65rem', fontWeight:900,
                color: isActive ? '#fff' : t.bg,
              }}>
                {ini}
              </div>
              {note.teacherName.split(' ')[0]}
            </button>
          )
        })}
      </div>

      {/* Note Card */}
      <div style={{
        background:'#fff', borderRadius:'28px', overflow:'hidden',
        border:'1px solid #f1f5f9',
        boxShadow:`0 8px 30px ${theme.bg}15`,
        transition:'all 0.3s ease',
      }}>
        {/* Header */}
        <div style={{
          background:theme.gradient, padding:'1.5rem 2rem',
          display:'flex', alignItems:'center', gap:'1rem',
          position:'relative', overflow:'hidden',
        }}>
          <div style={{position:'absolute', top:'-10px', right:'15px', fontSize:'4rem', opacity:0.1}}>💬</div>
          <div style={{
            width:'44px', height:'44px', background:'rgba(255,255,255,0.2)',
            borderRadius:'14px', display:'grid', placeItems:'center',
            color:'#fff', fontSize:'1.2rem', backdropFilter:'blur(4px)',
          }}>
            💬
          </div>
          <div>
            <h2 style={{margin:0, fontSize:'1.15rem', fontWeight:900, color:'#fff'}}>Eğitmen Değerlendirmesi</h2>
            <p style={{margin:'2px 0 0', fontSize:'0.75rem', color:'rgba(255,255,255,0.7)', fontWeight:700}}>Bireysel Geri Bildirim</p>
          </div>
        </div>

        {/* Note Content */}
        <div style={{padding:'2rem', position:'relative'}}>
          {/* Accent bar */}
          <div style={{
            position:'absolute', left:0, top:'2rem', bottom:'2rem', width:'4px',
            background:theme.gradient, borderRadius:'0 4px 4px 0',
          }}></div>

          <div style={{paddingLeft:'1.5rem'}}>
            <div style={{
              fontSize:'2.5rem', color:theme.bg, opacity:0.3, fontFamily:'Georgia, serif',
              lineHeight:1, marginBottom:'0.5rem',
            }}>
              "
            </div>
            <p style={{
              margin:0, fontSize:'1rem', fontStyle:'italic', lineHeight:1.8,
              color:'#334155', fontWeight:500, minHeight:'80px',
            }}>
              {currentNote.note}
            </p>
            <div style={{
              fontSize:'2.5rem', color:theme.bg, opacity:0.3, fontFamily:'Georgia, serif',
              lineHeight:1, textAlign:'right', marginTop:'0.5rem',
            }}>
              "
            </div>
          </div>

          {/* Footer */}
          <div className="responsive-notes-footer" style={{
            marginTop:'1.5rem', display:'flex', justifyContent:'space-between', alignItems:'center',
            paddingTop:'1.25rem', borderTop:'1px solid #f1f5f9',
          }}>
            <div style={{display:'flex', alignItems:'center', gap:'0.75rem'}}>
              <div style={{
                width:'38px', height:'38px', borderRadius:'12px',
                background:theme.gradient, display:'grid', placeItems:'center',
                color:'white', fontSize:'0.75rem', fontWeight:900,
              }}>
                {initials}
              </div>
              <div>
                <span style={{fontSize:'0.9rem', fontWeight:800, color:'#0f172a', display:'block'}}>{currentNote.teacherName}</span>
                <span style={{fontSize:'0.72rem', color:'#94a3b8', fontWeight:600}}>
                  {currentNote.createdAt ? new Date(currentNote.createdAt).toLocaleDateString('tr-TR', { year:'numeric', month:'long', day:'numeric' }) : ''}
                </span>
              </div>
            </div>
            <div style={{
              padding:'5px 14px', background:theme.light, color:theme.bg,
              borderRadius:'100px', fontSize:'10px', fontWeight:800,
            }}>
              RESMİ GERİ BİLDİRİM
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default StudentNotes
