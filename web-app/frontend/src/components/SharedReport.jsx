import React from 'react'

const SharedReport = ({ report }) => {
  if (!report) return null;

  return (
    <div className="report-card-internal" style={{background: '#fff', padding: '0', border: '1px solid #cbd5e1', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.05)', overflow: 'hidden', animation: 'fadeIn 0.5s ease'}}>
       {/* Document Header (Dark) */}
       <div style={{background: 'linear-gradient(135deg, #0f172a 0%, #334155 100%)', padding: '2rem 2.5rem', color: 'white'}}>
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: '1rem'}}>
             <span style={{fontSize:'10px', fontWeight:800, color:'var(--primary)', letterSpacing:'0.2em'}}>TAM KALİTE ANALİZ RAPORU</span>
             <div style={{padding:'4px 12px', background:'rgba(255,255,255,0.1)', borderRadius:'6px', fontSize:'10px', fontWeight:700}}>REF: #QA-2026-DOC-{report.id}</div>
          </div>
          <h2 style={{fontSize:'1.8rem', fontWeight:800, margin:0}}>{report.module || (report.name + " - Analizi")}</h2>
          <div style={{display:'flex', gap:'1.5rem', marginTop:'1rem', opacity:0.8, fontSize:'0.85rem'}}>
             <span>📅 {report.date || report.details?.date}</span>
             <span>👥 {report.group || report.details?.group}</span>
             <span>👤 Değerlendiren: {report.evaluator || report.details?.evaluator || 'QA Uzmanı'}</span>
          </div>
       </div>

       {/* Meta Info Bar (Gray) */}
       <div style={{background: '#f8fafc', padding: '1.25rem 2.5rem', borderBottom: '1px solid #cbd5e1', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1.5rem'}}>
          <div>
            <span style={{fontSize:'8px', fontWeight:800, color:'#64748b', display:'block', textTransform:'uppercase'}}>Genel Sonuç</span>
            <span style={{fontSize:'0.9rem', fontWeight:700, color:'#10b981'}}>Beklentilere Uygun</span>
          </div>
          <div>
            <span style={{fontSize:'8px', fontWeight:800, color:'#64748b', display:'block', textTransform:'uppercase'}}>Yeterlilik</span>
            <span style={{fontSize:'0.9rem', fontWeight:700, color:'#0f172a'}}>{report.quality || report.details?.kpis?.quality || '%95'}</span>
          </div>
          <div>
            <span style={{fontSize:'8px', fontWeight:800, color:'#64748b', display:'block', textTransform:'uppercase'}}>Konuşma Süresi (TTT)</span>
            <span style={{fontSize:'0.9rem', fontWeight:700, color:'#0f172a'}}>{report.ttt || report.details?.kpis?.ttt || '%30'}</span>
          </div>
          <div>
            <span style={{fontSize:'8px', fontWeight:800, color:'#64748b', display:'block', textTransform:'uppercase'}}>Gerçekleşen Süre</span>
            <span style={{fontSize:'0.9rem', fontWeight:700, color:'#0f172a'}}>{report.duration || report.details?.kpis?.duration || '60dk'}</span>
          </div>
       </div>

       {/* Detailed Body */}
       <div style={{padding: '2.5rem', display: 'flex', flexDirection: 'column', gap: '2.5rem'}}>
          {/* Teaching Competencies Grid */}
          <div style={{border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden'}}>
            <div style={{background: '#f1f5f9', padding: '0.75rem 1rem', fontSize: '10px', fontWeight: 800, borderBottom: '1px solid #e2e8f0'}}>ÖĞRETİM YETERLİLİKLERİ</div>
            <div style={{display:'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', fontSize: '0.85rem'}}>
              {[
                { l: 'İletişim', s: 'Good' }, { l: 'Hazırlık', s: 'Good' }, { l: 'Motivasyon', s: 'Good' }, { l: 'Ders Yapısı', s: 'Good' },
                { l: 'Tempo', s: 'Good' }, { l: 'Konu Bilgisi', s: 'Good' }, { l: 'Açıklama Netliği', s: 'Good' }, { l: 'Teknik Hâkimiyet', s: 'Good' }
              ].map((item, i) => (
                <div key={i} style={{padding:'0.75rem 1rem', borderRight:'1px solid #f1f5f9', borderBottom:'1px solid #f1f5f9', display:'flex', justifyContent:'space-between'}}>
                  <span style={{color:'#64748b'}}>{item.l}</span>
                  <span style={{fontWeight:700, color: '#10b981'}}>{item.s}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Observations Section */}
          <div>
            <h4 style={{fontSize: '0.95rem', fontWeight: 800, color: '#1e293b', marginBottom: '1.25rem'}}>Analiz Kanıtları & Gözlemler</h4>
            <div style={{display:'flex', flexDirection:'column', gap:'1rem'}}>
               {(report.obs || report.details?.obs || [
                 { t: 'Motivasyon', c: 'Kısa övgüler kullanılmıştır (13:37, 20:08). "Süpersin" gibi ifadelerle etkileşim artırılmıştır.' },
                 { t: 'Ders Akışı', c: 'Teknik, görsel veya işitsel bir problem yaşanmadı.' }
               ]).map((o, idx) => (
                  <div key={idx} style={{padding:'1.25rem', background:'#f8fafc', borderRadius:'12px', border:'1px solid #f1f5f9', fontSize:'0.85rem', color:'#475569', lineHeight:1.6}}>
                    <strong style={{color:'var(--primary)'}}>{o.t}:</strong> {o.c}
                  </div>
               ))}
            </div>
          </div>

          {/* Verbatim Feedback Block */}
          <div style={{padding: '2rem', background: 'linear-gradient(to bottom right, #f5f3ff, #fff)', borderRadius: '24px', border: '1px solid #ddd6fe'}}>
            <h4 style={{margin:'0 0 1rem 0', fontSize: '1.1rem', fontWeight: 800, color: '#4c1d95'}}>Geribildirim Özeti</h4>
            <p style={{fontSize: '0.92rem', color: '#4c1d95', lineHeight: 1.8}}>
              Eğitmen ders içeriğine hakimiyeti ve öğrencilerle kurduğu dinamik iletişimle standardın üzerinde bir performans sergilemiştir. TTT oranı ideal sınırda kalmış olup, teknik araçların kullanımı akıcıdır.
            </p>
          </div>
       </div>
    </div>
  )
}

export default SharedReport
