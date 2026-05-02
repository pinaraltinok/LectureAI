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
  const [selectedCourseId, setSelectedCourseId] = useState('')
  const [selectedLessonCode, setSelectedLessonCode] = useState('M1L1')
  const [selectedGroupId, setSelectedGroupId] = useState('')
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10))
  const [currentJobId, setCurrentJobId] = useState(null)
  const [draftData, setDraftData] = useState(null)
  const [teachers, setTeachers] = useState([])
  const [courses, setCourses] = useState([])
  const [groups, setGroups] = useState([])
  const [error, setError] = useState('')
  const fileInputRef = useRef(null)
  const navigate = useNavigate()

  // Helper: generate module/lesson codes from a course object
  const generateLessonCodes = (c) => {
    if (!c) return []
    const codes = [{ code: 'M0L0', module: 0, lesson: 0 }] // Tanışma dersi
    for (let m = 1; m <= (c.moduleNum || 1); m++) {
      for (let l = 1; l <= (c.moduleSize || 1); l++) {
        codes.push({ code: `M${m}L${l}`, module: m, lesson: l })
      }
    }
    return codes
  }

  const selectedCourse = courses.find(c => c.id === selectedCourseId) || courses[0] || null
  const lessonCodes = generateLessonCodes(selectedCourse)

  // Filter groups by selected teacher + course
  const filteredGroups = groups.filter(g =>
    g.teacherId === selectedTeacherId && g.courseId === selectedCourseId
  )

  useEffect(() => {
    Promise.all([
      apiGet('/admin/teachers'),
      apiGet('/admin/groups'),
    ]).then(([t, g]) => {
      setTeachers(t)
      if (t.length > 0) setSelectedTeacherId(t[0].id)
      setGroups(g)
    }).catch(err => setError(err.message))
  }, [])

  // Fetch courses assigned to the selected teacher
  useEffect(() => {
    if (!selectedTeacherId) {
      setCourses([])
      setSelectedCourseId('')
      return
    }
    apiGet(`/admin/teacher/${selectedTeacherId}/courses`)
      .then(tc => {
        setCourses(tc)
        if (tc.length > 0) setSelectedCourseId(tc[0].id)
        else setSelectedCourseId('')
      })
      .catch(() => {
        setCourses([])
        setSelectedCourseId('')
      })
  }, [selectedTeacherId])

  // Reset lesson code + group when curriculum or teacher changes
  useEffect(() => {
    setSelectedLessonCode('M1L1')
    setSelectedGroupId('')
  }, [selectedCourseId, selectedTeacherId])

  // Create a browser-local blob URL for instant video preview (no server needed)
  const [localBlobUrl, setLocalBlobUrl] = useState(null)

  const handleUploadAndAnalyze = async () => {
    if (!selectedTeacherId) {
      setError('Lütfen bir eğitmen seçin.')
      return
    }

    // Create instant local preview URL from selected file
    if (selectedFile) {
      if (localBlobUrl) URL.revokeObjectURL(localBlobUrl)
      setLocalBlobUrl(URL.createObjectURL(selectedFile))
    }

    setIsAnalyzing(true)
    setIsRegenerating(false)
    setProgress({ stage: 'queued', message: 'Video sisteme kaydediliyor...', percent: 5 })
    setError('')

    try {
      // Step 1: Upload
      const formData = new FormData()
      if (selectedFile) {
        formData.append('video', selectedFile)
      }
      const uploadRes = await apiUpload('/admin/analysis/upload', formData)
      const jobId = uploadRes.jobId
      setCurrentJobId(jobId)  // Set early so progress polling starts

      // Step 2: Assign with curriculum + lesson code + group + date metadata
      await apiPost('/admin/analysis/assign', {
        jobId,
        teacherId: selectedTeacherId,
        lessonId: null,
        groupId: selectedGroupId || null,
        lessonCode: selectedLessonCode,
        lessonDate: selectedDate || null,
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
          videoUrl: uploadRes.videoUrl || null,
          localVideoUrl: uploadRes.videoUrl?.startsWith('gs://') ? null : uploadRes.videoUrl,
          teacher: teachers.find(t => t.id === selectedTeacherId),
          course: selectedCourse,
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

  // --- Progress polling ---
  const [progress, setProgress] = useState({ stage: 'queued', message: 'Video sisteme kaydediliyor...', percent: 5 })

  useEffect(() => {
    if (!isAnalyzing || !currentJobId) return
    const interval = setInterval(async () => {
      try {
        const data = await apiGet(`/admin/analysis/progress/${currentJobId}`)
        setProgress(data)
        if (data.stage === 'completed' || data.stage === 'failed') {
          clearInterval(interval)
        }
      } catch { /* ignore polling errors */ }
    }, 2000)
    return () => clearInterval(interval)
  }, [isAnalyzing, currentJobId])

  const STAGES = [
    { key: 'queued', label: 'Sisteme Kaydediliyor', icon: '💾' },
    { key: 'downloading', label: 'Video İndiriliyor', icon: '⬇️' },
    { key: 'processing', label: 'Video İşleniyor', icon: '🎬' },
    { key: 'reporting', label: 'Rapor Oluşturuluyor', icon: '📊' },
    { key: 'uploading', label: "Sisteme Yükleniyor", icon: '☁️' },
    { key: 'completed', label: 'Tamamlandı!', icon: '✅' },
  ]

  if (isAnalyzing) {
    const currentIdx = STAGES.findIndex(s => s.key === progress.stage)
    return (
      <div style={{display:'grid', placeItems:'center', minHeight:'500px', textAlign:'center', animation: 'fadeIn 0.5s ease'}}>
        <div style={{maxWidth: '520px', width: '100%'}}>
          {/* Spinner */}
          <div style={{
            width: '80px', height: '80px', borderRadius: '50%', border: '4px solid #f1f5f9',
            borderTopColor: isRegenerating ? '#10b981' : '#6366f1', margin: '0 auto 2rem', animation: 'spin 1s linear infinite'
          }}></div>
          <h2 style={{fontSize:'1.8rem', fontWeight:950, color: '#0f172a', letterSpacing: '-0.02em', marginBottom: '0.5rem'}}>
            {isRegenerating ? 'Rapor Optimize Ediliyor' : progress.message || 'Analiz Başlatılıyor...'}
          </h2>

          {/* Progress bar */}
          <div style={{background: '#f1f5f9', borderRadius: '12px', height: '12px', margin: '1.5rem 0', overflow: 'hidden'}}>
            <div style={{
              width: `${progress.percent || 5}%`,
              height: '100%',
              borderRadius: '12px',
              background: 'linear-gradient(90deg, #6366f1, #a855f7)',
              transition: 'width 0.8s ease',
            }}></div>
          </div>
          <p style={{color:'#94a3b8', fontSize: '0.85rem', fontWeight: 700, marginBottom: '2rem'}}>%{progress.percent || 0}</p>

          {/* Stage steps */}
          <div style={{display: 'flex', flexDirection: 'column', gap: '0', textAlign: 'left'}}>
            {STAGES.map((s, i) => {
              const isDone = i < currentIdx
              const isActive = i === currentIdx
              const isPending = i > currentIdx
              return (
                <div key={s.key} style={{
                  display: 'flex', alignItems: 'center', gap: '14px',
                  padding: '12px 16px', borderRadius: '14px',
                  background: isActive ? '#f5f3ff' : 'transparent',
                  transition: 'all 0.3s ease',
                }}>
                  {/* Step indicator */}
                  <div style={{
                    width: '36px', height: '36px', borderRadius: '50%',
                    display: 'grid', placeItems: 'center', fontSize: '1rem', flexShrink: 0,
                    background: isDone ? '#10b981' : isActive ? 'linear-gradient(135deg, #6366f1, #a855f7)' : '#f1f5f9',
                    color: (isDone || isActive) ? '#fff' : '#94a3b8',
                    boxShadow: isActive ? '0 4px 12px rgba(99,102,241,0.3)' : 'none',
                    transition: 'all 0.3s ease',
                  }}>
                    {isDone ? '✓' : s.icon}
                  </div>
                  <span style={{
                    fontWeight: isActive ? 800 : 600,
                    fontSize: '0.95rem',
                    color: isDone ? '#10b981' : isActive ? '#4f46e5' : '#94a3b8',
                    transition: 'all 0.3s ease',
                  }}>
                    {s.label}
                  </span>
                  {isActive && (
                    <div style={{
                      marginLeft: 'auto', width: '8px', height: '8px', borderRadius: '50%',
                      background: '#6366f1', animation: 'pulse 1.5s infinite',
                    }}></div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
        <style>{`
          @keyframes spin { 100% { transform: rotate(360deg); } }
          @keyframes pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.4; transform: scale(1.5); } }
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

        <div className="responsive-workflow-grid" style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3rem', alignItems: 'start'}}>
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
            <div style={{width: '72px', height: '72px', background: '#fff', borderRadius: '16px', display: 'grid', placeItems: 'center', fontSize: '2rem', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.05)'}}>
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
            
            {/* 2. Kurs Seçimi */}
            <div>
              <label style={{fontSize: '11px', fontWeight: 800, color: '#64748b', marginBottom: '8px', display: 'block', letterSpacing: '0.05em'}}>KURS PROGRAMI</label>
              <select
                value={selectedCourseId}
                onChange={(e) => setSelectedCourseId(e.target.value)}
                style={{width:'100%', padding:'1rem', borderRadius:'14px', border:'1px solid #e2e8f0', fontWeight:700, outline: 'none', background:'#fff', fontSize: '0.9rem'}}
              >
                {courses.length === 0 && <option value="">— Bu eğitmene atanmış kurs yok —</option>}
                {courses.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.course} [{c.age}]
                  </option>
                ))}
              </select>
              {courses.length === 0 && selectedTeacherId && (
                <p style={{fontSize: '0.78rem', color: '#f59e0b', fontWeight: 600, marginTop: '6px', margin: '6px 0 0'}}>
                  ⚠ Bu eğitmene henüz kurs atanmamış. Kullanıcı &amp; Grup Yönetimi sayfasından kurs atayabilirsiniz.
                </p>
              )}
              {/* Course info badge */}
              {selectedCourse && (
                <div style={{display: 'flex', gap: '8px', marginTop: '10px', flexWrap: 'wrap'}}>
                  <span style={{fontSize: '10px', fontWeight: 800, color: '#6366f1', background: '#f5f3ff', padding: '4px 10px', borderRadius: '6px'}}>
                    {selectedCourse.moduleNum} Modül
                  </span>
                  <span style={{fontSize: '10px', fontWeight: 800, color: '#10b981', background: '#f0fdf4', padding: '4px 10px', borderRadius: '6px'}}>
                    {selectedCourse.moduleNum * selectedCourse.moduleSize} Ders
                  </span>
                  <span style={{fontSize: '10px', fontWeight: 800, color: '#f59e0b', background: '#fffbeb', padding: '4px 10px', borderRadius: '6px'}}>
                    {selectedCourse.lessonSize}dk
                  </span>
                  <span style={{fontSize: '10px', fontWeight: 800, color: '#64748b', background: '#f1f5f9', padding: '4px 10px', borderRadius: '6px'}}>
                    Yaş: {selectedCourse.age}
                  </span>
                </div>
              )}
            </div>

            {/* 3. Ders Numarası Seçimi */}
            <div>
              <label style={{fontSize: '11px', fontWeight: 800, color: '#64748b', marginBottom: '8px', display: 'block', letterSpacing: '0.05em'}}>DERS NUMARASI (MODÜL / DERS)</label>
              <div className="responsive-form-grid" style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px'}}>
                {/* Module selector */}
                <select
                  value={selectedLessonCode.match(/M(\d+)/)?.[1] || '1'}
                  onChange={(e) => {
                    const mod = e.target.value
                    setSelectedLessonCode(mod === '0' ? 'M0L0' : `M${mod}L1`)
                  }}
                  style={{padding:'0.9rem 1.1rem'}}
                >
                  <option value="0">Modül 0 — Tanışma</option>
                  {Array.from({ length: selectedCourse?.moduleNum || 1 }, (_, i) => i + 1).map(m => (
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
                  style={{padding:'0.9rem 1.1rem'}}
                  disabled={selectedLessonCode === 'M0L0'}
                >
                  {selectedLessonCode === 'M0L0' ? (
                    <option value="0">Ders 0 — Tanışma Dersi</option>
                  ) : (
                    Array.from({ length: selectedCourse?.moduleSize || 1 }, (_, i) => i + 1).map(l => (
                      <option key={l} value={l}>Ders {l}</option>
                    ))
                  )}
                </select>
              </div>
              {/* Selected code badge */}
              <div style={{marginTop: '12px', display: 'flex', alignItems: 'center', gap: '10px'}}>
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: '8px',
                  padding: '10px 20px', borderRadius: '14px',
                  background: selectedLessonCode === 'M0L0'
                    ? 'linear-gradient(135deg, #f59e0b 0%, #f97316 100%)'
                    : 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
                  color: '#fff', fontWeight: 900, fontSize: '1.1rem', fontFamily: 'monospace',
                  boxShadow: selectedLessonCode === 'M0L0'
                    ? '0 8px 20px -4px rgba(245, 158, 11, 0.4)'
                    : '0 8px 20px -4px rgba(99, 102, 241, 0.4)',
                  letterSpacing: '0.05em'
                }}>
                  {selectedLessonCode === 'M0L0' ? '🤝' : '📖'} {selectedLessonCode}
                </div>
                <span style={{fontSize: '0.8rem', color: '#94a3b8', fontWeight: 600}}>
                  {selectedLessonCode === 'M0L0'
                    ? `${selectedCourse?.course} — Tanışma Dersi (Öğrenci & Veli Tanışması)`
                    : `${selectedCourse?.course} — Modül ${selectedLessonCode.match(/M(\d+)/)?.[1]}, Ders ${selectedLessonCode.match(/L(\d+)/)?.[1]}`
                  }
                </span>
              </div>
            </div>

            {/* 4. Grup Seçimi */}
            <div>
              <label style={{fontSize: '11px', fontWeight: 800, color: '#64748b', marginBottom: '8px', display: 'block', letterSpacing: '0.05em'}}>GRUP SEÇİMİ (OPSİYONEL)</label>
              <select
                value={selectedGroupId}
                onChange={(e) => setSelectedGroupId(e.target.value)}
                style={{width:'100%', padding:'1rem', borderRadius:'14px', border:'1px solid #e2e8f0', fontWeight:700, outline: 'none', background:'#fff', fontSize: '0.95rem'}}
              >
                <option value="">— Grup seçilmedi —</option>
                {filteredGroups.map(g => (
                  <option key={g.id} value={g.id}>
                    {g.name ? `${g.name} • ` : ''}{g.courseName} • {g.teacherName} {g.schedule ? `(${g.schedule})` : ''} — {g.studentCount} öğrenci
                  </option>
                ))}
              </select>
              {filteredGroups.length === 0 && selectedTeacherId && selectedCourseId && (
                <p style={{fontSize: '0.78rem', color: '#f59e0b', fontWeight: 600, marginTop: '6px', margin: '6px 0 0'}}>
                  ⚠ Seçilen eğitmen ve kurs için henüz grup oluşturulmamış.
                </p>
              )}
              {selectedGroupId && (
                <div style={{display: 'flex', gap: '8px', marginTop: '10px', flexWrap: 'wrap'}}>
                  <span style={{fontSize: '10px', fontWeight: 800, color: '#10b981', background: '#f0fdf4', padding: '4px 10px', borderRadius: '6px'}}>
                    👥 {filteredGroups.find(g => g.id === selectedGroupId)?.studentCount || 0} öğrenci görecek
                  </span>
                </div>
              )}
            </div>

            {/* 5. Tarih Seçimi */}
            <div>
              <label style={{fontSize: '11px', fontWeight: 800, color: '#64748b', marginBottom: '8px', display: 'block', letterSpacing: '0.05em'}}>DERS TARİHİ</label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                style={{width:'100%', padding:'1rem', borderRadius:'14px', border:'1px solid #e2e8f0', fontWeight:700, outline: 'none', background:'#fff', fontSize: '0.95rem', fontFamily:'inherit', color:'#1e293b'}}
              />
              <div style={{display: 'flex', gap: '8px', marginTop: '10px'}}>
                <span style={{fontSize: '10px', fontWeight: 800, color: '#6366f1', background: '#f5f3ff', padding: '4px 10px', borderRadius: '6px'}}>
                  📅 {new Date(selectedDate + 'T00:00:00').toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', weekday: 'long' })}
                </span>
              </div>
            </div>

            <button 
              className="primary-btn" 
              style={{marginTop: '1rem', padding: '1.25rem', fontSize: '1rem', boxShadow: '0 20px 25px -5px rgba(99, 102, 241, 0.4)'}} 
              onClick={handleUploadAndAnalyze}
              disabled={!selectedTeacherId}
            >
              Analizi Başlat
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
  const courseLabel = draftData?.course?.course || selectedCourse?.course || ''
  const lessonCode = draftData?.lessonCode || selectedLessonCode
  const previewReport = {
    id: currentJobId?.slice(0, 8) || 'DRAFT',
    name: draftData?.teacher?.name || '',
    module: `${courseLabel} — ${lessonCode}`,
    date: draftData?.createdAt ? new Date(draftData.createdAt).toLocaleDateString('tr-TR') : new Date().toLocaleDateString('tr-TR'),
    group: lessonCode,
    evaluator: 'Sistem (AI)',
    quality: draftReport.yeterlilikler || draftReport.quality || '—',
    ttt: draftReport.speaking_time_rating || '—',
    duration: draftReport.actual_duration_min ? `${draftReport.actual_duration_min}dk` : `${selectedCourse?.lessonSize || 60}dk`,
    obs: draftReport.feedback_metni 
      ? [{ t: 'AI Değerlendirmesi', c: draftReport.feedback_metni }]
      : [{ t: 'Durum', c: draftData?.status === 'PROCESSING' ? 'Analiz devam ediyor. Pipeline tamamlandığında rapor burada görünecektir.' : 'Taslak rapor henüz oluşturulmadı.' }],
    videoUrl: draftData?.videoUrl || null,
    localVideoUrl: localBlobUrl || draftData?.localVideoUrl || null,
    draftReport,
  }

  return (
    <div className="workflow-container" style={{animation: 'fadeIn 0.5s ease'}}>
      <div className="alert-banner" style={{background: '#f8fafc', border: '1.5px solid #e2e8f0', borderRadius: '16px', padding: '1.5rem', marginBottom: '2rem', display: 'flex', gap: '1.25rem', alignItems: 'center'}}>
        <div style={{width: '42px', height: '42px', background: draftData?.status === 'PROCESSING' ? '#f59e0b' : '#6366f1', color: '#fff', borderRadius: '50%', display: 'grid', placeItems: 'center', fontWeight: 900}}>
          {draftData?.status === 'PROCESSING' ? '⏳' : '!'}
        </div>
        <div>
           <strong style={{fontSize: '0.9rem', color: '#0f172a'}}>
             {draftData?.status === 'PROCESSING' ? 'ANALİZ DEVAM EDİYOR' : 'YAYIN ÖNCESİ TASLAK KONTROLÜ'}
           </strong>
           <p style={{margin: '4px 0 0 0', fontSize: '0.85rem', color: '#64748b'}}>
             {draftData?.status === 'PROCESSING' 
               ? `${draftData?.lesson?.course || draftData?.videoFilename || 'Video'} — ${draftData?.lessonCode || 'N/A'} analizi devam ediyor. Pipeline tamamlandığında rapor güncellenecektir.`
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
