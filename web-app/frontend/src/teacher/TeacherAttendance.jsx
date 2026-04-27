import { useState, useEffect } from 'react'
import { apiGet, apiPost, apiPut, apiDelete } from '../api'

const TeacherAttendance = () => {
  const [groups, setGroups] = useState([])
  const [selectedGroup, setSelectedGroup] = useState(null)
  const [students, setStudents] = useState([])
  const [evaluations, setEvaluations] = useState([])
  const [selectedStudent, setSelectedStudent] = useState(null)
  const [note, setNote] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Edit state
  const [editingId, setEditingId] = useState(null)
  const [editNote, setEditNote] = useState('')
  const [editSaving, setEditSaving] = useState(false)

  useEffect(() => {
    Promise.all([apiGet('/teacher/lessons'), apiGet('/teacher/my-evaluations')])
      .then(([g, e]) => { setGroups(g); setEvaluations(e); if (g.length > 0) setSelectedGroup(g[0].groupId) })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!selectedGroup) return
    apiGet(`/teacher/lessons/${selectedGroup}/students`)
      .then(data => setStudents(data))
      .catch(err => setError(err.message))
  }, [selectedGroup])

  const handleSend = async () => {
    if (!selectedStudent || !note.trim()) return
    setSending(true); setError(''); setSuccess('')
    try {
      await apiPost('/teacher/student-evaluation', { studentId: selectedStudent, note })
      setSuccess('Değerlendirme notu başarıyla gönderildi!')
      setNote(''); setSelectedStudent(null)
      const updated = await apiGet('/teacher/my-evaluations')
      setEvaluations(updated)
    } catch (err) { setError(err.message) }
    finally { setSending(false) }
  }

  const handleEdit = (ev) => {
    setEditingId(ev.id)
    setEditNote(ev.note)
  }

  const handleEditCancel = () => {
    setEditingId(null)
    setEditNote('')
  }

  const handleEditSave = async (id) => {
    if (!editNote.trim()) return
    setEditSaving(true)
    try {
      await apiPut(`/teacher/student-evaluation/${id}`, { note: editNote })
      setEvaluations(prev => prev.map(ev => ev.id === id ? { ...ev, note: editNote } : ev))
      setEditingId(null)
      setEditNote('')
      setSuccess('Değerlendirme güncellendi!')
      setTimeout(() => setSuccess(''), 2500)
    } catch (err) { setError(err.message) }
    finally { setEditSaving(false) }
  }

  const handleDelete = async (id) => {
    if (!confirm('Bu değerlendirmeyi silmek istediğinize emin misiniz?')) return
    try {
      await apiDelete(`/teacher/student-evaluation/${id}`)
      setEvaluations(prev => prev.filter(ev => ev.id !== id))
      setSuccess('Değerlendirme silindi.')
      setTimeout(() => setSuccess(''), 2500)
    } catch (err) { setError(err.message) }
  }

  if (loading) return (<div style={{display:'grid', placeItems:'center', minHeight:'400px'}}><div style={{textAlign:'center', color:'#64748b'}}><div style={{fontSize:'2rem', marginBottom:'1rem'}}>⏳</div><p style={{fontWeight:700}}>Yükleniyor...</p></div></div>)

  const currentGroup = groups.find(g => g.groupId === selectedGroup)

  return (
    <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', animation: 'fadeIn 0.5s ease'}}>
      {/* Left: Send Evaluation */}
      <div className="report-card-internal" style={{padding: '2rem'}}>
        <h3 style={{fontSize:'1rem', fontWeight:800, color:'#0f172a', marginBottom:'1.5rem'}}>📝 Öğrenci Değerlendirmesi</h3>

        {/* Group Selector */}
        <div style={{marginBottom:'1.5rem'}}>
          <label style={{fontSize:'11px', fontWeight:800, color:'#64748b', display:'block', marginBottom:'8px', textTransform:'uppercase', letterSpacing:'0.05em'}}>GRUP</label>
          <select value={selectedGroup || ''} onChange={e => setSelectedGroup(e.target.value)}
            style={{width:'100%', padding:'12px', borderRadius:'12px', border:'1px solid #e2e8f0', fontSize:'0.9rem', fontWeight:600, background:'#f8fafc', outline:'none'}}>
            {groups.map(g => <option key={g.groupId} value={g.groupId}>{g.groupName || g.courseName} ({g.age} yaş) — {g.schedule}</option>)}
          </select>
        </div>

        {/* Student Selector */}
        <div style={{marginBottom:'1.5rem'}}>
          <label style={{fontSize:'11px', fontWeight:800, color:'#64748b', display:'block', marginBottom:'8px', textTransform:'uppercase', letterSpacing:'0.05em'}}>ÖĞRENCİ</label>
          <div style={{display:'flex', flexDirection:'column', gap:'8px'}}>
            {students.map(s => (
              <div key={s.id} onClick={() => setSelectedStudent(s.id)}
                style={{
                  padding:'12px 16px', borderRadius:'12px', cursor:'pointer', transition:'all 0.2s',
                  border: `1px solid ${selectedStudent === s.id ? 'var(--primary)' : '#e2e8f0'}`,
                  background: selectedStudent === s.id ? '#f5f3ff' : '#fff',
                  display:'flex', alignItems:'center', gap:'12px',
                }}>
                <div style={{width:'32px', height:'32px', borderRadius:'10px', background: selectedStudent === s.id ? 'var(--primary)' : '#e2e8f0', display:'grid', placeItems:'center', color: selectedStudent === s.id ? '#fff' : '#64748b', fontSize:'11px', fontWeight:800}}>
                  {s.name.split(' ').map(n=>n[0]).join('').slice(0,2)}
                </div>
                <div>
                  <span style={{fontWeight:700, fontSize:'0.9rem', color:'#1e293b'}}>{s.name}</span>
                  {s.age && <span style={{display:'block', fontSize:'0.75rem', color:'#94a3b8'}}>{s.age} yaş</span>}
                </div>
              </div>
            ))}
            {students.length === 0 && <p style={{color:'#94a3b8', fontSize:'0.85rem'}}>Bu grupta öğrenci bulunmuyor.</p>}
          </div>
        </div>

        {/* Note */}
        <div style={{marginBottom:'1.5rem'}}>
          <label style={{fontSize:'11px', fontWeight:800, color:'#64748b', display:'block', marginBottom:'8px', textTransform:'uppercase', letterSpacing:'0.05em'}}>DEĞERLENDİRME NOTU</label>
          <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Öğrenci hakkındaki değerlendirmenizi yazın..."
            style={{width:'100%', minHeight:'120px', padding:'1rem', borderRadius:'12px', border:'1px solid #e2e8f0', fontSize:'0.9rem', outline:'none', background:'#f8fafc'}} />
        </div>

        {error && <div style={{color:'#f43f5e', background:'#ffe4e6', padding:'0.75rem', borderRadius:'8px', fontSize:'0.85rem', marginBottom:'1rem'}}>{error}</div>}
        {success && <div style={{color:'#16a34a', background:'#dcfce7', padding:'0.75rem', borderRadius:'8px', fontSize:'0.85rem', marginBottom:'1rem'}}>{success}</div>}

        <button className="primary-btn" onClick={handleSend} disabled={!selectedStudent || !note.trim() || sending}
          style={{width:'100%', padding:'12px', fontWeight:800, background: selectedStudent && note.trim() ? 'var(--primary)' : '#e2e8f0', color: selectedStudent && note.trim() ? '#fff' : '#94a3b8'}}>
          {sending ? 'GÖNDERİLİYOR...' : 'DEĞERLENDİRME GÖNDER'}
        </button>
      </div>

      {/* Right: Past Evaluations */}
      <div className="report-card-internal" style={{padding: '2rem', maxHeight:'600px', overflowY:'auto'}}>
        <h3 style={{fontSize:'1rem', fontWeight:800, color:'#0f172a', marginBottom:'1.5rem'}}>💬 Gönderilen Değerlendirmeler ({evaluations.length})</h3>
        {evaluations.length === 0 ? (
          <p style={{color:'#94a3b8', textAlign:'center', padding:'3rem'}}>Henüz değerlendirme gönderilmedi.</p>
        ) : (
          <div style={{display:'flex', flexDirection:'column', gap:'1rem'}}>
            {evaluations.map(ev => (
              <div key={ev.id} style={{
                padding:'1.25rem', borderRadius:'14px',
                background: editingId === ev.id ? '#fff' : '#f8fafc',
                border: `1.5px solid ${editingId === ev.id ? '#6366f1' : '#f1f5f9'}`,
                transition:'all 0.25s',
              }}>
                <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'8px'}}>
                  <span style={{fontWeight:800, fontSize:'0.9rem', color:'#1e293b'}}>{ev.studentName}</span>
                  <div style={{display:'flex', alignItems:'center', gap:'6px'}}>
                    <span style={{fontSize:'0.72rem', color:'#94a3b8'}}>{new Date(ev.createdAt).toLocaleDateString('tr-TR')}</span>
                    {editingId !== ev.id && (
                      <>
                        <button onClick={() => handleEdit(ev)} style={{
                          background:'none', border:'none', cursor:'pointer',
                          fontSize:'0.85rem', padding:'2px', color:'#6366f1',
                          transition:'all 0.2s',
                        }} title="Düzenle">✏️</button>
                        <button onClick={() => handleDelete(ev.id)} style={{
                          background:'none', border:'none', cursor:'pointer',
                          fontSize:'0.85rem', padding:'2px', color:'#ef4444',
                          transition:'all 0.2s',
                        }} title="Sil">🗑️</button>
                      </>
                    )}
                  </div>
                </div>

                {editingId === ev.id ? (
                  <div>
                    <textarea value={editNote} onChange={e => setEditNote(e.target.value)}
                      style={{
                        width:'100%', minHeight:'80px', padding:'10px 12px', borderRadius:'10px',
                        border:'1.5px solid #6366f1', fontSize:'0.85rem', outline:'none',
                        background:'#fafafe', fontFamily:'inherit', resize:'vertical',
                      }}
                      onFocus={e => { e.currentTarget.style.borderColor = '#6366f1' }}
                    />
                    <div style={{display:'flex', gap:'8px', marginTop:'10px', justifyContent:'flex-end'}}>
                      <button onClick={handleEditCancel} style={{
                        padding:'6px 16px', borderRadius:'100px', border:'none',
                        background:'#f1f5f9', color:'#64748b', fontSize:'0.78rem',
                        fontWeight:800, cursor:'pointer',
                      }}>İptal</button>
                      <button onClick={() => handleEditSave(ev.id)} disabled={editSaving || !editNote.trim()} style={{
                        padding:'6px 16px', borderRadius:'100px', border:'none',
                        background:'#6366f1', color:'#fff', fontSize:'0.78rem',
                        fontWeight:800, cursor: editSaving ? 'wait' : 'pointer',
                        boxShadow:'0 4px 12px rgba(99,102,241,0.3)',
                      }}>{editSaving ? '⏳ Kaydediliyor...' : '💾 Kaydet'}</button>
                    </div>
                  </div>
                ) : (
                  <p style={{margin:0, fontSize:'0.85rem', color:'#475569', lineHeight:1.6, fontStyle:'italic'}}>"{ev.note}"</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default TeacherAttendance
