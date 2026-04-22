const TeacherSurveys = () => {
  return (
    <div style={{padding: '1.5rem'}}>
      {/* 1. Header & Summary Stats */}
      <div style={{marginBottom: '2.5rem'}}>
        <h1 style={{fontSize: '1.8rem', fontWeight: 900, color: '#0f172a', marginBottom: '1.5rem'}}>Öğrenci Geri Bildirim Analizi</h1>
        
        <div style={{display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem'}}>
          <div className="report-card-internal" style={{padding: '1.5rem', border: '1px solid #e2e8f0', background: '#fff'}}>
            <span style={{fontSize: '10px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase'}}>Ortalama Skor</span>
            <div style={{fontSize: '2rem', fontWeight: 900, color: '#6366f1', marginTop: '4px'}}>4.85<small style={{fontSize: '0.9rem', color: '#94a3b8'}}>/5</small></div>
            <div style={{fontSize: '11px', color: '#10b981', fontWeight: 700, marginTop: '8px'}}>↑ 0.2 vs geçen ay</div>
          </div>
          <div className="report-card-internal" style={{padding: '1.5rem', border: '1px solid #e2e8f0', background: '#fff'}}>
            <span style={{fontSize: '10px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase'}}>Katılım Oranı</span>
            <div style={{fontSize: '2rem', fontWeight: 900, color: '#0f172a', marginTop: '4px'}}>%94</div>
            <div style={{fontSize: '11px', color: '#64748b', fontWeight: 700, marginTop: '8px'}}>124/132 Öğrenci</div>
          </div>
          <div className="report-card-internal" style={{padding: '1.5rem', border: '1px solid #e2e8f0', background: '#fff'}}>
            <span style={{fontSize: '10px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase'}}>Genel Duygu</span>
            <div style={{fontSize: '2rem', fontWeight: 900, color: '#10b981', marginTop: '4px'}}>Pozitif</div>
            <div style={{fontSize: '11px', color: '#64748b', fontWeight: 700, marginTop: '8px'}}>AI Analiz Sonucu</div>
          </div>
        </div>
      </div>

      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'2rem'}}>
        {/* Left: Detailed Metrics */}
        <div className="report-card-internal" style={{padding:'2rem', background: '#fff', border: '1px solid #f1f5f9'}}>
          <h3 style={{fontSize: '1.1rem', fontWeight: 800, color: '#1e293b', marginBottom: '2rem'}}>Kategorik Skorlar</h3>
          
          <div style={{display: 'flex', flexDirection: 'column', gap: '1.5rem'}}>
            {[
              { label: 'Anlatım Netliği', value: 98, color: '#6366f1' },
              { label: 'Ders Temposu', value: 76, color: '#10b981' },
              { label: 'Teknik Destek', value: 92, color: '#f59e0b' },
              { label: 'Ödev Takibi', value: 85, color: '#ec4899' }
            ].map((item, i) => (
              <div key={i}>
                <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '8px'}}>
                  <span style={{fontSize: '12px', fontWeight: 700, color: '#475569'}}>{item.label}</span>
                  <span style={{fontSize: '12px', fontWeight: 800, color: item.color}}>%{item.value}</span>
                </div>
                <div style={{height: '8px', background: '#f1f5f9', borderRadius: '10px', overflow: 'hidden'}}>
                  <div style={{width: `${item.value}%`, height: '100%', background: item.color, borderRadius: '10px'}}></div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Feedback Log */}
        <div className="report-card-internal" style={{padding:'2rem', background: '#fff', border: '1px solid #f1f5f9'}}>
          <h3 style={{fontSize: '1.1rem', fontWeight: 800, color: '#1e293b', marginBottom: '2rem'}}>Öğrenci Yorumları</h3>
          
          <div style={{display: 'flex', flexDirection: 'column', gap: '1rem'}}>
            {[
              { text: "Zehra hocamın anlatımı çok sürükleyici.", date: "Bugün", cat: "İçerik" },
              { text: "Lab çalışmaları biraz daha uzun olabilir.", date: "Dün", cat: "Süre" },
              { text: "Konu örnekleri harika, teşekkürler.", date: "15 Şub", cat: "Anlatım" }
            ].map((note, i) => (
              <div key={i} style={{padding: '1rem', background: '#f8fafc', borderRadius: '16px', border: '1px solid #f1f5f9'}}>
                <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '8px'}}>
                   <div style={{display: 'flex', gap: '8px', alignItems: 'center'}}>
                     <span style={{fontSize: '10px', fontWeight: 800, color: '#6366f1', textTransform: 'uppercase'}}>{note.cat}</span>
                     <span style={{fontSize: '10px', fontWeight: 700, color: '#94a3b8'}}>• Anonim Öğrenci</span>
                   </div>
                   <span style={{fontSize: '10px', color: '#94a3b8', fontWeight: 700}}>{note.date}</span>
                </div>
                <p style={{margin: 0, fontSize: '0.9rem', color: '#334155', fontWeight: 500, lineHeight: 1.5}}>"{note.text}"</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default TeacherSurveys
