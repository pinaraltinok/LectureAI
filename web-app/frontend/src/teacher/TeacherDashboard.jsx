import { useState, useEffect } from 'react'
import { Users, Star, BookOpen, BarChart3, ClipboardList, AlertTriangle, MessageCircle, CheckCircle, Circle, Activity } from 'lucide-react'
import { apiGet } from '../api'
import { formatLessonLabel } from '../utils/lessonLabel'
import SharedReport from '../components/SharedReport.jsx'
import ProgressChart from '../components/ProgressChart.jsx'

const TeacherDashboard = () => {
  const [selectedReport, setSelectedReport] = useState(null)
  const [teacherComment, setTeacherComment] = useState("")
  const [stats, setStats] = useState(null)
  const [reports, setReports] = useState([])
  const [progressData, setProgressData] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([
      apiGet('/teacher/stats'),
      apiGet('/teacher/reports'),
      apiGet('/teacher/progress').catch(() => []),
    ]).then(([s, r, p]) => {
      setStats(s)
      setReports(r)
      setProgressData(p)
      if (r.length > 0) setSelectedReport(r[0].jobId)
    }).catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  const teacherStats = [
    { label: "Toplam Öğrenci", value: stats?.totalStudents ?? '—', icon: <Users size={22} />, color: "#6366f1", gradient: 'linear-gradient(135deg, #6366f1, #8b5cf6)' },
    { label: "Anket Skoru", value: stats?.feedbackScore ?? '—', icon: <Star size={22} />, color: "#10b981", gradient: 'linear-gradient(135deg, #10b981, #34d399)' },
    { label: "Toplam Grup", value: stats?.totalGroups ?? '—', icon: <BookOpen size={22} />, color: "#f59e0b", gradient: 'linear-gradient(135deg, #f59e0b, #fbbf24)' },
    { label: "Rapor Sayısı", value: stats?.reportCount ?? '—', icon: <BarChart3 size={22} />, color: "#ec4899", gradient: 'linear-gradient(135deg, #ec4899, #f472b6)' }
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
      group: r.lessonNo ? formatLessonLabel(r.lessonNo, r.moduleSize) : '',
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
    return (
      <div style={{display:'grid', placeItems:'center', minHeight:'400px'}}>
        <div className="premium-loader">
          <div className="loader-ring"></div>
          <p style={{ fontWeight: 700, color: '#64748b', fontSize: '0.9rem' }}>Dersleriniz yükleniyor...</p>
        </div>
      </div>
    )
  }
  if (error) {
    return (
      <div style={{display:'grid', placeItems:'center', minHeight:'400px'}}>
        <div style={{textAlign:'center', color:'#f43f5e', animation: 'bounceIn 0.5s ease'}}>
          <div style={{marginBottom:'1rem'}}><AlertTriangle size={48} color="#f43f5e" /></div>
          <p style={{fontWeight:700}}>{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="dashboard-page">
      {/* Welcome Banner */}
      <div className="welcome-banner" style={{
        background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 40%, #4338ca 100%)',
        marginBottom: '2rem',
        backgroundSize: '200% 200%',
        animation: 'cardPopIn 0.6s cubic-bezier(0.22, 1, 0.36, 1) 0.05s both, gradientFlow 8s ease infinite',
      }}>
        <div className="banner-particle"></div>
        <div className="banner-particle"></div>
        <div className="banner-particle"></div>
        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
          <div>
            <div style={{display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px'}}>
              <span style={{fontSize: '0.7rem', fontWeight: 800, padding: '4px 12px', borderRadius: '100px', background: 'rgba(99, 102, 241, 0.3)', color: '#c7d2fe', letterSpacing: '0.08em'}}>
                EĞİTMEN PANELİ
              </span>
            </div>
            <h2 style={{ fontSize: '1.8rem', fontWeight: 950, letterSpacing: '-0.03em', margin: '0 0 0.5rem', lineHeight: 1.2 }}>
              Ders <span style={{color: '#818cf8'}}>Analizlerim</span>
            </h2>
            <p style={{ fontSize: '0.95rem', opacity: 0.6, fontWeight: 500, margin: 0 }}>
              Performans trendlerinizi takip edin, AI raporlarınızı inceleyin
            </p>
          </div>
          <div className="banner-icon-box" style={{
            width: '80px', height: '80px', borderRadius: '20px',
            background: 'rgba(99, 102, 241, 0.15)', backdropFilter: 'blur(10px)',
            display: 'grid', placeItems: 'center', fontSize: '2.5rem',
            animation: 'rotateFloat 4s ease-in-out infinite',
            border: '1px solid rgba(99, 102, 241, 0.2)',
          }}>
            <ClipboardList size={36} />
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="responsive-stats-grid" style={{display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:'1.25rem', marginBottom:'2rem'}}>
        {teacherStats.map((stat, idx) => (
          <div key={idx} className="premium-stat-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
              <div className="stat-icon-bubble" style={{ background: `${stat.color}12`, color: stat.color }}>
                {stat.icon}
              </div>
            </div>
            <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '6px' }}>
              {stat.label}
            </span>
            <span className="stat-number" style={{animationDelay: `${0.3 + idx * 0.1}s`}}>
              {stat.value}
            </span>
            <div className="stat-bottom-glow" style={{background: stat.color}}></div>
          </div>
        ))}
      </div>

      {/* Progress Chart */}
      <div style={{marginBottom: '2rem', animation: 'cardPopIn 0.5s ease 0.5s both'}}>
        <ProgressChart
          data={progressData}
          title="Performans İlerlemem"
          accentColor="#6366f1"
        />
      </div>

      {reports.length === 0 ? (
        <div style={{
          textAlign:'center', padding:'4rem',
          background: '#fff', borderRadius: '24px',
          border: '1px solid #f1f5f9',
          animation: 'cardPopIn 0.5s ease 0.6s both'
        }}>
          <div style={{marginBottom:'1.5rem', animation: 'float 3s ease-in-out infinite'}}><ClipboardList size={56} color="#94a3b8" /></div>
          <h3 style={{fontWeight:900, color:'#1e293b', fontSize: '1.3rem', marginBottom: '0.5rem'}}>Henüz rapor bulunmuyor</h3>
          <p style={{color: '#94a3b8', fontSize: '0.95rem'}}>Size atanan analiz raporları burada görünecektir.</p>
        </div>
      ) : (
        <div className="responsive-report-grid" style={{display: 'grid', gridTemplateColumns: '320px 1fr', gap: '2rem'}}>
          <div style={{display:'flex', flexDirection:'column', gap:'0.75rem', animation: 'cardPopIn 0.5s ease 0.6s both'}}>
            <h3 style={{fontSize:'0.8rem', fontWeight:800, color:'#64748b', display:'flex', alignItems:'center', gap:'8px', marginBottom: '0.5rem'}}>
              <span style={{width:'8px', height:'8px', background: 'linear-gradient(135deg, #10b981, #06b6d4)', borderRadius:'50%', boxShadow: '0 0 8px rgba(16,185,129,0.4)'}}></span>
              ANALİZ RAPORLARI ({reports.length})
            </h3>
            {reports.map((report, idx) => (
              <div
                key={report.jobId}
                className={`report-selector-item ${selectedReport === report.jobId ? 'selected' : ''}`}
                onClick={() => setSelectedReport(report.jobId)}
                style={{animationDelay: `${0.65 + idx * 0.08}s`, animation: `slideInRight 0.4s ease ${0.65 + idx * 0.08}s both`}}
              >
                <div style={{display:'flex', justifyContent:'space-between', marginBottom:'6px'}}>
                  <span style={{fontSize:'10px', fontWeight:800, color: selectedReport === report.jobId ? 'var(--primary)' : '#94a3b8'}}>
                    {formatLessonLabel(report.lessonNo, report.moduleSize)}
                  </span>
                  <span style={{fontSize:'10px', color:'#94a3b8'}}>
                    {report.createdAt ? new Date(report.createdAt).toLocaleDateString('tr-TR') : ''}
                  </span>
                </div>
                <div style={{display:'flex', alignItems:'center', gap:'8px'}}>
                  <h4 style={{margin:0, fontSize:'0.88rem', fontWeight:800, color:'#1e293b', flex:1}}>{report.courseName || 'Ders Analizi'}</h4>
                  <span style={{
                    fontSize:'9px', fontWeight:800, padding:'3px 10px', borderRadius:'100px',
                    background: report.status === 'FINALIZED' ? '#dcfce7' : '#fef3c7',
                    color: report.status === 'FINALIZED' ? '#16a34a' : '#d97706',
                  }}>
                    {report.status === 'FINALIZED' ? '✓ Onaylı' : '◎ Taslak'}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div style={{display: 'flex', flexDirection: 'column', gap: '2rem', animation: 'slideInRight 0.5s ease 0.7s both'}}>
            <SharedReport report={buildReportProps(currentReport)} />
            <div style={{
              padding: '2.5rem', background: '#f8fafc',
              borderRadius: '24px', border: '1px solid #e2e8f0',
              transition: 'all 0.3s ease',
            }}>
              <div style={{display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1.5rem'}}>
                <div style={{width: '32px', height: '32px', borderRadius: '10px', background: '#ede9fe', display: 'grid', placeItems: 'center'}}>
                  <MessageCircle size={16} color="#6366f1" />
                </div>
                <h5 style={{margin:0, fontSize:'0.85rem', fontWeight:800, color:'#0f172a'}}>Eğitmen Yanıtı & Kabul Beyanı</h5>
              </div>
              <textarea placeholder="Rapor hakkında eklemek istediğiniz bir not var mı?" value={teacherComment} onChange={(e) => setTeacherComment(e.target.value)}
                style={{
                  width:'100%', minHeight:'120px', padding:'1.5rem', borderRadius:'16px',
                  border:'1.5px solid #e2e8f0', fontSize:'0.95rem', outline:'none', background:'#fff',
                  transition: 'all 0.3s ease', fontFamily: 'inherit',
                }} 
                onFocus={e => { e.target.style.borderColor = '#6366f1'; e.target.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.1)'; }}
                onBlur={e => { e.target.style.borderColor = '#e2e8f0'; e.target.style.boxShadow = 'none'; }}
              />
              <div style={{display:'flex', justifyContent:'flex-end', gap:'1rem', marginTop:'1.5rem'}}>
                <button className="primary-btn" onClick={() => { alert("Rapor onaylandı!"); setTeacherComment(""); }}
                  style={{
                    padding:'12px 32px', borderRadius: '14px',
                    background: teacherComment ? 'linear-gradient(135deg, #6366f1, #4f46e5)' : '#e2e8f0',
                    pointerEvents: teacherComment ? 'auto' : 'none',
                    boxShadow: teacherComment ? '0 8px 20px -4px rgba(99,102,241,0.3)' : 'none',
                    transition: 'all 0.3s ease',
                  }}>
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
