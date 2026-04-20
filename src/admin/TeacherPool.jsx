import { useState } from 'react'
import SharedReport from '../components/SharedReport.jsx'

const TeacherPool = () => {
  const [selectedReport, setSelectedReport] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')

  const rows = [
    {
      id: 1, name: 'Zehra Bozkurt', initials: 'ZB', color: '#6366f1',
      expertise: ['Python Dev', 'Modül 8'], score: '4.9', status: 'Rapor Hazır',
      details: {
        date: '12/03/2026', course: 'TURPRM1220_WED-18', group: 'Kodland-8',
        kpis: { ttt: '%22', duration: '95dk', attendance: '92%', quality: '%98' },
        evaluator: 'Özlem',
        obs: [
          { t: 'Motivasyon', c: 'Kısa övgüler kullanılmıştır (13:37, 20:08). "Süpersin" gibi ifadelerle etkileşim artırılmıştır.' },
          { t: 'Soru-Cevap', c: 'Eğitmen açık uçlu sorular sordu (12:45, 14:38). "Tool ne demek?" gibi sorularla katılım sağlandı.' }
        ]
      }
    },
    {
      id: 2, name: 'Murat Kaya', initials: 'MK', color: '#f59e0b',
      expertise: ['Unity 3D', 'Modül 4'], score: '4.2', status: 'Beklemede',
      details: null
    },
    {
      id: 3, name: 'Caner Öz', initials: 'CÖ', color: '#10b981',
      expertise: ['Scratch', 'Grup 12'], score: '4.7', status: 'Rapor Hazır',
      details: {
        date: '10/03/2026', course: 'SCRT-99_MON-16', group: 'Creative-1',
        kpis: { ttt: '%35', duration: '60dk', attendance: '100%', quality: '%92' },
        evaluator: 'Hakan',
        obs: [
          { t: 'Ders Akışı', c: 'Ders tekrarı ve geçiş bölümlerinde öğrenciler bilgilendirildi.' }
        ]
      }
    }
  ]

  const filteredRows = rows.filter(r =>
    r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.expertise.some(e => e.toLowerCase().includes(searchQuery.toLowerCase()))
  )

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
          <span>UZMANLIK & MODÜLLER</span>
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
                    <div style={{ fontSize: '0.75rem', fontWeight: 800, color: r.status === 'Beklemede' ? '#f59e0b' : '#10b981', background: r.status === 'Beklemede' ? '#fffbeb' : '#f0fdf4', padding: '2px 8px', borderRadius: '6px', display: 'inline-block', marginTop: '4px' }}>
                      {r.status.toUpperCase()}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {r.expertise.map(e => (
                    <span key={e} style={{
                      fontSize: '10px', fontWeight: 800, color: '#475569',
                      background: '#f1f5f9', padding: '4px 12px', borderRadius: '100px'
                    }}>{e.toUpperCase()}</span>
                  ))}
                </div>

                <div style={{ fontSize: '1.25rem', fontWeight: 950, color: '#0f172a' }}>
                  {r.score} <small style={{ fontSize: '0.75rem', color: '#94a3b8' }}>/ 5.0</small>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <button
                    onClick={() => r.details ? setSelectedReport(r) : null}
                    style={{
                      padding: '8px 24px', borderRadius: '12px', border: 'none',
                      background: r.details ? 'linear-gradient(135deg, #6366f1, #a855f7)' : '#f1f5f9',
                      color: r.details ? '#fff' : '#94a3b8',
                      fontSize: '0.85rem', fontWeight: 800, cursor: r.details ? 'pointer' : 'not-allowed',
                      boxShadow: r.details ? '0 10px 20px -5px rgba(99, 102, 241, 0.4)' : 'none',
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
