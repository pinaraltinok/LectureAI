import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiGet, apiPost, apiUpload } from '../api'
import SharedReport from '../components/SharedReport.jsx'

const AnalysisWorkflow = ({ onStepChange }) => {
  const [step, setStep] = useState('upload')
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [adminNote, setAdminNote] = useState('')
  const [isRegenerating, setIsRegenerating] = useState(false)
  const [selectedFile, setSelectedFile] = useState(null)
  const [selectedTeacherId, setSelectedTeacherId] = useState('')
  const [selectedCurriculumId, setSelectedCurriculumId] = useState('')
  const [selectedLessonCode, setSelectedLessonCode] = useState('M1L1')
  const [currentJobId, setCurrentJobId] = useState(null)
  const [draftData, setDraftData] = useState(null)
  const [teachers, setTeachers] = useState([])
  const [curricula, setCurricula] = useState([])
  const [error, setError] = useState('')
  const fileInputRef = useRef(null)
  const navigate = useNavigate()

  // Helper: generate module/lesson codes from a curriculum object
  const generateLessonCodes = (c) => {
    if (!c) return []
    const codes = []
    for (let m = 1; m <= c.modules; m++) {
      for (let l = 1; l <= c.lessonsPerModule; l++) {
        codes.push({ code: `M${m}L${l}`, module: m, lesson: l })
      }
    }
    return codes
  }

  const selectedCurriculum = curricula.find(c => c.id === selectedCurriculumId) || curricula[0] || null
  const lessonCodes = generateLessonCodes(selectedCurriculum)

  useEffect(() => {
    Promise.all([
      apiGet('/admin/teachers'),
      apiGet('/admin/curricula'),
    ]).then(([t, c]) => {
      setTeachers(t)
      if (t.length > 0) setSelectedTeacherId(t[0].id)
      setCurricula(c)
      if (c.length > 0) setSelectedCurriculumId(c[0].id)
    }).catch(err => setError(err.message))
  }, [])

  // Reset lesson code when curriculum changes
  useEffect(() => {
    setSelectedLessonCode('M1L1')
  }, [selectedCurriculumId])

  const handleUploadAndAnalyze = async () => {
    if (!selectedTeacherId) {
      setError('Lütfen bir eğitmen seçin.')
      return
    }

    setIsAnalyzing(true)
    setIsRegenerating(false)
    setError('')

    try {
      // Step 1: Upload
      const formData = new FormData()
      if (selectedFile) {
        formData.append('video', selectedFile)
      }
      const uploadRes = await apiUpload('/admin/analysis/upload', formData)
      const jobId = uploadRes.jobId

      // Step 2: Assign with curriculum + lesson code metadata
      const curriculumLabel = selectedCurriculum
        ? `[${selectedCurriculum.code}] ${selectedCurriculum.name} [${selectedCurriculum.year}][${selectedCurriculum.ageRange}][${selectedCurriculum.durationMin}m][${selectedCurriculum.totalLessons}L][${selectedCurriculum.language}]`
        : ''
      await apiPost('/admin/analysis/assign', {
        jobId,
        teacherId: selectedTeacherId,
        curriculumId: selectedCurriculumId,
        curriculumName: curriculumLabel,
        lessonCode: selectedLessonCode,
      })

      setCurrentJobId(jobId)

      // Step 3: Fetch draft
      try {
        const draft = await apiGet(`/admin/analysis/draft/${jobId}`)
        setDraftData(draft)
      } catch {
        setDraftData({
          jobId,
          status: 'PROCESSING',
          draftReport: null,
          teacher: teachers.find(t => t.id === selectedTeacherId),
          curriculum: selectedCurriculum,
          lessonCode: selectedLessonCode,
        })
      }

      setStep('preview')
      onStepChange('preview')
    } catch (err) {
      setError(err.message)
    } finally {
      setIsAnalyzing(false)
    }
  }

  const handleRegenerate = async () => {
    if (!currentJobId || !adminNote) return
    setIsAnalyzing(true)
    setIsRegenerating(true)
    setError('')

    try {
      await apiPost('/admin/analysis/regenerate', {
        jobId: currentJobId,
        feedback: adminNote,
      })
      const draft = await apiGet(`/admin/analysis/draft/${currentJobId}`)
      setDraftData(draft)
      setAdminNote('')
      setStep('preview')
      onStepChange('preview')
    } catch (err) {
      setError(err.message)
    } finally {
      setIsAnalyzing(false)
      setIsRegenerating(false)
    }
  }

  const handleFinalize = async () => {
    if (!currentJobId) return
    setError('')

    try {
      await apiPost('/admin/analysis/finalize', { jobId: currentJobId })
      setStep('success')
      onStepChange('success')
    } catch (err) {
      setError(err.message)
    }
  }

  const handleStep = (newStep) => {
    setStep(newStep)
    onStepChange(newStep)
  }

  if (isAnalyzing) {
    return (
      <div style={{display:'grid', placeItems:'center', minHeight:'500px', textAlign:'center', animation: 'fadeIn 0.5s ease'}}>
        <div style={{maxWidth: '430px'}}>
          <div style={{
            width: '80px', height: '80px', borderRadius: '50%', border: '4px solid #f1f5f9',
            borderTopColor: isRegenerating ? '#10b981' : '#6366f1', margin: '0 auto 2rem', animation: 'spin 1s linear infinite'
          }}></div>
          <h2 style={{fontSize:'2.2rem', fontWeight:950, color: '#0f172a', letterSpacing: '-0.02em'}}>
            {isRegenerating ? 'Rapor Optimize Ediliyor' : 'Video Yükleniyor & Analiz Başlıyor'}
          </h2>
          <p style={{color:'#64748b', fontWeight:600, lineHeight: 1.6}}>
            {isRegenerating 
              ? 'Geri bildirimleriniz AI modelimize aktarıldı. Rapor içeriği ve skorlamalar notlarınıza göre yeniden hesaplanıyor...' 
              : 'Video sunucuya yükleniyor ve analiz kuyruğuna ekleniyor. Lütfen bekleyin...'}
          </p>
        </div>
        <style>{`
          @keyframes spin { 100% { transform: rotate(360deg); } }
        `}</style>
      </div>
    )
  }

  if (step === 'upload') {
    return (
      <div className="workflow-container" style={{animation: 'fadeIn 0.5s ease'}}>
        {/* Header */}
        <div style={{marginBottom: '3rem'}}>
           <h1 style={{fontSize: '2rem', fontWeight: 950, color: '#0f172a', letterSpacing: '-0.02em', margin: 0}}>Yeni Analiz Atama</h1>
           <p style={{color: '#64748b', fontSize: '1.05rem', marginTop: '4px'}}>Ders kaydını yükleyin, müfredatı ve ders numarasını seçin.</p>
        </div>

        {error && (
          <div style={{color: '#f43f5e', background: '#ffe4e6', padding: '0.75rem 1.5rem', borderRadius: '12px', fontSize: '0.9rem', marginBottom: '1.5rem', fontWeight: 600}}>
            {error}
          </div>
        )}

        <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3rem', alignItems: 'start'}}>
          {/* Left: Dropzone */}
          <div 
            onClick={() => fileInputRef.current.click()}
            style={{
              padding: '4rem 2rem', border: '2.5px dashed #e2e8f0', borderRadius: '32px',
              textAlign: 'center', cursor: 'pointer', background: selectedFile ? '#f0fdf4' : '#f8fafc', transition: '0.3s',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem'
            }}
            onMouseOver={(e) => { e.currentTarget.style.borderColor = '#6366f1'; e.currentTarget.style.background = '#f5f3ff'; }}
            onMouseOut={(e) => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.background = selectedFile ? '#f0fdf4' : '#f8fafc'; }}
          >
            <input 
              type="file" ref={fileInputRef} accept="video/mp4" style={{display: 'none'}} 
              onChange={(e) => { if (e.target.files[0]) setSelectedFile(e.target.files[0]) }}
            />
            <div style={{width: '72px', height: '72px', background: '#fff', borderRadius: '24px', display: 'grid', placeItems: 'center', fontSize: '2rem', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.05)'}}>
              {selectedFile ? '✓' : '☁'}
            </div>
            <div>
               <h3 style={{margin: '0 0 8px 0', fontSize: '1.2rem', fontWeight: 900, color: '#1e293b'}}>
                 {selectedFile ? selectedFile.name : 'Ders Kaydını Yükleyin'}
               </h3>
               <p style={{margin: 0, color: '#64748b', fontSize: '0.9rem', fontWeight: 600}}>
                 {selectedFile 
                   ? `${(selectedFile.size / (1024 * 1024)).toFixed(1)} MB — Değiştirmek için tıklayın`
                   : <>Sadece <strong style={{color: '#6366f1'}}>MP4</strong> formatı kabul edilir.</>
                 }
               </p>
            </div>
            {!selectedFile && (
              <button style={{marginTop: '1rem', padding: '0.9rem 2rem', background: '#fff', border: '1px solid #cbd5e1', borderRadius: '14px', fontWeight: 800, cursor: 'pointer', fontSize: '0.85rem'}}>Bilgisayarınızdan Seçin</button>
            )}
          </div>

          {/* Right: Metadata Form */}
          <div style={{display:'flex', flexDirection:'column', gap: '1.5rem'}}>
            
            {/* 1. Eğitmen Seçimi */}
            <div>
              <label style={{fontSize: '11px', fontWeight: 800, color: '#64748b', marginBottom: '8px', display: 'block', letterSpacing: '0.05em'}}>EĞİTMEN SEÇİMİ</label>
              <select 
                value={selectedTeacherId}
                onChange={(e) => setSelectedTeacherId(e.target.value)}
                style={{width:'100%', padding:'1rem', borderRadius:'14px', border:'1px solid #e2e8f0', fontWeight:700, outline: 'none', background:'#fff', fontSize: '0.95rem'}}
              >
                {teachers.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
                {teachers.length === 0 && <option>Eğitmen bulunamadı</option>}
              </select>
            </div>
            
            {/* 2. Müfredat Seçimi */}
            <div>
              <label style={{fontSize: '11px', fontWeight: 800, color: '#64748b', marginBottom: '8px', display: 'block', letterSpacing: '0.05em'}}>MÜFREDAT PROGRAMI</label>
              <select
                value={selectedCurriculumId}
                onChange={(e) => setSelectedCurriculumId(e.target.value)}
                style={{width:'100%', padding:'1rem', borderRadius:'14px', border:'1px solid #e2e8f0', fontWeight:700, outline: 'none', background:'#fff', fontSize: '0.9rem'}}
              >
                {curricula.length === 0 && <option value="">Yükleniyor...</option>}
                {curricula.map(c => (
                  <option key={c.id} value={c.id}>
                    [{c.code}] {c.name} [{c.year}][{c.ageRange}][{c.durationMin}m][{c.totalLessons}L][{c.language}][{c.status}]
                  </option>
                ))}
              </select>
              {/* Curriculum info badge */}
              {selectedCurriculum && (
                <div style={{display: 'flex', gap: '8px', marginTop: '10px', flexWrap: 'wrap'}}>
                  <span style={{fontSize: '10px', fontWeight: 800, color: '#6366f1', background: '#f5f3ff', padding: '4px 10px', borderRadius: '6px'}}>
                    {selectedCurriculum.modules} Modül
                  </span>
                  <span style={{fontSize: '10px', fontWeight: 800, color: '#10b981', background: '#f0fdf4', padding: '4px 10px', borderRadius: '6px'}}>
                    {selectedCurriculum.totalLessons} Ders
                  </span>
                  <span style={{fontSize: '10px', fontWeight: 800, color: '#f59e0b', background: '#fffbeb', padding: '4px 10px', borderRadius: '6px'}}>
                    {selectedCurriculum.durationMin}dk
                  </span>
                  <span style={{fontSize: '10px', fontWeight: 800, color: '#64748b', background: '#f1f5f9', padding: '4px 10px', borderRadius: '6px'}}>
                    Yaş: {selectedCurriculum.ageRange}
                  </span>
                </div>
              )}
            </div>

            {/* 3. Ders Numarası Seçimi */}
            <div>
              <label style={{fontSize: '11px', fontWeight: 800, color: '#64748b', marginBottom: '8px', display: 'block', letterSpacing: '0.05em'}}>DERS NUMARASI (MODÜL / DERS)</label>
              <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px'}}>
                {/* Module selector */}
                <select
                  value={selectedLessonCode.match(/M(\d+)/)?.[1] || '1'}
                  onChange={(e) => {
                    const mod = e.target.value
                    setSelectedLessonCode(`M${mod}L1`)
                  }}
                  style={{padding:'1rem', borderRadius:'14px', border:'1px solid #e2e8f0', fontWeight:700, outline: 'none', background:'#fff'}}
                >
                  {Array.from({ length: selectedCurriculum?.modules || 1 }, (_, i) => i + 1).map(m => (
                    <option key={m} value={m}>Modül {m}</option>
                  ))}
                </select>
                {/* Lesson selector */}
                <select
                  value={selectedLessonCode.match(/L(\d+)/)?.[1] || '1'}
                  onChange={(e) => {
                    const mod = selectedLessonCode.match(/M(\d+)/)?.[1] || '1'
                    setSelectedLessonCode(`M${mod}L${e.target.value}`)
                  }}
                  style={{padding:'1rem', borderRadius:'14px', border:'1px solid #e2e8f0', fontWeight:700, outline: 'none', background:'#fff'}}
                >
                  {Array.from({ length: selectedCurriculum?.lessonsPerModule || 1 }, (_, i) => i + 1).map(l => (
                    <option key={l} value={l}>Ders {l}</option>
                  ))}
                </select>
              </div>
              {/* Selected code badge */}
              <div style={{marginTop: '12px', display: 'flex', alignItems: 'center', gap: '10px'}}>
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: '8px',
                  padding: '10px 20px', borderRadius: '14px',
                  background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
                  color: '#fff', fontWeight: 900, fontSize: '1.1rem', fontFamily: 'monospace',
                  boxShadow: '0 8px 20px -4px rgba(99, 102, 241, 0.4)',
                  letterSpacing: '0.05em'
                }}>
                  📖 {selectedLessonCode}
                </div>
                <span style={{fontSize: '0.8rem', color: '#94a3b8', fontWeight: 600}}>
                  {selectedCurriculum?.name} — Modül {selectedLessonCode.match(/M(\d+)/)?.[1]}, Ders {selectedLessonCode.match(/L(\d+)/)?.[1]}
                </span>
              </div>
            </div>

            <button 
              className="primary-btn" 
              style={{marginTop: '1rem', padding: '1.25rem', fontSize: '1rem', boxShadow: '0 20px 25px -5px rgba(99, 102, 241, 0.4)'}} 
              onClick={handleUploadAndAnalyze}
              disabled={!selectedTeacherId}
            >
              Analizi Başlat & Raporu Hazırla
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (step === 'success') {
    return (
      <div style={{display:'grid', placeItems:'center', minHeight:'500px', textAlign:'center', animation: 'fadeIn 0.5s ease'}}>
        <div style={{maxWidth: '430px'}}>
          <div style={{width: '80px', height: '80px', borderRadius: '50%', background: '#f0fdf4', color: '#10b981', margin: '0 auto 2rem', display: 'grid', placeItems: 'center', fontSize: '2.5rem'}}>✓</div>
          <h2 style={{fontSize:'2.2rem', fontWeight:950, color: '#0f172a', letterSpacing: '-0.02em'}}>İşlem Başarılı</h2>
          <p style={{color:'#64748b', fontWeight:600, lineHeight: 1.6, marginBottom: '2.5rem'}}>
            Analiz raporu onaylandı ve eğitmen paneline başarıyla gönderildi.
          </p>
          <div style={{display: 'flex', flexDirection: 'column', gap: '1rem'}}>
             <button className="primary-btn" style={{padding: '1.1rem', borderRadius: '16px'}} onClick={() => { setSelectedFile(null); setCurrentJobId(null); setDraftData(null); handleStep('upload') }}>
               Yeni Bir Analiz Ataması Yap
             </button>
             <button className="outline-btn" style={{padding: '1.1rem', borderRadius: '16px'}} onClick={() => navigate('/admin/egitmen-havuzu')}>
               Eğitmen Listesine Git
             </button>
          </div>
        </div>
      </div>
    )
  }

  // Preview step
  const draftReport = draftData?.draftReport || {}
  const curriculumLabel = draftData?.curriculum?.label || selectedCurriculum?.label || ''
  const lessonCode = draftData?.lessonCode || selectedLessonCode
  const previewReport = {
    id: currentJobId?.slice(0, 8) || 'DRAFT',
    name: draftData?.teacher?.name || '',
    module: `${curriculumLabel} — ${lessonCode}`,
    date: draftData?.createdAt ? new Date(draftData.createdAt).toLocaleDateString('tr-TR') : new Date().toLocaleDateString('tr-TR'),
    group: lessonCode,
    evaluator: 'Sistem (AI)',
    quality: draftReport.yeterlilikler || draftReport.quality || '—',
    ttt: draftReport.speaking_time_rating || '—',
    duration: draftReport.actual_duration_min ? `${draftReport.actual_duration_min}dk` : `${selectedCurriculum?.duration || 60}dk`,
    obs: draftReport.feedback_metni 
      ? [{ t: 'AI Değerlendirmesi', c: draftReport.feedback_metni }]
      : [{ t: 'Durum', c: draftData?.status === 'PROCESSING' ? 'Analiz devam ediyor. Pipeline tamamlandığında rapor burada görünecektir.' : 'Taslak rapor henüz oluşturulmadı.' }],
    videoUrl: draftData?.videoUrl || null,
    draftReport,
  }

  return (
    <div className="workflow-container" style={{animation: 'fadeIn 0.5s ease'}}>
      <div className="alert-banner" style={{background: '#f8fafc', border: '1.5px solid #e2e8f0', borderRadius: '24px', padding: '1.5rem', marginBottom: '3rem', display: 'flex', gap: '1.25rem', alignItems: 'center'}}>
        <div style={{width: '42px', height: '42px', background: draftData?.status === 'PROCESSING' ? '#f59e0b' : '#6366f1', color: '#fff', borderRadius: '50%', display: 'grid', placeItems: 'center', fontWeight: 900}}>
          {draftData?.status === 'PROCESSING' ? '⏳' : '!'}
        </div>
        <div>
           <strong style={{fontSize: '0.9rem', color: '#0f172a'}}>
             {draftData?.status === 'PROCESSING' ? 'ANALİZ DEVAM EDİYOR' : 'YAYIN ÖNCESİ TASLAK KONTROLÜ'}
           </strong>
           <p style={{margin: '4px 0 0 0', fontSize: '0.85rem', color: '#64748b'}}>
             {draftData?.status === 'PROCESSING' 
               ? `${curriculumLabel} — ${lessonCode} analizi devam ediyor. Pipeline tamamlandığında rapor güncellenecektir.`
               : 'Hocaya iletilmeden önce raporun son halini aşağıdan inceleyebilirsiniz.'
             }
           </p>
        </div>
      </div>

      {error && (
        <div style={{color: '#f43f5e', background: '#ffe4e6', padding: '0.75rem 1.5rem', borderRadius: '12px', fontSize: '0.9rem', marginBottom: '1.5rem', fontWeight: 600}}>
          {error}
        </div>
      )}

      {/* Report Preview */}
      <div style={{marginBottom: '4rem'}}>
        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem'}}>
          <h4 style={{fontSize: '11px', fontWeight: 900, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0}}>Taslak Rapor Önizlemesi</h4>
          <div style={{
            padding: '6px 16px', borderRadius: '10px', fontSize: '12px', fontWeight: 800, fontFamily: 'monospace',
            background: 'linear-gradient(135deg, #6366f1, #a855f7)', color: '#fff',
            boxShadow: '0 4px 12px rgba(99, 102, 241, 0.3)'
          }}>
            📖 {lessonCode}
          </div>
        </div>
        <SharedReport report={previewReport} />
      </div>

      <div style={{marginTop: '3.5rem', borderTop: '1px solid #f1f5f9', paddingTop: '3.5rem'}}>
        <label style={{fontSize: '11px', fontWeight: 800, color: '#64748b', display: 'block', marginBottom: '1rem'}}>AI GELİŞTİRME NOTUNA EKLEME YAP (OPSİYONEL)</label>
        <textarea 
          placeholder="Hocaya iletilecek özel bir mesajınız var mı? Veya raporun değişmesini istediğiniz kısımları buraya yazın." 
          value={adminNote}
          onChange={(e) => setAdminNote(e.target.value)}
          style={{width:'100%', minHeight:'120px', border:'1.5px solid #e2e8f0', borderRadius:'24px', padding:'1.5rem', fontSize:'0.95rem', outline:'none'}}
        ></textarea>
        
        <div style={{display: 'flex', gap: '1.5rem', marginTop: '2.5rem'}}>
          <button 
            className="outline-btn" 
            style={{flex: 1, padding: '1.1rem', borderRadius: '16px', opacity: adminNote ? 1 : 0.5, cursor: adminNote ? 'pointer' : 'not-allowed'}} 
            onClick={() => adminNote && handleRegenerate()}
          >
            ↺ Feedback ile Yeniden Oluştur
          </button>
          <button 
            className="primary-btn" 
            style={{flex: 2, padding: '1.1rem', borderRadius: '16px'}} 
            onClick={handleFinalize}
          >
            ✓ Raporu Onayla ve Eğitmen Paneline Gönder
          </button>
        </div>
      </div>
    </div>
  )
}

export default AnalysisWorkflow
