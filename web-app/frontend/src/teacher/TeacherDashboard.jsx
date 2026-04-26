import { useState, useEffect } from 'react'
import { apiGet } from '../api'
import SharedReport from '../components/SharedReport.jsx'

const TeacherDashboard = () => {
  const [selectedReport, setSelectedReport] = useState(null)
  const [teacherComment, setTeacherComment] = useState("")
  const [stats, setStats] = useState(null)
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([
      apiGet('/teacher/stats'),
      apiGet('/teacher/reports'),
    ]).then(([s, r]) => {
      setStats(s)
      setReports(r)
      if (r.length > 0) setSelectedReport(r[0].jobId)
    }).catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  const teacherStats = [
    { label: "Toplam Öğrenci", value: stats?.totalStudents ?? '—', icon: "👥", color: "#6366f1" },
    { label: "Anket Skoru", value: stats?.feedbackScore ?? '—', icon: "⭐", color: "#10b981" },
    { label: "Toplam Grup", value: stats?.totalGroups ?? '—', icon: "📚", color: "#f59e0b" },
    { label: "Rapor Sayısı", value: stats?.reportCount ?? '—', icon: "📊", color: "#ec4899" }
  ]

  const currentReport = reports.find(r => r.jobId === selectedReport) || reports[0]

  const buildReportProps = (r) => {
    if (!r) return null
    const fr = r.finalReport || {}
    return {
      id: r.jobId?.slice(0, 8) || '—',
      name: r.courseName || '',
      module: r.courseName || '',
      date: r.createdAt ? new Date(r.createdAt).toLocaleDateString('tr-TR') : '',
      group: r.lessonNo ? `Ders ${r.lessonNo}` : '',
      evaluator: r.status === 'FINALIZED' ? 'Admin Onaylı' : 'AI Taslak',
      status: r.status || 'DRAFT',
      quality: fr.yeterlilikler || fr.quality || '—',
      ttt: fr.speaking_time_rating || '—',
      duration: fr.actual_duration_min ? `${fr.actual_duration_min}dk` : '—',
      videoUrl: r.videoUrl || null,
      obs: fr.feedback_metni
        ? [{ t: 'Genel Değerlendirme', c: fr.feedback_metni }]
        : [{ t: 'Bilgi', c: 'Bu rapor için detaylı gözlem verisi henüz mevcut değil.' }],
      finalReport: fr,
    }
  }

  if (loading) {
    return (<div style={{display:'grid', placeItems:'center', minHeight:'400px'}}><div style={{textAlign:'center', color:'#64748b'}}><div style={{fontSize:'2rem', marginBottom:'1rem'}}>⏳</div><p style={{fontWeight:700}}>Veriler yükleniyor...</p></div></div>)
  }
  if (error) {
    return (<div style={{display:'grid', placeItems:'center', minHeight:'400px'}}><div style={{textAlign:'center', color:'#f43f5e'}}><div style={{fontSize:'2rem', marginBottom:'1rem'}}>⚠️</div><p style={{fontWeight:700}}>{error}</p></div></div>)
  }

  return (
    <div className="teacher-dashboard" style={{animation: 'fadeIn 0.5s ease'}}>
      <div className="stats-grid" style={{gridTemplateColumns:'repeat(4, 1fr)', gap:'1.5rem', marginBottom:'2.5rem'}}>
        {teacherStats.map((stat, idx) => (
          <div key={idx} className="stat-card" style={{ minHeight:'120px', padding:'1.5rem', alignItems:'flex-start', justifyContent:'space-between', borderRadius: '16px', position: 'relative', overflow: 'hidden' }}>
            <div style={{width:'42px', height:'42px', background:`${stat.color}11`, borderRadius:'12px', display:'grid', placeItems:'center', fontSize:'1.2rem'}}>{stat.icon}</div>
            <div>
              <span className="stat-label" style={{fontSize: '0.75rem', fontWeight: 800, textAlign: 'left', marginBottom: '4px', color: '#64748b'}}>{stat.label}</span>
              <span className="stat-value" style={{fontSize: '1.8rem', display: 'block', fontWeight: 800}}>{stat.value}</span>
            </div>
            <div style={{position:'absolute', right:'-5%', bottom:'-5%', width:'70px', height:'70px', background:stat.color, opacity:0.05, borderRadius:'50%', filter:'blur(20px)'}}></div>
          </div>
        ))}
      </div>

      {reports.length === 0 ? (
        <div style={{textAlign:'center', padding:'4rem', color:'#64748b'}}>
          <div style={{fontSize:'3rem', marginBottom:'1rem'}}>📋</div>
          <h3 style={{fontWeight:800, color:'#1e293b'}}>Henüz rapor bulunmuyor</h3>
          <p>Size atanan analiz raporları burada görünecektir.</p>
        </div>
      ) : (
        <div style={{display: 'grid', gridTemplateColumns: '320px 1fr', gap: '2rem'}}>
          <div style={{display:'flex', flexDirection:'column', gap:'1.25rem'}}>
            <h3 style={{fontSize:'0.9rem', fontWeight:800, color:'#64748b', display:'flex', alignItems:'center', gap:'8px'}}>
              <span style={{width:'8px', height:'8px', background:'#10b981', borderRadius:'50%'}}></span>
              ANALİZ RAPORLARI ({reports.length})
            </h3>
            {reports.map(report => (
              <div key={report.jobId} onClick={() => setSelectedReport(report.jobId)} style={{
                padding: '1.1rem', borderRadius: '16px', border: '1px solid',
                borderColor: selectedReport === report.jobId ? 'var(--primary)' : '#f1f5f9',
                background: selectedReport === report.jobId ? '#f5f3ff' : '#fff',
                cursor: 'pointer', transition: 'all 0.3s ease',
                boxShadow: selectedReport === report.jobId ? '0 10px 15px -3px rgba(99, 102, 241, 0.1)' : 'none'
              }}>
                <div style={{display:'flex', justifyContent:'space-between', marginBottom:'6px'}}>
                  <span style={{fontSize:'10px', fontWeight:800, color: selectedReport === report.jobId ? 'var(--primary)' : '#94a3b8'}}>Ders {report.lessonNo || '—'}</span>
                  <span style={{fontSize:'10px', color:'#94a3b8'}}>{report.createdAt ? new Date(report.createdAt).toLocaleDateString('tr-TR') : ''}</span>
                </div>
                <div style={{display:'flex', alignItems:'center', gap:'8px'}}>
                  <h4 style={{margin:0, fontSize:'0.9rem', fontWeight:800, color:'#1e293b', flex:1}}>{report.courseName || 'Ders Analizi'}</h4>
                  <span style={{
                    fontSize:'9px', fontWeight:800, padding:'3px 8px', borderRadius:'6px',
                    background: report.status === 'FINALIZED' ? '#dcfce7' : '#fef3c7',
                    color: report.status === 'FINALIZED' ? '#16a34a' : '#d97706',
                  }}>
                    {report.status === 'FINALIZED' ? '✓ Onaylı' : '◎ Taslak'}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div style={{display: 'flex', flexDirection: 'column', gap: '2rem'}}>
            <SharedReport report={buildReportProps(currentReport)} />
            <div className="report-card-internal" style={{padding: '2.5rem', background: '#f8fafc', border: '1px solid #cbd5e1'}}>
              <h5 style={{margin:'0 0 1.25rem 0', fontSize:'11px', fontWeight:800, color:'#0f172a', textTransform:'uppercase', letterSpacing:'0.05em'}}>Eğitmen Yanıtı & Kabul Beyanı</h5>
              <textarea placeholder="Rapor hakkında eklemek istediğiniz bir not var mı?" value={teacherComment} onChange={(e) => setTeacherComment(e.target.value)}
                style={{ width:'100%', minHeight:'120px', padding:'1.5rem', borderRadius:'16px', border:'1px solid #cbd5e1', fontSize:'0.95rem', outline:'none', background:'#fff' }} />
              <div style={{display:'flex', justifyContent:'flex-end', gap:'1rem', marginTop:'1.5rem'}}>
                <button className="primary-btn" onClick={() => { alert("Rapor onaylandı!"); setTeacherComment(""); }}
                  style={{padding:'12px 32px', background: teacherComment ? 'var(--primary)' : '#e2e8f0', pointerEvents: teacherComment ? 'auto' : 'none'}}>
                  Onayla ve Gönder
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default TeacherDashboard
