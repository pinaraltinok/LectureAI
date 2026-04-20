import { useState } from 'react'

const StudentNotes = () => {
  const [activeTab, setActiveTab] = useState(1)

  const mockNotes = [
    {
      id: 1,
      course: "Python Programming",
      teacher: "Zehra Bozkurt",
      date: "APRIL 19, 2024",
      note: "Ali, your logical approach to Python loops was excellent! Keep up the great work and keep exploring list comprehensions. You are becoming a master of clean code.",
      color: "#6366f1", // Indigo
      secondaryColor: "#a855f7" // Purple
    },
    {
      id: 2,
      course: "Scratch Basics",
      teacher: "Mehmet Demir",
      date: "APRIL 15, 2024",
      note: "Great job on the animation project! Your use of variables for the score counter was very clever. Try adding more sounds to your next game!",
      color: "#f59e0b", // Amber
      secondaryColor: "#d97706" 
    },
    {
      id: 3,
      course: "AI & ML Intro",
      teacher: "Selin Yılmaz",
      date: "APRIL 10, 2024",
      note: "The way you explained the difference between Supervised and Unsupervised learning was perfect. Your curiousity about neural networks is inspiring.",
      color: "#10b981", // Emerald
      secondaryColor: "#059669"
    }
  ]

  const currentNote = mockNotes.find(n => n.id === activeTab)

  return (
    <div className="student-notes-container" style={{maxWidth:'700px', marginTop:'1rem', animation: 'fadeIn 0.5s ease'}}>
      
      {/* PROMINENT Folder Style Course Tabs */}
      <div style={{display:'flex', gap:'8px', marginBottom:'-2px', paddingLeft:'15px', position:'relative', zIndex:5}}>
        {mockNotes.map(note => (
          <button
            key={note.id}
            onClick={() => setActiveTab(note.id)}
            style={{
              padding: '12px 24px',
              background: activeTab === note.id ? note.color : '#e2e8f0',
              color: activeTab === note.id ? 'white' : '#475569',
              border: '1px solid ' + (activeTab === note.id ? note.color : '#cbd5e1'),
              borderBottom: 'none',
              borderRadius: '16px 16px 0 0',
              fontSize: '12px',
              fontWeight: 800,
              cursor: 'pointer',
              transition: 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
              boxShadow: activeTab === note.id ? `0 -6px 15px ${note.color}55` : 'none',
              transform: activeTab === note.id ? 'translateY(0)' : 'translateY(4px)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              letterSpacing: '0.02em'
            }}
          >
            <span style={{fontSize: '1.25rem'}}>{note.id === 1 ? '🐍' : note.id === 2 ? '🧩' : '🤖'}</span>
            <span>{note.course.split(' ')[0]}</span>
          </button>
        ))}
      </div>

      <div className="report-card-internal" style={{
        padding: '0', overflow: 'hidden', border: `1px solid ${currentNote.color}33`,
        boxShadow: `0 20px 40px -20px ${currentNote.color}44`,
        background: '#fff',
        borderRadius: '0 16px 16px 16px',
        position: 'relative',
        zIndex: 2
      }}>
        {/* Dynamic Header Section */}
        <div style={{
          background: `linear-gradient(135deg, ${currentNote.color} 0%, ${currentNote.secondaryColor} 100%)`,
          padding: '1.5rem 2rem', display: 'flex', alignItems: 'center', gap: '1rem',
          transition: 'all 0.5s ease'
        }}>
          <div style={{
            width:'40px', height:'40px', background:'rgba(255,255,255,0.2)', 
            borderRadius:'12px', display:'flex', alignItems:'center', justifyContent:'center',
            color: 'white', fontSize: '1.2rem'
          }}>
            💬
          </div>
          <div>
            <h2 style={{margin:0, fontSize:'1.1rem', fontWeight:800, color:'#fff', letterSpacing:'-0.02em'}}>
              {currentNote.course}
            </h2>
            <p style={{margin:0, fontSize:'10px', color:'rgba(255,255,255,0.7)', fontWeight:700}}>Instructor Feedback</p>
          </div>
        </div>

        <div style={{padding: '2rem', position: 'relative'}}>
          {/* Dynamic Accent Line */}
          <div style={{
            position: 'absolute', left: '0', top: '2rem', bottom: '2rem', 
            width: '5px', background: `linear-gradient(to bottom, ${currentNote.color}, ${currentNote.secondaryColor})`,
            borderRadius: '0 5px 5px 0'
          }}></div>

          <div style={{paddingLeft: '1.5rem'}}>
             <p style={{
               margin:0, fontSize: '0.92rem', fontStyle: 'italic', lineHeight: 1.75, 
               color: '#334155', fontWeight: 500,
               transition: 'all 0.5s ease',
               minHeight: '120px' 
             }}>
              "{currentNote.note}"
            </p>
            
            <div style={{marginTop: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop:'1.5rem', borderTop:'1px solid #f1f5f9'}}>
              <div style={{display: 'flex', alignItems: 'center', gap: '0.75rem'}}>
                <div style={{
                  width:'32px', height:'32px', borderRadius:'10px', 
                  background: `linear-gradient(135deg, ${currentNote.color}, ${currentNote.secondaryColor})`, 
                  display:'grid', placeItems:'center', color:'white', fontSize:'12px', fontWeight:800
                }}>
                  {currentNote.teacher.split(' ').map(n=>n[0]).join('')}
                </div>
                <div>
                   <span style={{fontSize: '0.9rem', fontWeight: 800, color: '#0f172a', display:'block'}}>{currentNote.teacher}</span>
                   <span style={{fontSize: '10px', color: 'var(--text-muted)', fontWeight: 700}}>{currentNote.date}</span>
                </div>
              </div>
              <div style={{
                 padding: '4px 10px', background: `${currentNote.color}11`, color: currentNote.color, 
                 borderRadius: '6px', fontSize: '9px', fontWeight: 800
              }}>
                 OFFICIAL FEEDBACK
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default StudentNotes
