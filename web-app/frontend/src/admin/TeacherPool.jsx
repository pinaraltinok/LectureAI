import { useState, useEffect } from 'react'
import { apiGet, apiPost } from '../api'
import SharedReport from '../components/SharedReport.jsx'

const TeacherPool = () => {
  // Navigation: 'list' → 'reports' → 'detail'
  const [view, setView] = useState('list')
  const [searchQuery, setSearchQuery] = useState('')
  const [teachers, setTeachers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Reports list state
  const [selectedTeacher, setSelectedTeacher] = useState(null)
  const [teacherReports, setTeacherReports] = useState([])
  const [loadingReports, setLoadingReports] = useState(false)

  // Report detail state
  const [selectedReport, setSelectedReport] = useState(null)

  // Sync state
  const [syncing, setSyncing] = useState(false)

  // Load teachers + auto-sync GCS reports
  useEffect(() => {
    const init = async () => {
      try {
        // Sync GCS reports first
        setSyncing(true)
        await apiPost('/admin/sync-reports', {}).catch(() => {})
        setSyncing(false)

        // Then load teachers
        const data = await apiGet('/admin/teachers')
        setTeachers(data)
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
        setSyncing(false)
      }
    }
    init()
  }, [])

  const colorPalette = ['#6366f1', '#f59e0b', '#10b981', '#ec4899', '#06b6d4', '#f43f5e']

  // ─── Handler: Open teacher's reports ──────────────────────
  const handleViewReports = async (teacher, idx) => {
    setSelectedTeacher({ ...teacher, color: colorPalette[idx % colorPalette.length] })
    setLoadingReports(true)
    setError('')
    setView('reports')

    try {
      const data = await apiGet(`/admin/teacher/${teacher.id}/reports`)
      setTeacherReports(data.reports || [])
    } catch (err) {
      setError(err.message)
      setTeacherReports([])
    } finally {
      setLoadingReports(false)
    }
  }

  // ─── Handler: Open report detail ──────────────────────────
  const handleViewReport = async (report) => {
    try {
      const draft = await apiGet(`/admin/analysis/draft/${report.jobId}`)
      const fr = draft.finalReport || draft.draftReport || {}
      setSelectedReport({
        id: report.jobId?.slice(0, 8),
        name: selectedTeacher?.name || '',
        module: draft.lesson?.title || report.lessonTitle || selectedTeacher?.name + ' Analizi',
        date: report.createdAt ? new Date(report.createdAt).toLocaleDateString('tr-TR') : '',
        group: draft.lesson?.moduleCode || report.moduleCode || '',
        evaluator: fr.approvedBy ? 'Admin Onaylı' : 'Sistem (AI)',
        quality: fr.yeterlilikler || '—',
        ttt: fr.speaking_time_rating || '—',
        duration: fr.actual_duration_min ? `${fr.actual_duration_min}dk` : '—',
        videoUrl: draft.videoUrl || report.videoUrl || null,
        obs: fr.feedback_metni
          ? [{ t: 'AI Değerlendirmesi', c: fr.feedback_metni }]
          : [{ t: 'Bilgi', c: 'Rapor detayı bulunamadı.' }],
        finalReport: fr,
        draftReport: fr,
      })
      setView('detail')
    } catch (e) {
      console.error('Report fetch error:', e)
      setError('Rapor yüklenirken hata oluştu.')
    }
  }

  // ─── Loading state ──────────────────────────────────────
  if (loading) {
    return (
      <div style={{display:'grid', placeItems:'center', minHeight:'400px'}}>
        <div style={{textAlign:'center', color:'#64748b'}}>
          <div style={{fontSize:'2rem', marginBottom:'1rem'}}>⏳</div>
          <p style={{fontWeight:700}}>{syncing ? 'GCS raporları senkronize ediliyor...' : 'Eğitmenler yükleniyor...'}</p>
        </div>
      </div>
    )
  }

  // ─── VIEW 3: Report Detail ──────────────────────────────
  if (view === 'detail' && selectedReport) {
    return (
      <div style={{animation: 'fadeIn 0.3s ease', padding: '1rem'}}>
        <button
          onClick={() => { setSelectedReport(null); setView('reports') }}
          style={{background: 'none', border: 'none', color: '#6366f1', fontWeight: 800, fontSize: '11px', cursor: 'pointer', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '8px'}}
        >
          ‹ RAPORLARA GERİ DÖN
        </button>
        <SharedReport report={selectedReport} />
      </div>
    )
  }

  // ─── VIEW 2: Teacher Reports List ───────────────────────
  if (view === 'reports' && selectedTeacher) {
    const initials = selectedTeacher.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)

    return (
      <div style={{padding: '1rem', animation: 'fadeIn 0.3s ease'}}>
        {/* Back + Header */}
        <button
          onClick={() => { setSelectedTeacher(null); setTeacherReports([]); setView('list') }}
          style={{background: 'none', border: 'none', color: '#6366f1', fontWeight: 800, fontSize: '11px', cursor: 'pointer', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '8px'}}
        >
          ‹ EĞİTMEN LİSTESİNE GERİ DÖN
        </button>

        {/* Teacher info card */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '1.5rem',
          padding: '1.5rem 2rem', background: '#fff', border: '1px solid #e2e8f0',
          borderRadius: '24px', marginBottom: '2.5rem',
          boxShadow: '0 10px 25px -5px rgba(0,0,0,0.04)'
        }}>
          <div style={{
            width: '56px', height: '56px', borderRadius: '16px',
            background: `${selectedTeacher.color}15`, color: selectedTeacher.color,
            display: 'grid', placeItems: 'center', fontWeight: 900, fontSize: '1.1rem',
            border: `2px solid ${selectedTeacher.color}30`
          }}>
            {initials}
          </div>
          <div>
            <h2 style={{margin: 0, fontSize: '1.5rem', fontWeight: 950, color: '#0f172a', letterSpacing: '-0.02em'}}>
              {selectedTeacher.name}
            </h2>
            <p style={{margin: '4px 0 0', color: '#64748b', fontSize: '0.9rem', fontWeight: 600}}>
              {selectedTeacher.branch || 'Branş belirtilmemiş'} • {teacherReports.length} Rapor
            </p>
          </div>
        </div>

        {error && (
          <div style={{color: '#f43f5e', background: '#ffe4e6', padding: '0.75rem 1.5rem', borderRadius: '12px', fontSize: '0.9rem', marginBottom: '1.5rem', fontWeight: 600}}>
            {error}
          </div>
        )}

        {loadingReports ? (
          <div style={{display:'grid', placeItems:'center', minHeight:'300px'}}>
            <div style={{textAlign:'center', color:'#64748b'}}>
              <div style={{width:'40px',height:'40px',borderRadius:'50%',border:'3px solid #f1f5f9',borderTopColor:'#6366f1',animation:'spin 1s linear infinite',margin:'0 auto 1rem'}}></div>
              <p style={{fontWeight:700}}>Raporlar yükleniyor...</p>
            </div>
          </div>
        ) : teacherReports.length === 0 ? (
          <div style={{display:'grid', placeItems:'center', minHeight:'300px'}}>
            <div style={{textAlign:'center', color:'#94a3b8'}}>
              <div style={{fontSize:'3rem', marginBottom:'1rem'}}>📭</div>
              <p style={{fontWeight:700, fontSize:'1.1rem'}}>Henüz rapor bulunmuyor</p>
              <p style={{fontSize:'0.85rem'}}>Bu eğitmen için tamamlanmış analiz yok.</p>
            </div>
          </div>
        ) : (
          <div style={{display: 'flex', flexDirection: 'column', gap: '1rem'}}>
            {teacherReports.map((report, idx) => {
              let statusConfig;
              if (report.isUnassigned) {
                statusConfig = { label: 'ATANMAMIŞ', bg: '#fef2f2', color: '#dc2626', border: '#fecaca' }
              } else if (report.status === 'FINALIZED') {
                statusConfig = { label: 'ONAYLANDI', bg: '#f0fdf4', color: '#15803d', border: '#bbf7d0' }
              } else if (report.status === 'DRAFT') {
                statusConfig = { label: 'TASLAK', bg: '#fefce8', color: '#a16207', border: '#fde68a' }
              } else if (report.status === 'PROCESSING') {
                statusConfig = { label: 'İŞLENİYOR', bg: '#eff6ff', color: '#2563eb', border: '#bfdbfe' }
              } else {
                statusConfig = { label: report.status || 'BEKLİYOR', bg: '#f8fafc', color: '#64748b', border: '#e2e8f0' }
              }

              const handleAssign = async (e) => {
                e.stopPropagation()
                try {
                  await apiPost('/admin/analysis/assign', {
                    jobId: report.jobId,
                    teacherId: selectedTeacher.id,
                  })
                  // Refresh reports
                  const data = await apiGet(`/admin/teacher/${selectedTeacher.id}/reports`)
                  setTeacherReports(data.reports || [])
                } catch (err) {
                  setError('Atama hatası: ' + err.message)
                }
              }

              return (
                <div
                  key={report.jobId}
                  onClick={() => handleViewReport(report)}
                  style={{
                    display: 'grid', gridTemplateColumns: 'auto 1fr auto',
                    alignItems: 'center', gap: '1.5rem',
                    padding: '1.5rem 2rem', background: report.isUnassigned ? '#fffbeb' : '#fff',
                    border: `1px solid ${report.isUnassigned ? '#fde68a' : '#e2e8f0'}`, borderRadius: '20px',
                    cursor: 'pointer', transition: 'all 0.2s ease',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.02)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = '#6366f1'
                    e.currentTarget.style.boxShadow = '0 8px 25px rgba(99,102,241,0.12)'
                    e.currentTarget.style.transform = 'translateY(-2px)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = report.isUnassigned ? '#fde68a' : '#e2e8f0'
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.02)'
                    e.currentTarget.style.transform = 'translateY(0)'
                  }}
                >
                  {/* Left: Index circle */}
                  <div style={{
                    width: '44px', height: '44px', borderRadius: '14px',
                    background: report.isUnassigned
                      ? 'linear-gradient(135deg, #f59e0b, #ef4444)'
                      : 'linear-gradient(135deg, #6366f1, #a855f7)',
                    color: '#fff', display: 'grid', placeItems: 'center',
                    fontWeight: 900, fontSize: '0.9rem',
                    boxShadow: report.isUnassigned
                      ? '0 4px 12px rgba(245,158,11,0.3)'
                      : '0 4px 12px rgba(99,102,241,0.3)',
                  }}>
                    #{idx + 1}
                  </div>

                  {/* Middle: Info */}
                  <div>
                    <div style={{display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px'}}>
                      <span style={{fontSize: '1.05rem', fontWeight: 800, color: '#0f172a'}}>
                        {report.videoFilename || report.moduleCode || `Rapor #${idx + 1}`}
                      </span>
                      <span style={{
                        fontSize: '10px', fontWeight: 800, padding: '3px 10px', borderRadius: '6px',
                        background: statusConfig.bg, color: statusConfig.color, border: `1px solid ${statusConfig.border}`
                      }}>
                        {statusConfig.label}
                      </span>
                    </div>
                    <div style={{display: 'flex', gap: '1.5rem', fontSize: '0.8rem', color: '#64748b', fontWeight: 600}}>
                      <span>📅 {new Date(report.createdAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                      {report.moduleCode && <span>📖 {report.moduleCode}</span>}
                      {report.genel_sonuc && <span>📊 {report.genel_sonuc}</span>}
                      {report.isUnassigned && <span style={{color: '#dc2626'}}>⚠ Eğitmene atanmamış</span>}
                    </div>
                    {report.feedback_metni && (
                      <p style={{margin: '8px 0 0', fontSize: '0.82rem', color: '#94a3b8', lineHeight: 1.5, fontWeight: 500}}>
                        {report.feedback_metni.length > 120 ? report.feedback_metni.slice(0, 120) + '...' : report.feedback_metni}
                      </p>
                    )}
                  </div>

                  {/* Right: Arrow or Assign button */}
                  {report.isUnassigned ? (
                    <button
                      onClick={handleAssign}
                      style={{
                        padding: '10px 20px', borderRadius: '12px', border: 'none',
                        background: 'linear-gradient(135deg, #f59e0b, #ef4444)',
                        color: '#fff', fontSize: '0.8rem', fontWeight: 800,
                        cursor: 'pointer', boxShadow: '0 4px 12px rgba(245,158,11,0.3)',
                        transition: '0.2s', whiteSpace: 'nowrap',
                      }}
                    >
                      Bu Eğitmene Ata
                    </button>
                  ) : (
                    <div style={{
                      width: '40px', height: '40px', borderRadius: '12px',
                      background: '#f8fafc', border: '1px solid #e2e8f0',
                      display: 'grid', placeItems: 'center', fontSize: '1.1rem', color: '#94a3b8',
                      transition: '0.2s',
                    }}>
                      →
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        <style>{`
          @keyframes spin { 100% { transform: rotate(360deg); } }
        `}</style>
      </div>
    )
  }

  // ─── VIEW 1: Teacher List ──────────────────────────────
  const rows = teachers.map((t, idx) => ({
    ...t,
    initials: t.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2),
    color: colorPalette[idx % colorPalette.length],
    score: t.lastScore ? (t.lastScore / 20).toFixed(1) : '—',
    hasReport: true,
    idx,
  }))

  const filteredRows = rows.filter(r =>
    r.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div style={{ padding: '1rem', animation: 'fadeIn 0.5s ease' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2.5rem' }}>
        <div>
          <h1 style={{ fontSize: '2rem', fontWeight: 950, color: '#0f172a', letterSpacing: '-0.02em', margin: 0 }}>Eğitmen Havuzu</h1>
          <p style={{ color: '#64748b', fontSize: '1rem', marginTop: '4px' }}>Raporları inceleyin ve eğitmen performansını yönetin.</p>
        </div>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <input
            placeholder="Eğitmen ara..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ padding: '0.9rem 1.5rem', borderRadius: '14px', border: '1px solid #e2e8f0', outline: 'none', minWidth: '280px', fontSize: '0.9rem' }}
          />
          <button style={{ padding: '0.9rem 1.5rem', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '14px', fontWeight: 700, fontSize: '0.9rem', color: '#475569', cursor: 'default' }}>
            {filteredRows.length} Eğitmen
          </button>
        </div>
      </div>

      {error && (
        <div style={{color: '#f43f5e', background: '#ffe4e6', padding: '0.75rem 1.5rem', borderRadius: '12px', fontSize: '0.9rem', marginBottom: '1.5rem', fontWeight: 600}}>
          {error}
        </div>
      )}

      {/* Table */}
      <div className="report-card-internal" style={{ padding: '0', background: '#fff', border: '1px solid #f1f5f9', overflow: 'hidden' }}>
        <div style={{
          display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', padding: '1.5rem 2.5rem',
          background: '#f8fafc', borderBottom: '1px solid #e2e8f0',
          color: '#64748b', fontSize: '11px', fontWeight: 900, letterSpacing: '0.05em'
        }}>
          <span>EĞİTMEN</span>
          <span>RAPOR SAYISI</span>
          <span>SON SKOR</span>
          <span style={{ textAlign: 'right' }}>AKSİYON</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {filteredRows.length > 0 ? (
            filteredRows.map(r => (
              <div key={r.id} style={{
                display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', alignItems: 'center',
                padding: '1.75rem 2.5rem', borderBottom: '1px solid #f1f5f9', cursor: 'default'
              }}>
                {/* Teacher info */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <div style={{
                    width: '46px', height: '46px', borderRadius: '14px',
                    background: `${r.color}20`, color: r.color,
                    display: 'grid', placeItems: 'center', fontWeight: 900, fontSize: '0.9rem',
                    border: `1.5px solid ${r.color}40`
                  }}>
                    {r.initials}
                  </div>
                  <div>
                    <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f172a' }}>{r.name}</div>
                    <div style={{ fontSize: '0.78rem', color: '#94a3b8', fontWeight: 600 }}>{r.branch || '—'}</div>
                  </div>
                </div>

                {/* Report count badge */}
                <div>
                  <span style={{
                    padding: '6px 16px', borderRadius: '10px', fontWeight: 800, fontSize: '0.9rem',
                    background: r.hasReport ? '#f5f3ff' : '#f8fafc',
                    color: r.hasReport ? '#6366f1' : '#94a3b8',
                    border: `1px solid ${r.hasReport ? '#ddd6fe' : '#e2e8f0'}`,
                  }}>
                    {r.reportCount || 0}
                  </span>
                </div>

                {/* Score */}
                <div style={{ fontSize: '1.25rem', fontWeight: 950, color: '#0f172a' }}>
                  {r.score} {r.score !== '—' && <small style={{ fontSize: '0.75rem', color: '#94a3b8' }}>/ 5.0</small>}
                </div>

                {/* Action button */}
                <div style={{ textAlign: 'right' }}>
                  <button
                    onClick={() => handleViewReports(r, r.idx)}
                    style={{
                      padding: '10px 28px', borderRadius: '12px', border: 'none',
                      background: r.hasReport ? 'linear-gradient(135deg, #6366f1, #a855f7)' : '#f1f5f9',
                      color: r.hasReport ? '#fff' : '#94a3b8',
                      fontSize: '0.85rem', fontWeight: 800,
                      cursor: r.hasReport ? 'pointer' : 'not-allowed',
                      boxShadow: r.hasReport ? '0 10px 20px -5px rgba(99, 102, 241, 0.4)' : 'none',
                      transition: '0.3s'
                    }}
                  >
                    Raporları Gör
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div style={{ padding: '5rem', textAlign: 'center', color: '#94a3b8' }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔍</div>
              <div style={{ fontWeight: 700 }}>Aramanızla eşleşen eğitmen bulunamadı.</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default TeacherPool
