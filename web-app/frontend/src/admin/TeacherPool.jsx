import { useState, useEffect, useRef } from 'react'
import { apiGet, apiPost, apiDelete } from '../api'
import { formatLessonLabel } from '../utils/lessonLabel'
import SharedReport from '../components/SharedReport.jsx'
import ProgressChart from '../components/ProgressChart.jsx'

const TeacherPool = () => {
  // Navigation: 'list' → 'reports' → 'detail'
  const [view, setView] = useState('list')
  const [searchQuery, setSearchQuery] = useState('')
  const [teachers, setTeachers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reportNotification, setReportNotification] = useState(null)
  const knownTeacherReportCountsRef = useRef(new Map())
  const initializedReportTrackingRef = useRef(false)

  // Reports list state
  const [selectedTeacher, setSelectedTeacher] = useState(null)
  const [teacherReports, setTeacherReports] = useState([])
  const [loadingReports, setLoadingReports] = useState(false)

  // Report detail state
  const [selectedReport, setSelectedReport] = useState(null)

  // Sync state
  const [syncing, setSyncing] = useState(false)

  // Progress chart data
  const [progressData, setProgressData] = useState([])

  // Admin action states
  const [finalizing, setFinalizing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmState, setConfirmState] = useState({ open: false, message: '', onConfirm: null })


  // Progress polling for PROCESSING reports
  const [detailProgress, setDetailProgress] = useState(null)
  const progressIntervalRef = useRef(null)

  // Load teachers
  useEffect(() => {
    const init = async () => {
      try {
        const data = await apiGet('/admin/teachers')
        setTeachers(data)
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [])

  // Poll admin teacher list and notify when new reports appear
  useEffect(() => {
    if (loading) return

    const syncTeacherReportCounts = async () => {
      try {
        const latestTeachers = await apiGet('/admin/teachers')
        setTeachers(latestTeachers)

        if (!initializedReportTrackingRef.current) {
          knownTeacherReportCountsRef.current = new Map(
            (latestTeachers || []).map((t) => [t.id, Number(t.reportCount || 0)])
          )
          initializedReportTrackingRef.current = true
          return
        }

        const increases = []
        for (const t of latestTeachers || []) {
          const prevCount = Number(knownTeacherReportCountsRef.current.get(t.id) || 0)
          const nextCount = Number(t.reportCount || 0)
          if (nextCount > prevCount) {
            increases.push({ teacherName: t.name, addedCount: nextCount - prevCount, reportCount: nextCount })
          }
        }

        if (increases.length > 0) {
          const newest = increases[0]
          setReportNotification(newest)
        }

        knownTeacherReportCountsRef.current = new Map(
          (latestTeachers || []).map((t) => [t.id, Number(t.reportCount || 0)])
        )
      } catch {
        // Silent fail for polling
      }
    }

    const intervalId = setInterval(syncTeacherReportCounts, 20000)
    return () => clearInterval(intervalId)
  }, [loading])

  useEffect(() => {
    if (!reportNotification) return
    const timeoutId = setTimeout(() => setReportNotification(null), 6000)
    return () => clearTimeout(timeoutId)
  }, [reportNotification])

  const colorPalette = ['#6366f1', '#f59e0b', '#10b981', '#ec4899', '#06b6d4', '#f43f5e']

  const pickFirstNonEmpty = (...values) =>
    values.map(v => (typeof v === 'string' ? v.trim() : '')).find(Boolean) || ''

  const toDisplayTitleFromFilename = (name) => {
    if (!name || typeof name !== 'string') return ''
    const base = name.replace(/\.[^/.]+$/, '')
    // remove common trailing technical tokens like UUID/date/hash fragments
    const cleaned = base
      .replace(/[_-](\d{6,}|[a-f0-9]{8,}|[a-f0-9-]{20,})$/i, '')
      .replace(/[_-]+/g, ' ')
      .trim()
    return cleaned.length >= 3 ? cleaned : ''
  }

  // ─── Handler: Open teacher's reports ──────────────────────
  const handleViewReports = async (teacher, idx) => {
    setSelectedTeacher({ ...teacher, color: colorPalette[idx % colorPalette.length] })
    setLoadingReports(true)
    setError('')
    setView('reports')

    try {
      const [reportsData, progressPoints] = await Promise.all([
        apiGet(`/admin/teacher/${teacher.id}/reports`),
        apiGet(`/admin/teacher/${teacher.id}/progress`).catch(() => []),
      ])
      setTeacherReports(reportsData.reports || [])
      setProgressData(progressPoints)
    } catch (err) {
      setError(err.message)
      setTeacherReports([])
      setProgressData([])
    } finally {
      setLoadingReports(false)
    }
  }

  // ─── Handler: Open report detail ──────────────────────────
  const handleViewReport = async (report) => {
    // Clear previous progress polling
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current)
      progressIntervalRef.current = null
    }
    setDetailProgress(null)

    try {
      const draft = await apiGet(`/admin/analysis/draft/${report.jobId}`)
      console.log('[TeacherPool] Draft API response:', draft)
      console.log('[TeacherPool] draftReport:', draft.draftReport)
      console.log('[TeacherPool] finalReport:', draft.finalReport)
      const fr = draft.finalReport || draft.draftReport || {}
      const teacherName =
        selectedTeacher?.name ||
        draft.teacher?.name ||
        report.teacherName ||
        report.teacher?.name ||
        ''
      const lectureName = pickFirstNonEmpty(
        draft.lesson?.course,
        draft.lesson?.name,
        report.courseName,
        report.lessonName,
        report.lesson?.course,
        report.lesson?.name,
        fr.ders_adi,
        fr.courseName,
        fr.course_name,
        fr.lessonName,
        fr.lesson_name,
        fr.moduleName,
        fr.module_name,
        fr.topic,
        fr.classTopic,
        toDisplayTitleFromFilename(draft.videoFilename),
        toDisplayTitleFromFilename(report.videoFilename)
      )
      console.log('[TeacherPool] Teacher name debug:', { selectedTeacherName: selectedTeacher?.name, draftTeacherName: draft.teacher?.name, resolved: teacherName })
      const reportObj = {
        jobId: report.jobId,
        status: draft.status || report.status,
        id: report.jobId?.slice(0, 8),
        name: teacherName,
        lectureName,
        module: lectureName || 'Analiz Raporu',
        date: report.createdAt ? new Date(report.createdAt).toLocaleDateString('tr-TR') : '',
        group: report.lessonNo ? formatLessonLabel(report.lessonNo, report.moduleSize) : '',
        evaluator: fr.approvedBy ? 'Admin Onaylı' : 'Sistem (AI)',
        quality: fr.yeterlilikler || '—',
        ttt: fr.speaking_time_rating || '—',
        duration: fr.actual_duration_min ? `${fr.actual_duration_min}dk` : '—',
        videoUrl: draft.videoUrl || report.videoUrl || null,
        localVideoUrl: draft.localVideoUrl || report.localVideoUrl || null,

        finalReport: fr,
        draftReport: fr,
      }
      setSelectedReport(reportObj)

      setView('detail')

      // Start polling if PROCESSING
      if ((draft.status || report.status) === 'PROCESSING') {
        // Initial progress fetch
        try {
          const prog = await apiGet(`/admin/analysis/progress/${report.jobId}`)
          setDetailProgress(prog)
        } catch {}

        progressIntervalRef.current = setInterval(async () => {
          try {
            const prog = await apiGet(`/admin/analysis/progress/${report.jobId}`)
            setDetailProgress(prog)
            if (prog.stage === 'completed' || prog.stage === 'failed') {
              clearInterval(progressIntervalRef.current)
              progressIntervalRef.current = null
              // Refresh report data when completed
              if (prog.stage === 'completed') {
                try {
                  const updatedDraft = await apiGet(`/admin/analysis/draft/${report.jobId}`)
                  const ufr = updatedDraft.finalReport || updatedDraft.draftReport || {}
                  setSelectedReport(prev => ({
                    ...prev,
                    status: updatedDraft.status || 'DRAFT',
                    quality: ufr.yeterlilikler || '—',
                    ttt: ufr.speaking_time_rating || '—',
                    duration: ufr.actual_duration_min ? `${ufr.actual_duration_min}dk` : '—',
                    evaluator: ufr.approvedBy ? 'Admin Onaylı' : 'Sistem (AI)',

                    finalReport: ufr,
                    draftReport: ufr,
                  }))
                } catch {}
              }
            }
          } catch {}
        }, 3000)
      }
    } catch (e) {
      console.error('Report fetch error:', e)
      setError('Rapor yüklenirken hata oluştu.')
    }
  }

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current)
      }
    }
  }, [])

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
    const isDraft = selectedReport.status === 'DRAFT'
    const isFinalized = selectedReport.status === 'FINALIZED'
    const isProcessing = selectedReport.status === 'PROCESSING'

    const PROGRESS_STAGES = [
      { key: 'queued', label: 'Sisteme Kaydedildi', icon: '💾' },
      { key: 'downloading', label: 'Video İndiriliyor', icon: '⬇️' },
      { key: 'processing', label: 'Video İşleniyor', icon: '🎬' },
      { key: 'reporting', label: 'Rapor Oluşturuluyor', icon: '📊' },
      { key: 'uploading', label: 'Sisteme Yükleniyor', icon: '☁️' },
      { key: 'completed', label: 'Tamamlandı!', icon: '✅' },
    ]

    const handleFinalize = async () => {
      if (!selectedReport.jobId) return
      setFinalizing(true)
      try {
        await apiPost('/admin/analysis/finalize', { jobId: selectedReport.jobId })
        setSelectedReport(prev => ({ ...prev, status: 'FINALIZED', evaluator: 'Admin Onaylı' }))
        // Refresh reports list
        const data = await apiGet(`/admin/teacher/${selectedTeacher.id}/reports`)
        setTeacherReports(data.reports || [])
      } catch (err) {
        setError('Onaylama hatası: ' + err.message)
      } finally {
        setFinalizing(false)
      }
    }

    const handleDeleteReport = async () => {
      if (!selectedReport.jobId) return
      setDeleting(true)
      try {
        await apiDelete(`/admin/report/${selectedReport.jobId}`)
        // Go back to reports list and refresh
        setSelectedReport(null)
        setDetailProgress(null)
        setView('reports')
        const data = await apiGet(`/admin/teacher/${selectedTeacher.id}/reports`)
        setTeacherReports(data.reports || [])
      } catch (err) {
        setError('Silme hatası: ' + err.message)
      } finally {
        setDeleting(false)
      }
    }

    const requestConfirm = (message, onConfirm) => {
      setConfirmState({ open: true, message, onConfirm })
    }

    return (
      <div style={{animation: 'fadeIn 0.3s ease', padding: '1rem'}}>
        {confirmState.open && (
          <div
            style={{ position: 'fixed', inset: 0, background: 'rgba(2, 6, 23, 0.62)', backdropFilter: 'blur(4px)', display: 'grid', placeItems: 'center', zIndex: 2600, padding: '1rem' }}
            onClick={() => setConfirmState({ open: false, message: '', onConfirm: null })}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{ width: 'min(460px, 94vw)', background: 'linear-gradient(145deg, #0f172a, #111827)', border: '1px solid rgba(148, 163, 184, 0.28)', borderRadius: '18px', boxShadow: '0 28px 90px rgba(15, 23, 42, 0.7)', padding: '1.35rem 1.4rem' }}
            >
              <h3 style={{ margin: '0 0 0.55rem', color: '#f8fafc', fontSize: '1.05rem', fontWeight: 800 }}>{confirmState.message}</h3>
              <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.9rem' }}>Bu işlem geri alınamaz.</p>
              <div style={{ marginTop: '1.1rem', display: 'flex', justifyContent: 'flex-end', gap: '0.65rem' }}>
                <button onClick={() => setConfirmState({ open: false, message: '', onConfirm: null })} style={{ border: 'none', borderRadius: '11px', padding: '0.58rem 0.95rem', fontSize: '0.84rem', fontWeight: 700, cursor: 'pointer', background: 'rgba(148, 163, 184, 0.16)', color: '#e2e8f0' }}>Vazgeç</button>
                <button onClick={() => { const run = confirmState.onConfirm; setConfirmState({ open: false, message: '', onConfirm: null }); if (typeof run === 'function') run() }} style={{ border: 'none', borderRadius: '11px', padding: '0.58rem 0.95rem', fontSize: '0.84rem', fontWeight: 700, cursor: 'pointer', background: 'linear-gradient(135deg, #ef4444, #f43f5e)', color: '#fff' }}>Sil</button>
              </div>
            </div>
          </div>
        )}
        <button
          onClick={() => { 
            if (progressIntervalRef.current) { clearInterval(progressIntervalRef.current); progressIntervalRef.current = null; }
            setSelectedReport(null); setDetailProgress(null); setView('reports');
          }}
          style={{background: 'none', border: 'none', color: '#6366f1', fontWeight: 800, fontSize: '11px', cursor: 'pointer', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '8px'}}
        >
          ‹ RAPORLARA GERİ DÖN
        </button>

        {/* Status badge */}
        <div style={{display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '1.5rem'}}>
          <span style={{
            padding: '6px 16px', borderRadius: '10px', fontSize: '11px', fontWeight: 800,
            background: isFinalized ? '#f0fdf4' : isDraft ? '#fefce8' : '#eff6ff',
            color: isFinalized ? '#15803d' : isDraft ? '#a16207' : '#2563eb',
            border: `1px solid ${isFinalized ? '#bbf7d0' : isDraft ? '#fde68a' : '#bfdbfe'}`,
          }}>
            {isFinalized ? '✓ ONAYLANDI' : isDraft ? '◎ TASLAK' : '⏳ İŞLENİYOR'}
          </span>
          <span style={{fontSize: '0.82rem', color: '#94a3b8', fontWeight: 600}}>
            Rapor #{selectedReport.id}
          </span>
        </div>

        <SharedReport report={selectedReport} />

        {/* Live Progress Tracker for PROCESSING reports */}
        {isProcessing && (
          <div style={{
            marginTop: '2rem', padding: '2rem', borderRadius: '20px',
            background: 'linear-gradient(135deg, #eff6ff 0%, #f5f3ff 100%)',
            border: '1.5px solid #bfdbfe',
          }}>
            <div style={{display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '1.5rem'}}>
              <div style={{
                width: '40px', height: '40px', borderRadius: '12px',
                background: 'linear-gradient(135deg, #6366f1, #a855f7)', color: '#fff',
                display: 'grid', placeItems: 'center', fontWeight: 900, fontSize: '1.1rem',
                animation: 'pulse 2s infinite',
              }}>⏳</div>
              <div>
                <strong style={{fontSize: '0.95rem', color: '#1e40af'}}>Analiz Devam Ediyor</strong>
                <p style={{margin: '2px 0 0', fontSize: '0.82rem', color: '#3b82f6', fontWeight: 600}}>
                  {detailProgress?.message || 'Pipeline çalışıyor, rapor hazır olduğunda burada görünecektir...'}
                </p>
              </div>
            </div>

            {/* Progress bar */}
            <div style={{background: 'rgba(255,255,255,0.7)', borderRadius: '12px', height: '10px', overflow: 'hidden', marginBottom: '1.5rem'}}>
              <div style={{
                width: `${detailProgress?.percent || 5}%`,
                height: '100%',
                borderRadius: '12px',
                background: 'linear-gradient(90deg, #6366f1, #a855f7, #ec4899)',
                transition: 'width 0.8s ease',
              }}></div>
            </div>

            {/* Stage indicators */}
            <div style={{display: 'flex', flexWrap: 'wrap', gap: '6px'}}>
              {PROGRESS_STAGES.map((s, i) => {
                const currentIdx = PROGRESS_STAGES.findIndex(ps => ps.key === (detailProgress?.stage || 'queued'))
                const isDone = i < currentIdx
                const isActive = i === currentIdx
                return (
                  <div key={s.key} style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    padding: '6px 12px', borderRadius: '10px',
                    background: isDone ? '#f0fdf4' : isActive ? '#f5f3ff' : '#f8fafc',
                    border: `1px solid ${isDone ? '#bbf7d0' : isActive ? '#ddd6fe' : '#e2e8f0'}`,
                    transition: 'all 0.3s ease',
                  }}>
                    <span style={{fontSize: '0.75rem'}}>
                      {isDone ? '✅' : s.icon}
                    </span>
                    <span style={{
                      fontSize: '0.72rem', fontWeight: isActive ? 800 : 600,
                      color: isDone ? '#15803d' : isActive ? '#4f46e5' : '#94a3b8',
                    }}>
                      {s.label}
                    </span>
                    {isActive && (
                      <div style={{
                        width: '6px', height: '6px', borderRadius: '50%',
                        background: '#6366f1', animation: 'pulse 1.5s infinite',
                      }}></div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Admin Action Panel */}
        {!isFinalized && (
          <div style={{
            marginTop: '2rem', padding: '2rem', borderRadius: '20px',
            background: '#f8fafc', border: '1.5px solid #e2e8f0',
          }}>
            <h5 style={{margin: '0 0 1rem', fontSize: '11px', fontWeight: 900, color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.05em'}}>
              Admin İşlemleri
            </h5>

            <div className="responsive-action-buttons" style={{display: 'flex', gap: '1rem', marginTop: '0', flexWrap: 'wrap'}}>
              <button
                onClick={handleFinalize}
                disabled={finalizing}
                style={{
                  flex: 1, padding: '14px', borderRadius: '14px', border: 'none',
                  background: 'linear-gradient(135deg, #6366f1, #a855f7)',
                  color: '#fff', fontSize: '0.85rem', fontWeight: 800,
                  cursor: finalizing ? 'wait' : 'pointer',
                  boxShadow: '0 10px 25px -5px rgba(99, 102, 241, 0.4)',
                  transition: 'all 0.2s',
                  opacity: finalizing ? 0.7 : 1,
                }}
              >
                {finalizing ? '⏳ Onaylanıyor...' : '✓ Raporu Onayla ve Yayınla'}
              </button>
              <button
                onClick={() => requestConfirm('Bu raporu kalıcı olarak silmek istediğinize emin misiniz?', handleDeleteReport)}
                disabled={deleting}
                style={{
                  padding: '14px', borderRadius: '14px', border: '1.5px solid #fecaca',
                  background: '#fff', color: '#dc2626', fontSize: '0.85rem', fontWeight: 800,
                  cursor: deleting ? 'wait' : 'pointer', transition: 'all 0.2s',
                  opacity: deleting ? 0.7 : 1, minWidth: '160px',
                }}
              >
                {deleting ? '⏳ Siliniyor...' : '🗑 Raporu Sil'}
              </button>
            </div>
          </div>
        )}

        {/* Already finalized info */}
        {isFinalized && (
          <div style={{
            marginTop: '2rem', padding: '1.5rem 2rem', borderRadius: '16px',
            background: '#f0fdf4', border: '1px solid #bbf7d0',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '36px', height: '36px', borderRadius: '50%',
                background: '#10b981', color: '#fff',
                display: 'grid', placeItems: 'center', fontWeight: 900, fontSize: '1rem',
              }}>✓</div>
              <div>
                <p style={{margin: 0, fontWeight: 800, color: '#15803d', fontSize: '0.9rem'}}>Bu rapor onaylanmış</p>
                <p style={{margin: '2px 0 0', fontSize: '0.78rem', color: '#4ade80', fontWeight: 600}}>Eğitmen panelinde görüntüleniyor.</p>
              </div>
            </div>
            <button
              onClick={() => requestConfirm('Bu raporu kalıcı olarak silmek istediğinize emin misiniz?', handleDeleteReport)}
              disabled={deleting}
              style={{
                padding: '10px 20px', borderRadius: '12px', border: '1.5px solid #fecaca',
                background: '#fff', color: '#dc2626', fontSize: '0.8rem', fontWeight: 800,
                cursor: deleting ? 'wait' : 'pointer', transition: 'all 0.2s',
                opacity: deleting ? 0.7 : 1, whiteSpace: 'nowrap',
              }}
            >
              {deleting ? '⏳...' : '🗑 Sil'}
            </button>
          </div>
        )}

        {error && (
          <div style={{color: '#f43f5e', background: '#ffe4e6', padding: '0.75rem 1.5rem', borderRadius: '12px', fontSize: '0.9rem', marginTop: '1rem', fontWeight: 600}}>
            {error}
          </div>
        )}
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
        <div className="responsive-teacher-info" style={{
          display: 'flex', alignItems: 'center', gap: '1.5rem',
          padding: '1.5rem 2rem', background: '#fff', border: '1px solid #e2e8f0',
          borderRadius: '16px', marginBottom: '2rem',
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
              {selectedTeacher.startOfDate ? new Date(selectedTeacher.startOfDate).toLocaleDateString('tr-TR') + ' tarihinden beri' : ''} • {teacherReports.length} Rapor
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
          <div style={{display: 'flex', flexDirection: 'column', gap: '1.5rem'}}>
            {/* Progress Chart */}
            <ProgressChart
              data={progressData}
              title={`${selectedTeacher.name} — Performans İlerlemesi`}
              accentColor={selectedTeacher.color || '#6366f1'}
              xMode="report"
              maxPoints={30}
            />
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
                  className="responsive-report-row"
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
                        {report.groupName
                          ? `${report.groupName}${report.age ? ` (${report.age} yaş)` : ''}${report.schedule ? ` — ${report.schedule}` : ''}${report.lessonNo ? ` • ${formatLessonLabel(report.lessonNo, report.moduleSize)}` : ''}`
                          : report.lessonNo
                            ? `${formatLessonLabel(report.lessonNo, report.moduleSize)}${report.courseName ? ` — ${report.courseName}` : ''}`
                            : report.courseName || `Rapor #${idx + 1}`
                        }
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
                      {report.courseName && <span>📖 {report.courseName}</span>}
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
          @keyframes pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.4; transform: scale(1.5); } }
        `}</style>
      </div>
    )
  }

  // ─── VIEW 1: Teacher List ──────────────────────────────
  const rows = teachers.map((t, idx) => {
    const numericScore = Number(t.averageScore ?? t.lastScore)
    const hasNumericScore = Number.isFinite(numericScore)
    return ({
    ...t,
    initials: t.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2),
    color: colorPalette[idx % colorPalette.length],
    score: hasNumericScore ? numericScore.toFixed(1) : '—',
    hasReport: true,
    idx,
    })
  })

  const filteredRows = rows.filter(r =>
    r.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div style={{ padding: '1rem', animation: 'fadeIn 0.5s ease' }}>
      {reportNotification && (
        <div style={{
          position: 'fixed',
          top: '24px',
          right: '24px',
          zIndex: 2500,
          width: 'min(430px, 92vw)',
          padding: '1rem 1rem 0.9rem',
          borderRadius: '16px',
          background: 'linear-gradient(135deg, #ecfeff 0%, #f0f9ff 100%)',
          border: '1px solid #bae6fd',
          boxShadow: '0 18px 40px rgba(14, 116, 144, 0.2)',
          animation: 'slideInRight 0.35s ease',
        }}>
          <div style={{display: 'flex', justifyContent: 'space-between', gap: '12px'}}>
            <div>
              <p style={{margin: 0, fontSize: '0.82rem', fontWeight: 900, color: '#0369a1', letterSpacing: '0.04em'}}>
                YENİ RAPOR HAZIR
              </p>
              <p style={{margin: '0.35rem 0 0', fontSize: '0.9rem', fontWeight: 700, color: '#0f172a', lineHeight: 1.45}}>
                {reportNotification.teacherName} için {reportNotification.addedCount} yeni rapor sisteme eklendi.
              </p>
            </div>
            <button
              onClick={() => setReportNotification(null)}
              style={{
                border: 'none',
                background: 'transparent',
                color: '#0ea5e9',
                fontSize: '1.1rem',
                cursor: 'pointer',
                fontWeight: 900,
                lineHeight: 1,
              }}
              aria-label="Bildirimi kapat"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="responsive-page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2.5rem' }}>
        <div>
          <h1 style={{ fontSize: '2rem', fontWeight: 950, color: '#0f172a', letterSpacing: '-0.02em', margin: 0 }}>Eğitmen Havuzu</h1>
          <p style={{ color: '#64748b', fontSize: '1rem', marginTop: '4px' }}>Raporları inceleyin ve eğitmen performansını yönetin.</p>
        </div>
        <div className="responsive-search-row" style={{ display: 'flex', gap: '1rem' }}>
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
        <div className="responsive-pool-header" style={{
          display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', padding: '1.5rem 2.5rem',
          background: '#f8fafc', borderBottom: '1px solid #e2e8f0',
          color: '#64748b', fontSize: '11px', fontWeight: 900, letterSpacing: '0.05em'
        }}>
          <span>EĞİTMEN</span>
          <span>RAPOR SAYISI</span>
          <span>ORT. SKOR</span>
          <span style={{ textAlign: 'right' }}>AKSİYON</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {filteredRows.length > 0 ? (
            filteredRows.map(r => (
              <div key={r.id} className="responsive-pool-row" style={{
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
                    <div style={{ fontSize: '0.78rem', color: '#94a3b8', fontWeight: 600 }}>{r.email}</div>
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
