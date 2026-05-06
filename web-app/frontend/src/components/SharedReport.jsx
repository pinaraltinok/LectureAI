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

  // ── Turkish label maps matching the PDF output ──
  const ILETISIM_LABELS = {
    ders_dinamikleri: 'Ders dinamikleri', mod_tutum: 'Mod & Tutum',
    saygi_sinirlar: 'Saygı ve sınırlar', tesvik_motivasyon: 'Teşvik & Motivasyon',
    hatalar: 'Hatalar', acik_uclu_sorular: 'Açık uçlu sorular',
    empati_destekleyici: 'Empati & Destekleyici tutum', etik_degerler: 'Etik Değerler',
  }
  const HAZIRLIK_LABELS = {
    ders_akisi_tempo: 'Ders akışı & Tempo', konu_bilgisi: 'Konu bilgisi',
    aciklama_netligi: 'Açıklama netliği', rasyonel_ipucu: 'Rasyonel & İpucu',
  }
  const ORGANIZASYON_LABELS = {
    gorsel_bilesenler: 'Görsel Bileşenler', konusma_ses_tonu: 'Konuşma & Ses tonu',
    teknik_bilesen: 'Teknik bileşen', zamanlama: 'Zamanlama',
  }
  const RATING_LABELS = {
    good: 'İyi', iyi: 'İyi', acceptable: 'Geliştirilmeli', 'geliştirilmeli': 'Geliştirilmeli',
    'kabul edilebilir': 'Geliştirilmeli', poor: 'Yetersiz', 'zayıf': 'Yetersiz', 'yetersiz': 'Yetersiz',
    na: 'Değerlendirilemedi', 'değerlendirilemedi': 'Değerlendirilemedi',
  }

  const ratingColor = (r) => {
    if (!r) return '#94a3b8'
    const val = (r || '').toLowerCase()
    if (val === 'good' || val === 'iyi' || val === 'İyi') return '#10b981'
    if (val === 'acceptable' || val === 'kabul edilebilir' || val === 'geliştirilmeli' || val === 'Geliştirilmeli') return '#f59e0b'
    if (val === 'poor' || val === 'zayıf' || val === 'yetersiz' || val === 'Yetersiz') return '#f43f5e'
    return '#94a3b8'
  }
  const ratingLabel = (r) => RATING_LABELS[(r || '').toLowerCase()] || r || '—'

  // Build competency groups matching the PDF's three-category structure
  const buildCategoryMetrics = (data, labelMap) => {
    if (!data) return []
    return Object.entries(labelMap).map(([key, label]) => {
      const val = data[key]
      if (!val) return null
      return { l: label, s: ratingLabel(val.rating), color: ratingColor(val.rating), obs: val.observation || '', tip: val.improvement_tip || '' }
    }).filter(Boolean)
  }

  const categoryGroups = [
    { title: 'İletişim', metrics: buildCategoryMetrics(dr.iletisim, ILETISIM_LABELS) },
    { title: 'Hazırlık', metrics: buildCategoryMetrics(dr.hazirlik, HAZIRLIK_LABELS) },
    { title: 'Organizasyon', metrics: buildCategoryMetrics(dr.organizasyon, ORGANIZASYON_LABELS) },
  ].filter(g => g.metrics.length > 0)

  const allCompetencies = categoryGroups.flatMap(g => g.metrics)



  // Lesson structure from ders_yapisi
  const lessonStructure = dr.ders_yapisi || []

  // Feedback text (only for the Geribildirim Özeti section)
  const feedbackText = dr.feedback_metni || ''

  // Overall result
  const genelSonuc = dr.genel_sonuc || 'Beklentilere uygundu.'

  return (
    <div className="report-card-internal" style={{background: '#fff', padding: '0', border: '1px solid #cbd5e1', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.05)', overflow: 'hidden', animation: 'fadeIn 0.5s ease'}}>
       {/* Document Header (Dark) */}
       <div style={{background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%)', padding: '2rem 2.5rem', color: 'white'}}>
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: '1rem'}}>
             <span style={{fontSize:'10px', fontWeight:800, color:'var(--primary)', letterSpacing:'0.2em'}}>TAM KALİTE ANALİZ RAPORU</span>
             <div style={{padding:'4px 12px', background:'rgba(255,255,255,0.1)', borderRadius:'6px', fontSize:'10px', fontWeight:700}}>REF: #QA-2026-DOC-{report.id}</div>
          </div>

          {/* Teacher Name - Prominent Display */}
          {report.name && (
            <div style={{display:'flex', alignItems:'center', gap:'16px', marginBottom:'1rem'}}>
              <div style={{
                width:'52px', height:'52px', borderRadius:'16px',
                background:'linear-gradient(135deg, #6366f1, #a855f7)',
                display:'grid', placeItems:'center',
                fontWeight:900, fontSize:'1.1rem', color:'#fff',
                boxShadow:'0 8px 20px rgba(99, 102, 241, 0.4)',
                flexShrink:0,
              }}>
                {report.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
              </div>
              <div>
                <div style={{fontSize:'1.4rem', fontWeight:900, letterSpacing:'-0.02em', lineHeight:1.2}}>
                  {report.name}
                </div>
                <div style={{fontSize:'0.78rem', fontWeight:600, color:'rgba(255,255,255,0.5)', marginTop:'2px'}}>
                  Eğitmen
                </div>
              </div>
            </div>
          )}

          <h2 style={{fontSize:'1.8rem', fontWeight:800, margin:0}}>{report.module || (report.name ? report.name + ' - Analizi' : 'Analiz Raporu')}</h2>
          <div style={{display:'flex', gap:'1.5rem', marginTop:'1rem', opacity:0.8, fontSize:'0.85rem', flexWrap:'wrap'}}>
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
          
          {/* Teaching Competencies — grouped by category like the PDF */}
          {categoryGroups.length > 0 ? categoryGroups.map((group, gi) => (
            <div key={gi} style={{border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden'}}>
              <div style={{background: '#f1f5f9', padding: '0.75rem 1rem', fontSize: '10px', fontWeight: 800, borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between'}}>
                <span>{group.title.toUpperCase()}</span>
                <span style={{color: '#94a3b8'}}>{group.metrics.length} kriter</span>
              </div>
              <div style={{fontSize: '0.85rem'}}>
                {group.metrics.map((item, i) => (
                  <div
                    key={i}
                    style={{
                      padding: '1rem 1.25rem', borderBottom: i < group.metrics.length - 1 ? '1px solid #f1f5f9' : 'none',
                      display: 'flex', gap: '1rem', alignItems: 'flex-start',
                    }}
                  >
                    {/* Label & Rating */}
                    <div style={{minWidth: '140px', flexShrink: 0}}>
                      <div style={{color: '#1e293b', fontSize: '0.82rem', fontWeight: 700, marginBottom: '4px'}}>{item.l}</div>
                      <span style={{
                        display: 'inline-block', padding: '3px 10px', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 800,
                        background: `${item.color}15`, color: item.color, border: `1px solid ${item.color}30`,
                      }}>{item.s}</span>
                    </div>
                    {/* Observation + Tip — full text like PDF */}
                    <div style={{flex: 1, minWidth: 0}}>
                      {item.obs && (
                        <div style={{fontSize: '0.82rem', color: '#475569', lineHeight: 1.7}}>
                          {parseTimestamps(item.obs, seekTo)}
                        </div>
                      )}
                      {item.tip && item.tip.trim() && (
                        <div style={{fontSize: '0.78rem', color: '#b45309', lineHeight: 1.5, marginTop: '6px', fontStyle: 'italic', display: 'flex', gap: '6px', alignItems: 'flex-start'}}>
                          <span style={{fontWeight: 800, flexShrink: 0}}>💡 Gelişim önerisi:</span>
                          <span>{item.tip}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )) : (
            /* Fallback grid when no structured data */
            allCompetencies.length > 0 && (
              <div style={{border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden'}}>
                <div style={{background: '#f1f5f9', padding: '0.75rem 1rem', fontSize: '10px', fontWeight: 800, borderBottom: '1px solid #e2e8f0'}}>
                  <span>ÖĞRETİM YETERLİLİKLERİ</span>
                </div>
                <div className="responsive-competency-grid" style={{display:'grid', gridTemplateColumns: `repeat(${Math.min(4, allCompetencies.length)}, 1fr)`, fontSize: '0.85rem'}}>
                  {allCompetencies.map((item, i) => (
                    <div key={i} style={{padding:'0.75rem 1rem', borderRight:'1px solid #f1f5f9', borderBottom:'1px solid #f1f5f9', display:'flex', flexDirection: 'column', gap: '4px'}}>
                      <span style={{color:'#64748b', fontSize: '0.8rem'}}>{item.l}</span>
                      <span style={{fontWeight:700, color: item.color, fontSize: '0.85rem'}}>{item.s}</span>
                    </div>
                  ))}
                </div>
              </div>
            )
          )}

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

          {/* Geribildirim Özeti (feedback_metni — shown only once) */}
          {feedbackText && (
            <div style={{padding: '2rem', background: 'linear-gradient(to bottom right, #f5f3ff, #fff)', borderRadius: '16px', border: '1px solid #ddd6fe'}}>
              <h4 style={{margin:'0 0 1rem 0', fontSize: '1.1rem', fontWeight: 800, color: '#4c1d95'}}>Geribildirim Özeti</h4>
              <div style={{fontSize: '0.92rem', color: '#4c1d95', lineHeight: 1.8}}>
                {feedbackText.split('\n\n').filter(p => p.trim()).map((paragraph, pi) => (
                  <p key={pi} style={{margin: '0 0 0.75rem 0'}}>{parseTimestamps(paragraph, seekTo)}</p>
                ))}
              </div>
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
