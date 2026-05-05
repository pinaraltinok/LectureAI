import React, { useRef, useState, useCallback } from 'react'
import { useGcsUrl } from '../hooks/useGcsUrl'

/**
 * Parses text and converts timestamp patterns like (00:24:34) or (13:37) 
 * into clickable elements that seek the embedded video.
 */
function parseTimestamps(text, onTimestampClick) {
  if (!text) return text
  // Match patterns: (HH:MM:SS), (MM:SS), or standalone HH:MM:SS, MM:SS
  const regex = /\((\d{1,2}:\d{2}(?::\d{2})?)\)|(?<!\d)(\d{1,2}:\d{2}:\d{2})(?!\d)/g
  const parts = []
  let lastIndex = 0
  let match

  while ((match = regex.exec(text)) !== null) {
    const timeStr = match[1] || match[2]
    if (lastIndex < match.index) {
      parts.push(text.slice(lastIndex, match.index))
    }
    const seconds = timeToSeconds(timeStr)
    parts.push(
      <button
        key={match.index}
        onClick={(e) => { e.stopPropagation(); onTimestampClick(seconds) }}
        style={{
          background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
          color: '#fff',
          border: 'none',
          padding: '2px 10px',
          borderRadius: '6px',
          fontSize: '0.8rem',
          fontWeight: 800,
          cursor: 'pointer',
          fontFamily: 'monospace',
          letterSpacing: '0.03em',
          transition: 'all 0.2s ease',
          boxShadow: '0 2px 8px rgba(99, 102, 241, 0.3)',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          verticalAlign: 'baseline',
          margin: '0 2px',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'scale(1.08)'
          e.currentTarget.style.boxShadow = '0 4px 12px rgba(99, 102, 241, 0.5)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'scale(1)'
          e.currentTarget.style.boxShadow = '0 2px 8px rgba(99, 102, 241, 0.3)'
        }}
        title={`Videoda ${timeStr} saniyesine git`}
      >
        ▶ {timeStr}
      </button>
    )
    lastIndex = match.index + match[0].length
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex))
  }

  return parts.length > 0 ? parts : text
}

function timeToSeconds(timeStr) {
  const parts = timeStr.split(':').map(Number)
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  return 0
}

function formatTime(seconds) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

