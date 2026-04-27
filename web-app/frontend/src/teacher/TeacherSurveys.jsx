import { useState, useEffect } from 'react'
import { apiGet } from '../api'
import { formatLessonLabel } from '../utils/lessonLabel'

const TeacherSurveys = () => {
  const [groups, setGroups] = useState([])
  const [selectedLesson, setSelectedLesson] = useState(null)
  const [surveyData, setSurveyData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    apiGet('/teacher/lessons')
      .then(data => {
        setGroups(data)
        const firstLesson = data[0]?.lessons?.[0]
        if (firstLesson) setSelectedLesson(firstLesson.id)
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!selectedLesson) return
    apiGet(`/teacher/reports/${selectedLesson}/surveys`)
      .then(data => setSurveyData(data))
      .catch(err => setError(err.message))
  }, [selectedLesson])

  if (loading) return (<div style={{display:'grid', placeItems:'center', minHeight:'400px'}}><div style={{textAlign:'center', color:'#64748b'}}><div style={{fontSize:'2rem', marginBottom:'1rem'}}>⏳</div><p style={{fontWeight:700}}>Yükleniyor...</p></div></div>)
  if (error) return (<div style={{display:'grid', placeItems:'center', minHeight:'400px'}}><div style={{textAlign:'center', color:'#f43f5e'}}><div style={{fontSize:'2rem', marginBottom:'1rem'}}>⚠️</div><p style={{fontWeight:700}}>{error}</p></div></div>)

  return (
    <div style={{animation: 'fadeIn 0.5s ease'}}>
      {/* Lesson Selector */}
      <div style={{marginBottom:'2rem'}}>
        <label style={{fontSize:'11px', fontWeight:800, color:'#64748b', display:'block', marginBottom:'8px', textTransform:'uppercase', letterSpacing:'0.05em'}}>DERS SEÇİN</label>
        <select value={selectedLesson || ''} onChange={e => setSelectedLesson(e.target.value)}
          style={{width:'100%', maxWidth:'500px', padding:'12px', borderRadius:'12px', border:'1px solid #e2e8f0', fontSize:'0.9rem', fontWeight:600, background:'#f8fafc', outline:'none'}}>
          {groups.map(g => g.lessons.map(l => (
            <option key={l.id} value={l.id}>{g.groupName || g.courseName} — {formatLessonLabel(l.lessonNo, g.moduleSize)} ({new Date(l.dateTime).toLocaleDateString('tr-TR')})</option>
          )))}
        </select>
      </div>

      {surveyData && (
        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'2rem'}}>
          {/* Score Card */}
          <div className="report-card-internal" style={{padding:'2.5rem', textAlign:'center', background:'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)', color:'white', border:'none', borderRadius:'24px'}}>
            <div style={{fontSize:'4rem', fontWeight:900, marginBottom:'0.5rem'}}>
              {surveyData.averageRating || '—'}
              <span style={{fontSize:'1.5rem', opacity:0.7}}>/5</span>
            </div>
            <p style={{fontSize:'1rem', fontWeight:700, opacity:0.9}}>Ortalama Puan</p>
            <p style={{fontSize:'0.85rem', opacity:0.7, marginTop:'0.5rem'}}>{surveyData.totalResponses} öğrenci yanıtladı</p>

            {/* Star visual */}
            <div style={{display:'flex', justifyContent:'center', gap:'8px', marginTop:'1.5rem'}}>
              {[1,2,3,4,5].map(i => (
                <span key={i} style={{fontSize:'1.5rem', opacity: i <= Math.round(surveyData.averageRating) ? 1 : 0.3}}>⭐</span>
              ))}
            </div>
          </div>

          {/* Comments */}
          <div className="report-card-internal" style={{padding:'2rem', maxHeight:'400px', overflowY:'auto'}}>
            <h3 style={{fontSize:'0.9rem', fontWeight:800, color:'#0f172a', marginBottom:'1.5rem'}}>
              💬 Anonim Notlar ({surveyData.notes?.length || 0})
            </h3>
            {(!surveyData.notes || surveyData.notes.length === 0) ? (
              <p style={{color:'#94a3b8', textAlign:'center', padding:'2rem'}}>Henüz anonim not gönderilmedi.</p>
            ) : (
              <div style={{display:'flex', flexDirection:'column', gap:'1rem'}}>
                {surveyData.notes.map((comment, idx) => (
                  <div key={idx} style={{padding:'1rem', borderRadius:'12px', background:'#f8fafc', border:'1px solid #f1f5f9', borderLeft:'4px solid #6366f1'}}>
                    <p style={{margin:0, fontSize:'0.85rem', color:'#475569', lineHeight:1.6, fontStyle:'italic'}}>"{comment}"</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {!surveyData && selectedLesson && (
        <div style={{textAlign:'center', padding:'4rem', color:'#64748b'}}>
          <div style={{fontSize:'3rem', marginBottom:'1rem'}}>📊</div>
          <h3 style={{fontWeight:800, color:'#1e293b'}}>Anket verisi yükleniyor...</h3>
        </div>
      )}
    </div>
  )
}

export default TeacherSurveys
