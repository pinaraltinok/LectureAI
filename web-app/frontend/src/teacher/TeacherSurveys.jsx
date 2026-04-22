import { useState, useEffect } from 'react'
import { apiGet } from '../api'

const TeacherSurveys = () => {
  const [lessons, setLessons] = useState([])
  const [selectedLessonId, setSelectedLessonId] = useState('')
  const [surveyData, setSurveyData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    apiGet('/teacher/lessons')
      .then(data => {
        setLessons(data)
        if (data.length > 0) setSelectedLessonId(data[0].id)
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!selectedLessonId) return
    apiGet(`/teacher/reports/${selectedLessonId}/surveys`)
      .then(data => setSurveyData(data))
      .catch(err => setError(err.message))
  }, [selectedLessonId])

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

  const avg = surveyData?.averages || {}
  const overallAvg = avg.overall || 0

  return (
    <div style={{padding: '1.5rem'}}>
      {/* 1. Header & Lesson Selector */}
      <div style={{marginBottom: '2.5rem'}}>
        <h1 style={{fontSize: '1.8rem', fontWeight: 900, color: '#0f172a', marginBottom: '1rem'}}>Öğrenci Geri Bildirim Analizi</h1>
        
        {lessons.length > 0 && (
          <div style={{marginBottom: '1.5rem'}}>
            <select
              value={selectedLessonId}
              onChange={(e) => setSelectedLessonId(e.target.value)}
              style={{padding:'0.9rem 1.5rem', borderRadius:'14px', border:'1px solid #e2e8f0', fontWeight:700, outline:'none', background:'#fff', minWidth:'300px'}}
            >
              {lessons.map(l => (
                <option key={l.id} value={l.id}>{l.title} ({l.moduleCode})</option>
              ))}
            </select>
          </div>
        )}

        {/* Summary Stats */}
        <div style={{display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem'}}>
          <div className="report-card-internal" style={{padding: '1.5rem', border: '1px solid #e2e8f0', background: '#fff'}}>
            <span style={{fontSize: '10px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase'}}>Ortalama Skor</span>
            <div style={{fontSize: '2rem', fontWeight: 900, color: '#6366f1', marginTop: '4px'}}>{overallAvg}<small style={{fontSize: '0.9rem', color: '#94a3b8'}}>/5</small></div>
            <div style={{fontSize: '11px', color: overallAvg >= 4 ? '#10b981' : '#f59e0b', fontWeight: 700, marginTop: '8px'}}>
              {overallAvg >= 4 ? '✓ İyi seviye' : '— Gelişime açık'}
            </div>
          </div>
          <div className="report-card-internal" style={{padding: '1.5rem', border: '1px solid #e2e8f0', background: '#fff'}}>
            <span style={{fontSize: '10px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase'}}>Katılım</span>
            <div style={{fontSize: '2rem', fontWeight: 900, color: '#0f172a', marginTop: '4px'}}>{surveyData?.totalResponses ?? 0}</div>
            <div style={{fontSize: '11px', color: '#64748b', fontWeight: 700, marginTop: '8px'}}>Anket yanıtı</div>
          </div>
          <div className="report-card-internal" style={{padding: '1.5rem', border: '1px solid #e2e8f0', background: '#fff'}}>
            <span style={{fontSize: '10px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase'}}>Genel Duygu</span>
            <div style={{fontSize: '2rem', fontWeight: 900, color: overallAvg >= 4 ? '#10b981' : overallAvg >= 3 ? '#f59e0b' : '#f43f5e', marginTop: '4px'}}>
              {overallAvg >= 4 ? 'Pozitif' : overallAvg >= 3 ? 'Nötr' : 'Düşük'}
            </div>
            <div style={{fontSize: '11px', color: '#64748b', fontWeight: 700, marginTop: '8px'}}>Veri Analizi</div>
          </div>
        </div>
      </div>

      {surveyData?.totalResponses === 0 ? (
        <div style={{textAlign:'center', padding:'4rem', color:'#64748b'}}>
          <div style={{fontSize:'3rem', marginBottom:'1rem'}}>📊</div>
          <h3 style={{fontWeight:800, color:'#1e293b'}}>Henüz anket yanıtı bulunmuyor</h3>
          <p>Öğrenciler anket gönderdiğinde sonuçlar burada görünecektir.</p>
        </div>
      ) : (
        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'2rem'}}>
          {/* Left: Detailed Metrics */}
          <div className="report-card-internal" style={{padding:'2rem', background: '#fff', border: '1px solid #f1f5f9'}}>
            <h3 style={{fontSize: '1.1rem', fontWeight: 800, color: '#1e293b', marginBottom: '2rem'}}>Kategorik Skorlar</h3>
            
            <div style={{display: 'flex', flexDirection: 'column', gap: '1.5rem'}}>
              {[
                { label: 'İçerik Kalitesi', value: avg.contentQuality || 0, color: '#6366f1' },
                { label: 'Öğretim Yöntemi', value: avg.teachingMethod || 0, color: '#10b981' },
                { label: 'Etkileşim & Katılım', value: avg.engagement || 0, color: '#f59e0b' },
                { label: 'Materyal Kalitesi', value: avg.materials || 0, color: '#ec4899' }
              ].map((item, i) => (
                <div key={i}>
                  <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '8px'}}>
                    <span style={{fontSize: '12px', fontWeight: 700, color: '#475569'}}>{item.label}</span>
                    <span style={{fontSize: '12px', fontWeight: 800, color: item.color}}>{item.value}/5</span>
                  </div>
                  <div style={{height: '8px', background: '#f1f5f9', borderRadius: '10px', overflow: 'hidden'}}>
                    <div style={{width: `${(item.value/5)*100}%`, height: '100%', background: item.color, borderRadius: '10px', transition: 'width 0.5s ease'}}></div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right: Anonymous Comments */}
          <div className="report-card-internal" style={{padding:'2rem', background: '#fff', border: '1px solid #f1f5f9'}}>
            <h3 style={{fontSize: '1.1rem', fontWeight: 800, color: '#1e293b', marginBottom: '2rem'}}>Öğrenci Yorumları</h3>
            
            <div style={{display: 'flex', flexDirection: 'column', gap: '1rem'}}>
              {(surveyData?.anonymousComments || []).length > 0 ? (
                surveyData.anonymousComments.map((comment, i) => (
                  <div key={i} style={{padding: '1rem', background: '#f8fafc', borderRadius: '16px', border: '1px solid #f1f5f9'}}>
                    <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '8px'}}>
                       <div style={{display: 'flex', gap: '8px', alignItems: 'center'}}>
                         <span style={{fontSize: '10px', fontWeight: 800, color: '#6366f1', textTransform: 'uppercase'}}>YORUM</span>
                         <span style={{fontSize: '10px', fontWeight: 700, color: '#94a3b8'}}>• Anonim Öğrenci</span>
                       </div>
                    </div>
                    <p style={{margin: 0, fontSize: '0.9rem', color: '#334155', fontWeight: 500, lineHeight: 1.5}}>"{comment}"</p>
                  </div>
                ))
              ) : (
                <div style={{textAlign:'center', padding:'2rem', color:'#94a3b8'}}>
                  <p style={{fontWeight:600}}>Henüz anonim yorum bulunmuyor.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default TeacherSurveys
