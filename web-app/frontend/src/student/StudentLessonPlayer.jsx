import { useState, useEffect, useRef, useCallback } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { apiGet, apiPost, apiPut, apiDelete } from '../api'
import { formatLessonLabel } from '../utils/lessonLabel'
import { resolveVideoUrl } from '../utils/resolveVideoUrl'


const fmt = (s) => {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`
}

const StudentLessonPlayer = () => {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const lessonId = params.get('id')
  const videoRef = useRef(null)

  const [lesson, setLesson] = useState(null)
  const [notes, setNotes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [resolvedVideoSrc, setResolvedVideoSrc] = useState(null)

  // Note creation
  const [newNote, setNewNote] = useState('')
  const [capturing, setCapturing] = useState(false)
  const [capturedTime, setCapturedTime] = useState(null)
  const [saving, setSaving] = useState(false)

  // Edit state
  const [editId, setEditId] = useState(null)
  const [editText, setEditText] = useState('')

  // Toast
  const [toast, setToast] = useState('')

  const showToast = (msg) => {
    setToast(msg)
    setTimeout(() => setToast(''), 2500)
  }

  useEffect(() => {
    if (!lessonId) { setError('Ders bilgisi bulunamadı.'); setLoading(false); return }

    Promise.all([
      apiGet(`/student/lesson/${lessonId}`),
      apiGet(`/student/lesson/${lessonId}/notes`),
    ])
      .then(async ([l, n]) => {
        setLesson(l)
        setNotes(n)
        // Resolve GCS URL to a playable signed URL
        const playableUrl = await resolveVideoUrl(l.videoUrl)
        setResolvedVideoSrc(playableUrl)
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [lessonId])

  const handleCapture = () => {
    const video = videoRef.current
    if (video) {
      setCapturedTime(Math.floor(video.currentTime))
      setCapturing(true)
      video.pause()
    }
  }

  const handleSaveNote = async () => {
    if (!newNote.trim() || capturedTime === null) return
    setSaving(true)
    try {
      const created = await apiPost(`/student/lesson/${lessonId}/notes`, {
        timestamp: capturedTime,
        note: newNote,
      })
      setNotes(prev => [...prev, created].sort((a, b) => a.timestamp - b.timestamp))
      setNewNote('')
      setCapturing(false)
      setCapturedTime(null)
      showToast('📝 Not kaydedildi!')
    } catch (err) { setError(err.message) }
    finally { setSaving(false) }
  }

  const handleCancelCapture = () => {
    setCapturing(false)
    setCapturedTime(null)
    setNewNote('')
  }

  const handleEditSave = async (noteId) => {
    if (!editText.trim()) return
    try {
      await apiPut(`/student/lesson/${lessonId}/notes/${noteId}`, { note: editText })
      setNotes(prev => prev.map(n => n.id === noteId ? { ...n, note: editText } : n))
      setEditId(null)
      showToast('✅ Not güncellendi!')
    } catch (err) { setError(err.message) }
  }

  const handleDelete = async (noteId) => {
    if (!confirm('Bu notu silmek istediğinize emin misiniz?')) return
    try {
      await apiDelete(`/student/lesson/${lessonId}/notes/${noteId}`)
      setNotes(prev => prev.filter(n => n.id !== noteId))
      showToast('🗑️ Not silindi.')
    } catch (err) { setError(err.message) }
  }

  const seekTo = useCallback((timestamp) => {
    const video = videoRef.current
    if (video) { video.currentTime = timestamp; video.play() }
  }, [])

  if (loading) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: '500px' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: '60px', height: '60px', borderRadius: '50%', border: '4px solid #e2e8f0', borderTopColor: '#8b5cf6', animation: 'spin 1s linear infinite', margin: '0 auto 1.5rem' }} />
          <p style={{ color: '#64748b', fontWeight: 700, fontSize: '1.1rem' }}>Ders kaydı yükleniyor...</p>
        </div>
      </div>
    )
  }

  if (error && !lesson) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: '400px' }}>
        <div style={{ textAlign: 'center', color: '#f43f5e' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>😵</div>
          <p style={{ fontWeight: 800 }}>{error}</p>
          <button onClick={() => navigate('/student/derslerim')} style={{
            marginTop: '1rem', padding: '10px 24px', borderRadius: '100px',
            background: '#6366f1', color: '#fff', border: 'none', fontWeight: 700, cursor: 'pointer',
          }}>← Derslerime Dön</button>
        </div>
      </div>
    )
  }

  // Use resolved signed URL, then original videoUrl, then branding video as fallback
  const videoSrc = resolvedVideoSrc || lesson?.videoUrl || lectureAiVideo

  return (
    <div style={{ animation: 'fadeIn 0.5s ease' }}>
      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: '24px', right: '24px', zIndex: 9999,
          background: 'linear-gradient(135deg, #10b981, #059669)', color: '#fff',
          padding: '14px 28px', borderRadius: '16px', fontWeight: 800, fontSize: '0.9rem',
          boxShadow: '0 12px 40px rgba(16,185,129,0.4)',
          animation: 'slideInRight 0.3s ease',
        }}>
          {toast}
        </div>
      )}

      {/* Back Button + Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '1.5rem' }}>
        <button onClick={() => navigate('/student/derslerim')} style={{
          background: 'rgba(99,102,241,0.1)', border: 'none', borderRadius: '14px',
          padding: '10px 14px', cursor: 'pointer', color: '#6366f1', fontWeight: 800, fontSize: '0.85rem',
          transition: 'all 0.2s',
        }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(99,102,241,0.2)'}
          onMouseLeave={e => e.currentTarget.style.background = 'rgba(99,102,241,0.1)'}
        >
          ← Geri
        </button>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 900, color: '#1e293b', letterSpacing: '-0.03em' }}>
            {lesson?.courseName} — {formatLessonLabel(lesson?.lessonNo, lesson?.moduleSize)}
          </h2>
          <p style={{ margin: '2px 0 0', fontSize: '0.82rem', color: '#94a3b8', fontWeight: 600 }}>
            {lesson?.teacherName} • {new Date(lesson?.dateTime).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
      </div>

      {/* Split Layout */}
      <div className="responsive-player-grid" style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '1.5rem', minHeight: '520px' }}>

        {/* LEFT — Video Player */}
        <div style={{
          borderRadius: '24px', overflow: 'hidden',
          background: 'linear-gradient(145deg, #0f0a2e 0%, #1a1145 50%, #0d1f3c 100%)',
          boxShadow: '0 20px 60px rgba(15,10,46,0.5)',
          display: 'flex', flexDirection: 'column',
        }}>
          {/* Video */}
          <div style={{ position: 'relative', flex: 1, minHeight: '360px', background: '#000' }}>
            <video
              ref={videoRef}
              src={videoSrc}
              controls
              style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
            />

            {/* Note Markers on Timeline Overlay */}
            {notes.length > 0 && videoRef.current?.duration && (
              <div style={{
                position: 'absolute', bottom: '48px', left: '12px', right: '12px',
                height: '4px', pointerEvents: 'none',
              }}>
                {notes.map(n => {
                  const pct = (n.timestamp / videoRef.current.duration) * 100
                  return (
                    <div key={n.id} style={{
                      position: 'absolute', left: `${pct}%`, top: '-3px',
                      width: '10px', height: '10px', borderRadius: '50%',
                      background: '#8b5cf6', border: '2px solid #fff',
                      boxShadow: '0 0 8px rgba(139,92,246,0.6)',
                      pointerEvents: 'auto', cursor: 'pointer',
                      transform: 'translateX(-50%)',
                    }}
                      title={`${fmt(n.timestamp)} — ${n.note}`}
                      onClick={() => seekTo(n.timestamp)}
                    />
                  )
                })}
              </div>
            )}
          </div>

          {/* Capture Bar */}
          <div style={{
            padding: '16px 20px',
            background: 'linear-gradient(135deg, rgba(139,92,246,0.15), rgba(16,185,129,0.1))',
            borderTop: '1px solid rgba(255,255,255,0.06)',
          }}>
            {!capturing ? (
              <button onClick={handleCapture} style={{
                width: '100%', padding: '12px', borderRadius: '14px', border: 'none',
                background: 'linear-gradient(135deg, #8b5cf6, #6366f1)', color: '#fff',
                fontWeight: 800, fontSize: '0.9rem', cursor: 'pointer',
                boxShadow: '0 8px 24px rgba(99,102,241,0.35)',
                transition: 'all 0.25s',
              }}
                onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
                onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
              >
                📌 Bu Anı İşaretle
              </button>
            ) : (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                  <span style={{
                    background: '#8b5cf6', color: '#fff', padding: '4px 12px',
                    borderRadius: '100px', fontSize: '0.75rem', fontWeight: 800,
                  }}>
                    ⏱ {fmt(capturedTime)}
                  </span>
                  <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.8rem', fontWeight: 600 }}>
                    Bu an için notunuzu yazın
                  </span>
                </div>
                <textarea
                  value={newNote}
                  onChange={e => setNewNote(e.target.value)}
                  placeholder="Bu anda ne dikkatinizi çekti?"
                  autoFocus
                  style={{
                    width: '100%', minHeight: '70px', padding: '12px',
                    borderRadius: '12px', border: '1.5px solid rgba(139,92,246,0.3)',
                    background: 'rgba(255,255,255,0.05)', color: '#fff',
                    fontSize: '0.85rem', fontFamily: 'inherit', outline: 'none',
                    resize: 'vertical',
                  }}
                  onFocus={e => e.currentTarget.style.borderColor = '#8b5cf6'}
                  onBlur={e => e.currentTarget.style.borderColor = 'rgba(139,92,246,0.3)'}
                />
                <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                  <button onClick={handleCancelCapture} style={{
                    flex: 1, padding: '10px', borderRadius: '12px', border: 'none',
                    background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)',
                    fontWeight: 700, cursor: 'pointer', fontSize: '0.82rem',
                  }}>İptal</button>
                  <button onClick={handleSaveNote} disabled={saving || !newNote.trim()} style={{
                    flex: 2, padding: '10px', borderRadius: '12px', border: 'none',
                    background: 'linear-gradient(135deg, #10b981, #059669)', color: '#fff',
                    fontWeight: 800, cursor: saving ? 'wait' : 'pointer', fontSize: '0.82rem',
                    boxShadow: '0 4px 16px rgba(16,185,129,0.3)',
                    opacity: !newNote.trim() ? 0.5 : 1,
                  }}>{saving ? '⏳ Kaydediliyor...' : '💾 Notu Kaydet'}</button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT — Notes Panel */}
        <div style={{
          borderRadius: '24px', overflow: 'hidden',
          background: 'linear-gradient(180deg, #faf5ff 0%, #f0fdf4 100%)',
          border: '1px solid #e9d5ff',
          display: 'flex', flexDirection: 'column',
        }}>
          {/* Panel Header */}
          <div style={{
            padding: '20px 24px',
            background: 'linear-gradient(135deg, rgba(139,92,246,0.08), rgba(16,185,129,0.06))',
            borderBottom: '1px solid #e9d5ff',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 900, color: '#1e1b4b', letterSpacing: '-0.02em' }}>
                📒 Ders Notlarım
              </h3>
              <span style={{
                background: 'linear-gradient(135deg, #8b5cf6, #6366f1)', color: '#fff',
                padding: '4px 14px', borderRadius: '100px', fontSize: '0.72rem', fontWeight: 800,
              }}>
                {notes.length} not
              </span>
            </div>
            <p style={{ margin: '6px 0 0', fontSize: '0.78rem', color: '#7c3aed', fontWeight: 600 }}>
              Videoyu izlerken "📌 Bu Anı İşaretle" butonuna tıklayarak not ekleyebilirsiniz
            </p>
          </div>

          {/* Notes List */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px', maxHeight: '440px' }}>
            {notes.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#a78bfa' }}>
                <div style={{ fontSize: '3rem', marginBottom: '1rem', opacity: 0.5 }}>📝</div>
                <p style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: '4px' }}>Henüz not yok</p>
                <p style={{ fontSize: '0.8rem', color: '#c4b5fd' }}>Videoyu izlerken önemli anları işaretleyebilirsin!</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {notes.map(n => (
                  <div key={n.id} style={{
                    padding: '14px 16px', borderRadius: '16px',
                    background: editId === n.id ? '#fff' : 'rgba(255,255,255,0.7)',
                    border: `1.5px solid ${editId === n.id ? '#8b5cf6' : 'rgba(139,92,246,0.12)'}`,
                    backdropFilter: 'blur(8px)',
                    transition: 'all 0.25s',
                    boxShadow: editId === n.id ? '0 8px 24px rgba(139,92,246,0.15)' : '0 2px 8px rgba(0,0,0,0.03)',
                  }}
                    onMouseEnter={e => { if (editId !== n.id) e.currentTarget.style.borderColor = 'rgba(139,92,246,0.3)' }}
                    onMouseLeave={e => { if (editId !== n.id) e.currentTarget.style.borderColor = 'rgba(139,92,246,0.12)' }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <button onClick={() => seekTo(n.timestamp)} style={{
                        background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)', color: '#fff',
                        border: 'none', borderRadius: '100px', padding: '4px 12px',
                        fontSize: '0.72rem', fontWeight: 800, cursor: 'pointer',
                        boxShadow: '0 2px 8px rgba(139,92,246,0.3)',
                        transition: 'all 0.2s',
                      }}
                        onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.05)'}
                        onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                      >
                        ▶ {fmt(n.timestamp)}
                      </button>
                      {editId !== n.id && (
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <button onClick={() => { setEditId(n.id); setEditText(n.note) }} style={{
                            background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.8rem', padding: '2px',
                          }} title="Düzenle">✏️</button>
                          <button onClick={() => handleDelete(n.id)} style={{
                            background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.8rem', padding: '2px',
                          }} title="Sil">🗑️</button>
                        </div>
                      )}
                    </div>

                    {editId === n.id ? (
                      <div>
                        <textarea value={editText} onChange={e => setEditText(e.target.value)}
                          style={{
                            width: '100%', minHeight: '60px', padding: '10px', borderRadius: '10px',
                            border: '1.5px solid #8b5cf6', fontSize: '0.82rem', outline: 'none',
                            fontFamily: 'inherit', background: '#faf5ff', resize: 'vertical',
                          }}
                        />
                        <div style={{ display: 'flex', gap: '6px', marginTop: '8px', justifyContent: 'flex-end' }}>
                          <button onClick={() => setEditId(null)} style={{
                            padding: '5px 14px', borderRadius: '100px', border: 'none',
                            background: '#f1f5f9', color: '#64748b', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer',
                          }}>İptal</button>
                          <button onClick={() => handleEditSave(n.id)} style={{
                            padding: '5px 14px', borderRadius: '100px', border: 'none',
                            background: '#8b5cf6', color: '#fff', fontSize: '0.75rem', fontWeight: 800, cursor: 'pointer',
                            boxShadow: '0 4px 12px rgba(139,92,246,0.3)',
                          }}>💾 Kaydet</button>
                        </div>
                      </div>
                    ) : (
                      <p style={{ margin: 0, fontSize: '0.83rem', color: '#374151', lineHeight: 1.6, fontWeight: 500 }}>
                        {n.note}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Lesson Info Footer */}
          <div style={{
            padding: '16px 20px',
            background: 'rgba(139,92,246,0.04)',
            borderTop: '1px solid #e9d5ff',
          }}>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{
                padding: '5px 12px', borderRadius: '100px',
                background: 'rgba(139,92,246,0.1)', color: '#7c3aed',
                fontSize: '0.7rem', fontWeight: 700,
              }}>📚 {lesson?.courseName}</span>
              <span style={{
                padding: '5px 12px', borderRadius: '100px',
                background: 'rgba(16,185,129,0.1)', color: '#059669',
                fontSize: '0.7rem', fontWeight: 700,
              }}>👩‍🏫 {lesson?.teacherName}</span>
              {lesson?.schedule && (
                <span style={{
                  padding: '5px 12px', borderRadius: '100px',
                  background: 'rgba(245,158,11,0.1)', color: '#d97706',
                  fontSize: '0.7rem', fontWeight: 700,
                }}>📅 {lesson.schedule}</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Inline Styles */}
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes slideInRight {
          from { transform: translateX(100px); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </div>
  )
}

export default StudentLessonPlayer
