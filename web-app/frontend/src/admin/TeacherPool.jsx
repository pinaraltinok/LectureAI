import { useState, useEffect } from 'react'
import { apiGet } from '../api'
import SharedReport from '../components/SharedReport.jsx'

const TeacherPool = () => {
  const [selectedReport, setSelectedReport] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [teachers, setTeachers] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingReport, setLoadingReport] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    apiGet('/admin/teachers')
      .then(data => setTeachers(data))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  const colorPalette = ['#6366f1', '#f59e0b', '#10b981', '#ec4899', '#06b6d4', '#f43f5e']

  const rows = teachers.map((t, idx) => ({
    id: t.id,
    name: t.name,
    initials: t.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2),
    color: colorPalette[idx % colorPalette.length],
    expertise: [],
    score: t.lastScore ? (t.lastScore / 20).toFixed(1) : '—',
    status: t.lastScore ? 'Rapor Hazır' : 'Beklemede',
    hasReport: !!t.lastScore,
    latestJobId: t.latestJobId || null,
  }))

  const filteredRows = rows.filter(r =>
    r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.expertise.some(e => e.toLowerCase().includes(searchQuery.toLowerCase()))
  )

  if (loading) {
    return (
      <div style={{display:'grid', placeItems:'center', minHeight:'400px'}}>
        <div style={{textAlign:'center', color:'#64748b'}}>
          <div style={{fontSize:'2rem', marginBottom:'1rem'}}>⏳</div>
          <p style={{fontWeight:700}}>Eğitmenler yükleniyor...</p>
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

  if (selectedReport) {
    return (
      <div style={{animation: 'fadeIn 0.3s ease', padding: '1rem'}}>
        <button 
          onClick={() => setSelectedReport(null)}
          style={{background: 'none', border: 'none', color: '#6366f1', fontWeight: 800, fontSize: '11px', cursor: 'pointer', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '8px'}}
        >
          ‹ LİSTEYE GERİ DÖN
        </button>
        
        <SharedReport report={selectedReport} />
      </div>
    )
  }

  return (
    <div style={{ padding: '1rem', animation: 'fadeIn 0.5s ease' }}>
      {/* 1. Header & Filters */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2.5rem' }}>
        <div>
          <h1 style={{ fontSize: '2rem', fontWeight: 950, color: '#0f172a', letterSpacing: '-0.02em', margin: 0 }}>Eğitmen Havuzu</h1>
          <p style={{ color: '#64748b', fontSize: '1rem', marginTop: '4px' }}>Raporları inceleyin ve eğitmen performansını yönetin.</p>
        </div>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <input
            placeholder="Eğitmen veya branş ara..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ padding: '0.9rem 1.5rem', borderRadius: '14px', border: '1px solid #e2e8f0', outline: 'none', minWidth: '320px', fontSize: '0.9rem' }}
          />
          <button style={{ padding: '0.9rem 1.5rem', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '14px', fontWeight: 700, fontSize: '0.9rem', color: '#475569', cursor: 'default' }}>
            {filteredRows.length} Sonuç
          </button>
        </div>
      </div>

      <div className="report-card-internal" style={{ padding: '0', background: '#fff', border: '1px solid #f1f5f9', overflow: 'hidden' }}>
        <div style={{
          display: 'grid', gridTemplateColumns: '2fr 2fr 1fr 1fr', padding: '1.5rem 2.5rem',
          background: '#f8fafc', borderBottom: '1px solid #e2e8f0',
          color: '#64748b', fontSize: '11px', fontWeight: 900, letterSpacing: '0.05em'
        }}>
          <span>EĞİTMEN</span>
          <span>BRANŞ</span>
          <span>SKOR (AVG)</span>
          <span style={{ textAlign: 'right' }}>AKSİYON</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {filteredRows.length > 0 ? (
            filteredRows.map(r => (
              <div key={r.id} style={{
                display: 'grid', gridTemplateColumns: '2fr 2fr 1fr 1fr', alignItems: 'center',
                padding: '1.75rem 2.5rem', borderBottom: '1px solid #f1f5f9', cursor: 'default'
              }}>
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
                    <div style={{ fontSize: '0.75rem', fontWeight: 800, color: r.hasReport ? '#10b981' : '#f59e0b', background: r.hasReport ? '#f0fdf4' : '#fffbeb', padding: '2px 8px', borderRadius: '6px', display: 'inline-block', marginTop: '4px' }}>
                      {r.status.toUpperCase()}
                    </div>
                  </div>
                </div>

                <div style={{ fontSize: '1.25rem', fontWeight: 950, color: '#0f172a' }}>
                  {r.score} {r.score !== '—' && <small style={{ fontSize: '0.75rem', color: '#94a3b8' }}>/ 5.0</small>}
                </div>

                <div style={{ textAlign: 'right' }}>
                  <button
                    onClick={async () => {
                      if (!r.hasReport || !r.latestJobId) return
                      setLoadingReport(true)
                      try {
                        const draft = await apiGet(`/admin/analysis/draft/${r.latestJobId}`)
                        const fr = draft.finalReport || draft.draftReport || {}
                        setSelectedReport({
                          id: r.latestJobId?.slice(0, 8) || r.id.slice(0, 8),
                          name: r.name,
                          module: draft.lesson?.title || '',
                          date: draft.createdAt ? new Date(draft.createdAt).toLocaleDateString('tr-TR') : '',
                          group: draft.lesson?.moduleCode || '',
                          evaluator: fr.approvedBy ? 'Admin Onaylı' : 'Sistem (AI)',
                          quality: fr.yeterlilikler || fr.quality || '—',
                          ttt: fr.speaking_time_rating || '—',
                          duration: fr.actual_duration_min ? `${fr.actual_duration_min}dk` : '—',
                          videoUrl: draft.videoUrl || null,
                          pdfUrl: fr.pdfUrl || null,
                          obs: fr.feedback_metni
                            ? [{ t: 'AI Değerlendirmesi', c: fr.feedback_metni }]
                            : [{ t: 'Bilgi', c: 'Rapor detayı bulunamadı.' }],
                          finalReport: fr,
                          draftReport: fr,
                        })
                      } catch (e) {
                        console.error('Report fetch error:', e)
                      } finally {
                        setLoadingReport(false)
                      }
                    }}
                    style={{
                      padding: '8px 24px', borderRadius: '12px', border: 'none',
                      background: r.hasReport ? 'linear-gradient(135deg, #6366f1, #a855f7)' : '#f1f5f9',
                      color: r.hasReport ? '#fff' : '#94a3b8',
                      fontSize: '0.85rem', fontWeight: 800, cursor: r.hasReport ? 'pointer' : 'not-allowed',
                      boxShadow: r.hasReport ? '0 10px 20px -5px rgba(99, 102, 241, 0.4)' : 'none',
                      transition: '0.3s'
                    }}
                  >
                    Raporu Gör
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div style={{ padding: '5rem', textAlign: 'center', color: '#94a3b8' }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔍</div>
              <div style={{ fontWeight: 700 }}>Aramanızla eşleşen eğitmen bulunamadı.</div>
              <div style={{ fontSize: '0.85rem' }}>Farklı bir isim veya branş denemeyi unutmayın.</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default TeacherPool