const SharedReport = ({ report }) => {
  const videoRef = useRef(null)
  const videoRetryRef = useRef(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [videoDuration, setVideoDuration] = useState(0)
  const [isVideoVisible, setIsVideoVisible] = useState(true)
  const [videoError, setVideoError] = useState(null)

  const rawVideoUrl = report?.videoUrl || null
  const localVideoUrl = report?.localVideoUrl || null
  const rawPdfUrl = report?.pdfUrl || report?.draftReport?.pdfUrl || report?.finalReport?.pdfUrl || (() => {
    // Auto-construct PDF URL from video URL if available
    if (rawVideoUrl && rawVideoUrl.startsWith('gs://')) {
      const filename = rawVideoUrl.split('/').pop()?.replace(/\.[^.]+$/, '')
      if (filename) return `gs://lectureai_processed/pdfs/${filename}.pdf`
    }
    return null
  })()

  // Always fetch GCS signed URL as fallback (even if localVideoUrl exists)
  const hasGcsUrl = rawVideoUrl && (rawVideoUrl.startsWith('gs://') || rawVideoUrl.includes('storage.googleapis.com'))
  const { signedUrl: gcsVideoUrl, loading: gcsLoading, refresh: refreshVideo } = useGcsUrl(hasGcsUrl ? rawVideoUrl : null)
  
  // Build a backend stream proxy URL (most reliable on Cloud Run — no key file needed)
  const gcsStreamUrl = (() => {
    if (!hasGcsUrl) return null
    const match = rawVideoUrl.match(/^gs:\/\/([^/]+)\/(.+)$/)
    if (match) return `/api/gcs/stream?bucket=${encodeURIComponent(match[1])}&object=${encodeURIComponent(match[2])}`
    const httpsMatch = rawVideoUrl.match(/^https:\/\/storage\.googleapis\.com\/([^/]+)\/(.+)$/)
    if (httpsMatch) return `/api/gcs/stream?bucket=${encodeURIComponent(httpsMatch[1])}&object=${encodeURIComponent(httpsMatch[2])}`
    return null
  })()
  
  // State to track if local video failed (so we fallback to GCS)
  const [localFailed, setLocalFailed] = useState(false)
  
  // Priority: local path → GCS stream proxy (always works) → GCS signed URL
  const videoUrl = (!localFailed && localVideoUrl) ? localVideoUrl : (gcsStreamUrl || gcsVideoUrl || localVideoUrl || null)
  const videoLoading = false // stream proxy doesn't need loading state
  const { signedUrl: pdfUrl, loading: pdfLoading, refresh: refreshPdf } = useGcsUrl(rawPdfUrl)

  const [isPdfVisible, setIsPdfVisible] = useState(false)

  const seekTo = useCallback((seconds) => {
    if (videoRef.current) {
      videoRef.current.currentTime = seconds
      videoRef.current.play()
      setIsVideoVisible(true)
      // Scroll to video player
      videoRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
    } else if (videoUrl) {
      setIsVideoVisible(true)
      // Wait for video element to mount, then seek
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.currentTime = seconds
          videoRef.current.play()
        }
      }, 300)
    }
  }, [videoUrl])

  if (!report) return null

  // Build competency data from real report or fallback
  const dr = report.draftReport || report.finalReport || {}
  
  const buildCompetencies = () => {
    const competencies = []
    const ratingColor = (r) => {
      if (!r) return '#94a3b8'
      const val = (r || '').toLowerCase()
      if (val === 'good' || val === 'iyi') return '#10b981'
      if (val === 'acceptable' || val === 'kabul edilebilir') return '#f59e0b'
      if (val === 'poor' || val === 'zayıf') return '#f43f5e'
      return '#94a3b8'
    }
    
    // From iletisim
    if (dr.iletisim) {
      Object.entries(dr.iletisim).forEach(([key, val]) => {
        competencies.push({ l: key.replace(/_/g, ' '), s: val.rating || '—', color: ratingColor(val.rating), obs: val.observation, tip: val.improvement_tip })
      })
    }
    // From hazirlik
    if (dr.hazirlik) {
      Object.entries(dr.hazirlik).forEach(([key, val]) => {
        competencies.push({ l: key.replace(/_/g, ' '), s: val.rating || '—', color: ratingColor(val.rating), obs: val.observation, tip: val.improvement_tip })
      })
    }
    // From organizasyon
    if (dr.organizasyon) {
      Object.entries(dr.organizasyon).forEach(([key, val]) => {
        competencies.push({ l: key.replace(/_/g, ' '), s: val.rating || '—', color: ratingColor(val.rating), obs: val.observation, tip: val.improvement_tip })
      })
    }
    
    if (competencies.length === 0) {
      return [
        { l: 'İletişim', s: 'Good', color: '#10b981' }, { l: 'Hazırlık', s: 'Good', color: '#10b981' },
        { l: 'Motivasyon', s: 'Good', color: '#10b981' }, { l: 'Ders Yapısı', s: 'Good', color: '#10b981' },
        { l: 'Tempo', s: 'Good', color: '#10b981' }, { l: 'Konu Bilgisi', s: 'Good', color: '#10b981' },
        { l: 'Açıklama Netliği', s: 'Good', color: '#10b981' }, { l: 'Teknik Hâkimiyet', s: 'Good', color: '#10b981' }
      ]
    }
    return competencies
  }

  const competencies = buildCompetencies()
  
  // Lesson structure from ders_yapisi
  const lessonStructure = dr.ders_yapisi || []

  // Feedback text
  const feedbackText = dr.feedback_metni || report.obs?.find(o => o.t === 'AI Değerlendirmesi')?.c || ''

  // Overall result
  const genelSonuc = dr.genel_sonuc || 'Beklentilere uygundu.'

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

       {/* Embedded Video Player */}
       {videoUrl && (
         <div style={{background: '#0a0a0a', borderBottom: '1px solid #1e293b'}}>
           <div style={{
             display: 'flex', justifyContent: 'space-between', alignItems: 'center',
             padding: '0.75rem 2.5rem', background: '#111827', borderBottom: '1px solid #1f2937'
           }}>
             <div style={{display: 'flex', alignItems: 'center', gap: '10px'}}>
               <div style={{width: '8px', height: '8px', background: '#10b981', borderRadius: '50%', animation: 'pulse 2s infinite'}}></div>
               <span style={{fontSize: '11px', fontWeight: 800, color: '#94a3b8', letterSpacing: '0.08em'}}>DERS KAYDI ÖNİZLEME</span>
             </div>
             <button
               onClick={() => setIsVideoVisible(!isVideoVisible)}
               style={{
                 background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                 color: '#94a3b8', padding: '4px 14px', borderRadius: '8px',
                 fontSize: '11px', fontWeight: 700, cursor: 'pointer'
               }}
             >
               {isVideoVisible ? '▲ Gizle' : '▼ Göster'}
             </button>
           </div>
           
           {isVideoVisible && (
             <div style={{padding: '1.5rem 2.5rem 1.5rem'}}>
               {videoLoading ? (
                 <div style={{display:'flex', alignItems:'center', gap:'12px', color:'#94a3b8', padding:'2rem', justifyContent:'center'}}>
                   <div style={{width:'24px',height:'24px',borderRadius:'50%',border:'3px solid #1f2937',borderTopColor:'#6366f1',animation:'spin 1s linear infinite'}}></div>
                   <span style={{fontSize:'12px',fontWeight:700}}>Video hazırlanıyor...</span>
                 </div>
               ) : (
                 <>
                   <video
                     ref={videoRef}
                     src={videoUrl}
                     controls
                     preload="metadata"
                     onTimeUpdate={(e) => setCurrentTime(e.target.currentTime)}
                     onLoadedMetadata={(e) => { setVideoDuration(e.target.duration); setVideoError(null); videoRetryRef.current = 0 }}
                     onError={() => {
                       // If local URL failed, switch to GCS stream proxy or signed URL
                       if (localVideoUrl && !localFailed && (gcsStreamUrl || gcsVideoUrl)) {
                         console.warn('[SharedReport] Local video failed, switching to GCS stream proxy')
                         setLocalFailed(true)
                         setVideoError('GCS üzerinden yükleniyor...')
                         setTimeout(() => setVideoError(null), 3000)
                         return
                       }
                       if (videoRetryRef.current < 2) {
                         videoRetryRef.current += 1
                         console.warn('[SharedReport] Video load error, retry', videoRetryRef.current)
                         setVideoError('Video yenileniyor...')
                         refreshVideo()
                         setTimeout(() => setVideoError(null), 3000)
                       } else {
                         setVideoError('Video şu anda yüklenemiyor. Lütfen sayfayı yenileyin.')
                       }
                     }}
                     style={{width:'100%', maxHeight:'450px', borderRadius:'16px', background:'#000', boxShadow:'0 20px 40px rgba(0,0,0,0.5)'}}
                   />
                   {videoError && (
                     <div style={{display:'flex', alignItems:'center', gap:'8px', padding:'8px 16px', background:'rgba(245,158,11,0.1)', border:'1px solid rgba(245,158,11,0.3)', borderRadius:'8px', marginTop:'8px', color:'#f59e0b', fontSize:'12px', fontWeight:600}}>
                       {videoError}
                     </div>
                   )}
                   <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:'0.75rem', padding:'0 0.5rem'}}>
                     <span style={{fontSize:'12px', fontWeight:700, color:'#64748b', fontFamily:'monospace'}}>
                       ⏱ {formatTime(currentTime)} / {formatTime(videoDuration)}
                     </span>
                     <span style={{fontSize:'10px', color:'#475569', fontWeight:600}}>
                       💡 Rapordaki zaman damgalarına tıklayarak ilgili anı izleyebilirsiniz
                     </span>
                   </div>
                 </>
               )}
             </div>
           )}
         </div>
       )}

       {/* PDF Evaluation Viewer */}
       {pdfUrl && (
         <div style={{background: '#0a0a0a', borderBottom: '1px solid #1e293b'}}>
           <div style={{
             display: 'flex', justifyContent: 'space-between', alignItems: 'center',
             padding: '0.75rem 2.5rem', background: '#111827', borderBottom: '1px solid #1f2937'
           }}>
             <div style={{display: 'flex', alignItems: 'center', gap: '10px'}}>
               <span style={{fontSize: '1.1rem'}}>📄</span>
               <span style={{fontSize: '11px', fontWeight: 800, color: '#94a3b8', letterSpacing: '0.08em'}}>TAM DEĞERLENDİRME RAPORU (PDF)</span>
             </div>
             <div style={{display: 'flex', gap: '8px', alignItems: 'center'}}>
               <a href={pdfUrl} target="_blank" rel="noopener noreferrer"
                 style={{background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)', color: '#a5b4fc', padding: '4px 14px', borderRadius: '8px', fontSize: '11px', fontWeight: 700, textDecoration: 'none'}}>
                 ↗ Yeni Sekmede Aç
               </a>
               <button onClick={() => setIsPdfVisible(v => !v)}
                 style={{background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8', padding: '4px 14px', borderRadius: '8px', fontSize: '11px', fontWeight: 700, cursor: 'pointer'}}>
                 {isPdfVisible ? '▲ Gizle' : '▼ Göster'}
               </button>
             </div>
           </div>
           {isPdfVisible && (
             <div style={{padding: '1.5rem 2.5rem'}}>
               <iframe
                 src={`${pdfUrl}#toolbar=1&view=FitH`}
                 title="Değerlendirme Raporu"
                 style={{width:'100%', height:'700px', border:'none', borderRadius:'16px', background:'#fff', boxShadow:'0 20px 40px rgba(0,0,0,0.5)', display:'block'}}
               />
               <div style={{textAlign:'center', marginTop:'0.75rem'}}>
                 <a href={pdfUrl} target="_blank" rel="noopener noreferrer"
                   style={{fontSize:'12px', color:'#6366f1', fontWeight:700, textDecoration:'none'}}>
                   PDF görüntülenemiyor mu? → Yeni sekmede aç
                 </a>
               </div>
             </div>
           )}
         </div>
       )}

       {/* Meta Info Bar (Gray) */}
       <div className="responsive-report-stats" style={{background: '#f8fafc', padding: '1.25rem 2.5rem', borderBottom: '1px solid #cbd5e1', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1.5rem'}}>
          <div>
            <span style={{fontSize:'8px', fontWeight:800, color:'#64748b', display:'block', textTransform:'uppercase'}}>Genel Sonuç</span>
            <span style={{fontSize:'0.9rem', fontWeight:700, color: genelSonuc.includes('üzerinde') ? '#10b981' : genelSonuc.includes('altında') ? '#f43f5e' : '#10b981'}}>{genelSonuc}</span>
          </div>
          <div>
            <span style={{fontSize:'8px', fontWeight:800, color:'#64748b', display:'block', textTransform:'uppercase'}}>Yeterlilik</span>
            <span style={{fontSize:'0.9rem', fontWeight:700, color:'#0f172a'}}>{report.quality || dr.yeterlilikler || '—'}</span>
          </div>
          <div>
            <span style={{fontSize:'8px', fontWeight:800, color:'#64748b', display:'block', textTransform:'uppercase'}}>Konuşma Süresi (TTT)</span>
            <span style={{fontSize:'0.9rem', fontWeight:700, color:'#0f172a'}}>{report.ttt || dr.speaking_time_rating || '—'}</span>
          </div>
          <div>
            <span style={{fontSize:'8px', fontWeight:800, color:'#64748b', display:'block', textTransform:'uppercase'}}>Gerçekleşen Süre</span>
            <span style={{fontSize:'0.9rem', fontWeight:700, color:'#0f172a'}}>{report.duration || (dr.actual_duration_min ? `${dr.actual_duration_min}dk` : '—')}</span>
          </div>
       </div>

       {/* Detailed Body */}
       <div className="responsive-report-body" style={{padding: '2.5rem', display: 'flex', flexDirection: 'column', gap: '2.5rem'}}>
          
          {/* Teaching Competencies Grid */}
          <div style={{border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden'}}>
            <div style={{background: '#f1f5f9', padding: '0.75rem 1rem', fontSize: '10px', fontWeight: 800, borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between'}}>
              <span>ÖĞRETİM YETERLİLİKLERİ</span>
              <span style={{color: '#94a3b8'}}>Toplam {competencies.length} kriter</span>
            </div>
            <div className="responsive-competency-grid" style={{display:'grid', gridTemplateColumns: `repeat(${Math.min(4, competencies.length)}, 1fr)`, fontSize: '0.85rem'}}>
              {competencies.map((item, i) => (
                <div 
                  key={i} 
                  style={{
                    padding:'0.75rem 1rem', borderRight:'1px solid #f1f5f9', borderBottom:'1px solid #f1f5f9',
                    display:'flex', flexDirection: 'column', gap: '4px',
                    cursor: item.obs ? 'pointer' : 'default',
                    transition: '0.2s',
                  }}
                  title={item.obs ? `${item.obs}${item.tip ? '\n\n💡 ' + item.tip : ''}` : ''}
                >
                  <span style={{color:'#64748b', fontSize: '0.8rem', textTransform: 'capitalize'}}>{item.l}</span>
                  <span style={{fontWeight:700, color: item.color || '#10b981', fontSize: '0.85rem'}}>{item.s}</span>
                  {item.obs && (
                    <span style={{fontSize: '0.72rem', color: '#94a3b8', lineHeight: 1.4, marginTop: '2px'}}>
                      {parseTimestamps(item.obs.length > 60 ? item.obs.slice(0, 60) + '...' : item.obs, seekTo)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Lesson Structure */}
          {lessonStructure.length > 0 && (
            <div style={{border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden'}}>
              <div style={{background: '#f1f5f9', padding: '0.75rem 1rem', fontSize: '10px', fontWeight: 800, borderBottom: '1px solid #e2e8f0'}}>DERS YAPISI KONTROL LİSTESİ</div>
              <div style={{display: 'flex', flexWrap: 'wrap', padding: '1rem', gap: '8px'}}>
                {lessonStructure.map((item, i) => (
                  <span key={i} style={{
                    padding: '6px 14px', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 700,
                    background: item.completed ? '#f0fdf4' : '#fef2f2',
                    color: item.completed ? '#15803d' : '#b91c1c',
                    border: `1px solid ${item.completed ? '#bbf7d0' : '#fecaca'}`,
                  }}>
                    {item.completed ? '✓' : '✗'} {item.item}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Observations Section with Clickable Timestamps */}
          <div>
            <h4 style={{fontSize: '0.95rem', fontWeight: 800, color: '#1e293b', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '8px'}}>
              Analiz Kanıtları & Gözlemler
              {videoUrl && <span style={{fontSize: '10px', fontWeight: 700, color: '#6366f1', background: '#f5f3ff', padding: '3px 10px', borderRadius: '6px'}}>🎬 Zaman damgalarına tıklayarak video önizleme yapabilirsiniz</span>}
            </h4>
            <div style={{display:'flex', flexDirection:'column', gap:'1rem'}}>
               {(report.obs || report.details?.obs || [
                 { t: 'Gözlem', c: 'Rapor detayları henüz yüklenmedi.' }
               ]).map((o, idx) => (
                  <div key={idx} style={{padding:'1.25rem', background:'#f8fafc', borderRadius:'12px', border:'1px solid #f1f5f9', fontSize:'0.85rem', color:'#475569', lineHeight:1.8}}>
                    <strong style={{color:'var(--primary)'}}>{o.t}:</strong>{' '}
                    {parseTimestamps(o.c, seekTo)}
                  </div>
               ))}
            </div>
          </div>

          {/* Verbatim Feedback Block */}
          {feedbackText && (
            <div style={{padding: '2rem', background: 'linear-gradient(to bottom right, #f5f3ff, #fff)', borderRadius: '16px', border: '1px solid #ddd6fe'}}>
              <h4 style={{margin:'0 0 1rem 0', fontSize: '1.1rem', fontWeight: 800, color: '#4c1d95'}}>Geribildirim Özeti</h4>
              <p style={{fontSize: '0.92rem', color: '#4c1d95', lineHeight: 1.8}}>
                {parseTimestamps(feedbackText, seekTo)}
              </p>
            </div>
          )}

          {!feedbackText && (
            <div style={{padding: '2rem', background: 'linear-gradient(to bottom right, #f5f3ff, #fff)', borderRadius: '16px', border: '1px solid #ddd6fe'}}>
              <h4 style={{margin:'0 0 1rem 0', fontSize: '1.1rem', fontWeight: 800, color: '#4c1d95'}}>Geribildirim Özeti</h4>
              <p style={{fontSize: '0.92rem', color: '#4c1d95', lineHeight: 1.8}}>
                Eğitmen ders içeriğine hakimiyeti ve öğrencilerle kurduğu dinamik iletişimle standardın üzerinde bir performans sergilemiştir.
              </p>
            </div>
          )}
       </div>

       <style>{`
         @keyframes pulse {
           0%, 100% { opacity: 1; }
           50% { opacity: 0.5; }
         }
       `}</style>
    </div>
  )
}

export default SharedReport
