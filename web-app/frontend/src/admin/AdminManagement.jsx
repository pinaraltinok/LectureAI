import { useState, useEffect } from 'react'
import { apiGet, apiPost, apiPut, apiDelete } from '../api'

const TABS = [
  { key: 'add-user', label: '➕ Kullanıcı Ekle', color: '#6366f1' },
  { key: 'student-group', label: '👥 Öğrenci → Grup', color: '#10b981' },
  { key: 'teacher-courses', label: '📚 Eğitmen Kursları', color: '#f59e0b' },
  { key: 'create-course', label: '📖 Kurs Ekle', color: '#06b6d4' },
  { key: 'create-group', label: '🏫 Grup Oluştur', color: '#ec4899' },
]

const AdminManagement = () => {
  const [activeTab, setActiveTab] = useState('add-user')
  const [teachers, setTeachers] = useState([])
  const [students, setStudents] = useState([])
  const [courses, setCourses] = useState([])
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(true)
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')

  // Form states
  const [form, setForm] = useState({ name: '', email: '', password: 'password123', phone: '', role: 'student', age: '', parent: '', parentPhone: '', startOfDate: '' })
  const [selectedStudentId, setSelectedStudentId] = useState('')
  const [selectedGroupId, setSelectedGroupId] = useState('')
  const [selectedTeacherId, setSelectedTeacherId] = useState('')
  const [selectedCourseIds, setSelectedCourseIds] = useState([])
  const [groupForm, setGroupForm] = useState({ courseId: '', teacherId: '', schedule: '' })
  const [courseForm, setCourseForm] = useState({ course: '', age: '', lessonSize: '60', moduleNum: '1', moduleSize: '4' })
  const [editingGroup, setEditingGroup] = useState(null)
  const [editingCourse, setEditingCourse] = useState(null)

  const loadData = async () => {
    try {
      const [t, s, c, g] = await Promise.all([
        apiGet('/admin/teachers'),
        apiGet('/admin/students'),
        apiGet('/admin/courses'),
        apiGet('/admin/groups'),
      ])
      setTeachers(t); setStudents(s); setCourses(c); setGroups(g)
      if (t.length > 0) { setSelectedTeacherId(t[0].id); setGroupForm(f => ({ ...f, teacherId: t[0].id })) }
      if (s.length > 0) setSelectedStudentId(s[0].id)
      if (g.length > 0) setSelectedGroupId(g[0].id)
      if (c.length > 0) setGroupForm(f => ({ ...f, courseId: c[0].id }))
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }

  useEffect(() => { loadData() }, [])

  useEffect(() => { setSuccess(''); setError('') }, [activeTab])

  // Load teacher's current courses when selectedTeacherId changes
  useEffect(() => {
    if (!selectedTeacherId || activeTab !== 'teacher-courses') return
    apiGet(`/admin/teacher/${selectedTeacherId}/courses`)
      .then(data => setSelectedCourseIds(data.map(c => c.id)))
      .catch(() => setSelectedCourseIds([]))
  }, [selectedTeacherId, activeTab])

  const showMsg = (msg, isError = false) => {
    if (isError) { setError(msg); setSuccess('') } else { setSuccess(msg); setError('') }
    setTimeout(() => { setSuccess(''); setError('') }, 4000)
  }

  const handleCreateUser = async () => {
    if (!form.name || !form.email) return showMsg('Ad ve email gereklidir.', true)
    try {
      const res = await apiPost('/admin/users', form)
      showMsg(res.message || 'Kullanıcı oluşturuldu!')
      setForm({ name: '', email: '', password: 'password123', phone: '', role: 'student', age: '', parent: '', parentPhone: '', startOfDate: '' })
      await loadData()
    } catch (err) { showMsg(err.message, true) }
  }

  const handleAssignStudent = async () => {
    if (!selectedStudentId || !selectedGroupId) return showMsg('Öğrenci ve grup seçin.', true)
    try {
      const res = await apiPost('/admin/student-group/assign', { studentId: selectedStudentId, groupId: selectedGroupId })
      showMsg(res.message || 'Atandı!')
      await loadData()
    } catch (err) { showMsg(err.message, true) }
  }

  const handleRemoveStudent = async (studentId, groupId) => {
    try {
      const res = await apiPost('/admin/student-group/remove', { studentId, groupId })
      showMsg(res.message || 'Çıkarıldı!')
      await loadData()
    } catch (err) { showMsg(err.message, true) }
  }

  const handleSetTeacherCourses = async () => {
    if (!selectedTeacherId) return
    try {
      const res = await apiPost('/admin/teacher-courses', { teacherId: selectedTeacherId, courseIds: selectedCourseIds })
      showMsg(res.message || 'Kurslar güncellendi!')
    } catch (err) { showMsg(err.message, true) }
  }

  const toggleCourse = (courseId) => {
    setSelectedCourseIds(prev => prev.includes(courseId) ? prev.filter(id => id !== courseId) : [...prev, courseId])
  }

  const handleCreateGroup = async () => {
    if (!groupForm.courseId || !groupForm.teacherId) return showMsg('Kurs ve eğitmen seçin.', true)
    try {
      const res = await apiPost('/admin/groups', groupForm)
      showMsg(res.message || 'Grup oluşturuldu!')
      setGroupForm(f => ({ ...f, schedule: '' }))
      await loadData()
    } catch (err) { showMsg(err.message, true) }
  }

  const handleCreateCourse = async () => {
    if (!courseForm.course || !courseForm.age) return showMsg('Kurs adı ve yaş grubu gereklidir.', true)
    try {
      const res = await apiPost('/admin/courses', courseForm)
      showMsg(res.message || 'Kurs oluşturuldu!')
      setCourseForm({ course: '', age: '', lessonSize: '60', moduleNum: '1', moduleSize: '4' })
      await loadData()
    } catch (err) { showMsg(err.message, true) }
  }

  const handleUpdateGroup = async (id, data) => {
    try {
      const res = await apiPut(`/admin/groups/${id}`, data)
      showMsg(res.message || 'Güncellendi!'); setEditingGroup(null); await loadData()
    } catch (err) { showMsg(err.message, true) }
  }
  const handleDeleteGroup = async (id) => {
    if (!confirm('Bu grubu silmek istediğinize emin misiniz?')) return
    try { const res = await apiDelete(`/admin/groups/${id}`); showMsg(res.message); await loadData() } catch (err) { showMsg(err.message, true) }
  }
  const handleUpdateCourse = async (id, data) => {
    try {
      const res = await apiPut(`/admin/courses/${id}`, data)
      showMsg(res.message || 'Güncellendi!'); setEditingCourse(null); await loadData()
    } catch (err) { showMsg(err.message, true) }
  }
  const handleDeleteCourse = async (id) => {
    if (!confirm('Bu kursu silmek istediğinize emin misiniz?')) return
    try { const res = await apiDelete(`/admin/courses/${id}`); showMsg(res.message); await loadData() } catch (err) { showMsg(err.message, true) }
  }
  const handleDeleteUser = async (id) => {
    if (!confirm('Bu kullanıcıyı silmek istediğinize emin misiniz?')) return
    try { const res = await apiDelete(`/admin/users/${id}`); showMsg(res.message); await loadData() } catch (err) { showMsg(err.message, true) }
  }

  if (loading) return (<div style={{display:'grid', placeItems:'center', minHeight:'400px'}}><div style={{textAlign:'center', color:'#64748b'}}><div style={{fontSize:'2rem', marginBottom:'1rem'}}>⏳</div><p style={{fontWeight:700}}>Yükleniyor...</p></div></div>)

  const activeColor = TABS.find(t => t.key === activeTab)?.color || '#6366f1'

  return (
    <div style={{ animation: 'fadeIn 0.5s ease' }}>
      {/* Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '2rem', flexWrap: 'wrap' }}>
        {TABS.map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
            padding: '10px 20px', borderRadius: '14px', border: 'none', cursor: 'pointer',
            background: activeTab === tab.key ? tab.color : '#f1f5f9',
            color: activeTab === tab.key ? '#fff' : '#64748b',
            fontWeight: 800, fontSize: '0.85rem', transition: 'all 0.3s',
            boxShadow: activeTab === tab.key ? `0 8px 20px -4px ${tab.color}55` : 'none',
          }}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Messages */}
      {success && <div style={{color:'#16a34a', background:'#dcfce7', padding:'0.75rem 1.5rem', borderRadius:'12px', fontSize:'0.9rem', marginBottom:'1.5rem', fontWeight:700}}>✓ {success}</div>}
      {error && <div style={{color:'#f43f5e', background:'#ffe4e6', padding:'0.75rem 1.5rem', borderRadius:'12px', fontSize:'0.9rem', marginBottom:'1.5rem', fontWeight:700}}>⚠ {error}</div>}

      {/* TAB 1: Add User */}
      {activeTab === 'add-user' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
          <div className="report-card-internal" style={{ padding: '2rem', borderRadius: '16px' }}>
            <h3 style={{ margin: '0 0 2rem', fontSize: '1.1rem', fontWeight: 900, color: '#0f172a' }}>Yeni Kullanıcı Oluştur</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
              <InputField label="AD SOYAD" value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} placeholder="Adı Soyadı" />
              <InputField label="E-POSTA" value={form.email} onChange={v => setForm(f => ({ ...f, email: v }))} placeholder="email@example.com" />
              <InputField label="ŞİFRE" value={form.password} onChange={v => setForm(f => ({ ...f, password: v }))} placeholder="password123" />
              <InputField label="TELEFON" value={form.phone} onChange={v => setForm(f => ({ ...f, phone: v }))} placeholder="+90 5xx xxx xx xx" />
              <div>
                <label style={labelStyle}>ROL</label>
                <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} style={selectStyle}>
                  <option value="student">Öğrenci</option>
                  <option value="teacher">Eğitmen</option>
                </select>
              </div>
              {form.role === 'student' && (
                <>
                  <InputField label="YAŞ" value={form.age} onChange={v => setForm(f => ({ ...f, age: v }))} placeholder="10" type="number" />
                  <InputField label="VELİ ADI" value={form.parent} onChange={v => setForm(f => ({ ...f, parent: v }))} placeholder="Veli Adı Soyadı" />
                  <InputField label="VELİ TELEFONU" value={form.parentPhone} onChange={v => setForm(f => ({ ...f, parentPhone: v }))} placeholder="+90 5xx" />
                </>
              )}
              {form.role === 'teacher' && (
                <InputField label="BAŞLANGIÇ TARİHİ" value={form.startOfDate} onChange={v => setForm(f => ({ ...f, startOfDate: v }))} type="date" />
              )}
            </div>
            <button className="primary-btn" onClick={handleCreateUser} style={{ marginTop: '2rem', padding: '14px 40px', fontWeight: 800 }}>
              Kullanıcı Oluştur
            </button>
          </div>

          {/* Existing Users */}
          <div className="report-card-internal" style={{ padding: '2rem', maxHeight: '550px', overflowY: 'auto' }}>
            <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 900, color: '#0f172a' }}>Eğitmenler ({teachers.length})</h3>
            {teachers.map(t => (
              <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 14px', borderRadius: '10px', background: '#f8fafc', border: '1px solid #f1f5f9', marginBottom: '6px' }}>
                <div><span style={{ fontWeight: 700, fontSize: '0.85rem' }}>{t.name}</span><span style={{ color: '#94a3b8', fontSize: '0.75rem', marginLeft: '8px' }}>{t.email}</span></div>
                <button onClick={() => handleDeleteUser(t.id)} style={{ border: 'none', background: '#fee2e2', color: '#dc2626', padding: '3px 10px', borderRadius: '6px', fontSize: '0.7rem', fontWeight: 800, cursor: 'pointer' }}>✕</button>
              </div>
            ))}
            <h3 style={{ margin: '1.5rem 0 1rem', fontSize: '1rem', fontWeight: 900, color: '#0f172a' }}>Öğrenciler ({students.length})</h3>
            {students.map(s => (
              <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 14px', borderRadius: '10px', background: '#f8fafc', border: '1px solid #f1f5f9', marginBottom: '6px' }}>
                <div><span style={{ fontWeight: 700, fontSize: '0.85rem' }}>{s.name}</span><span style={{ color: '#94a3b8', fontSize: '0.75rem', marginLeft: '8px' }}>{s.email}</span></div>
                <button onClick={() => handleDeleteUser(s.id)} style={{ border: 'none', background: '#fee2e2', color: '#dc2626', padding: '3px 10px', borderRadius: '6px', fontSize: '0.7rem', fontWeight: 800, cursor: 'pointer' }}>✕</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 2: Student → Group */}
      {activeTab === 'student-group' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
          <div className="report-card-internal" style={{ padding: '2rem' }}>
            <h3 style={{ margin: '0 0 1.5rem', fontSize: '1.1rem', fontWeight: 900, color: '#0f172a' }}>Öğrenciyi Gruba Ata</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div>
                <label style={labelStyle}>ÖĞRENCİ</label>
                <select value={selectedStudentId} onChange={e => setSelectedStudentId(e.target.value)} style={selectStyle}>
                  {students.map(s => <option key={s.id} value={s.id}>{s.name} ({s.email})</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>GRUP</label>
                <select value={selectedGroupId} onChange={e => setSelectedGroupId(e.target.value)} style={selectStyle}>
                  {groups.map(g => {
                    const teacher = teachers.find(t => t.id === g.teacherId)
                    return <option key={g.id} value={g.id}>{g.courseName || '—'} — {teacher?.name || '?'} {g.schedule ? `(${g.schedule})` : ''}</option>
                  })}
                </select>
              </div>
              <button className="primary-btn" onClick={handleAssignStudent} style={{ padding: '12px 32px', fontWeight: 800 }}>
                Gruba Ata
              </button>
            </div>
          </div>

          {/* Current Assignments */}
          <div className="report-card-internal" style={{ padding: '2rem', maxHeight: '500px', overflowY: 'auto' }}>
            <h3 style={{ margin: '0 0 1.5rem', fontSize: '1rem', fontWeight: 900, color: '#0f172a' }}>Mevcut Atamalar</h3>
            {students.filter(s => s.groups.length > 0).length === 0 ? (
              <p style={{ color: '#94a3b8', textAlign: 'center', padding: '2rem' }}>Henüz atama yok.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {students.filter(s => s.groups.length > 0).map(s => (
                  <div key={s.id}>
                    {s.groups.map(g => (
                      <div key={`${s.id}-${g.groupId}`} style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '10px 16px', borderRadius: '12px', background: '#f8fafc', border: '1px solid #f1f5f9', marginBottom: '6px',
                      }}>
                        <div>
                          <span style={{ fontWeight: 700, fontSize: '0.85rem', color: '#1e293b' }}>{s.name}</span>
                          <span style={{ color: '#94a3b8', fontSize: '0.8rem', marginLeft: '8px' }}>→ {g.courseName} {g.schedule ? `(${g.schedule})` : ''}</span>
                        </div>
                        <button onClick={() => handleRemoveStudent(s.id, g.groupId)} style={{
                          border: 'none', background: '#fee2e2', color: '#dc2626', padding: '4px 12px',
                          borderRadius: '8px', fontSize: '0.75rem', fontWeight: 800, cursor: 'pointer',
                        }}>Çıkar</button>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: Teacher Courses */}
      {activeTab === 'teacher-courses' && (
        <div className="report-card-internal" style={{ padding: '2.5rem' }}>
          <h3 style={{ margin: '0 0 2rem', fontSize: '1.1rem', fontWeight: 900, color: '#0f172a' }}>Eğitmenin Verdiği Kurslar</h3>
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={labelStyle}>EĞİTMEN</label>
            <select value={selectedTeacherId} onChange={e => setSelectedTeacherId(e.target.value)} style={selectStyle}>
              {teachers.map(t => <option key={t.id} value={t.id}>{t.name} ({t.email})</option>)}
            </select>
          </div>
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={labelStyle}>KURSLAR (çoklu seçim)</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '10px', marginTop: '8px' }}>
              {courses.map(c => {
                const isSelected = selectedCourseIds.includes(c.id)
                return (
                  <div key={c.id} onClick={() => toggleCourse(c.id)} style={{
                    padding: '12px 16px', borderRadius: '14px', cursor: 'pointer', transition: 'all 0.2s',
                    border: `2px solid ${isSelected ? '#6366f1' : '#e2e8f0'}`,
                    background: isSelected ? '#f5f3ff' : '#fff',
                    display: 'flex', alignItems: 'center', gap: '10px',
                  }}>
                    <div style={{
                      width: '24px', height: '24px', borderRadius: '8px',
                      border: `2px solid ${isSelected ? '#6366f1' : '#cbd5e1'}`,
                      background: isSelected ? '#6366f1' : '#fff',
                      display: 'grid', placeItems: 'center', color: '#fff', fontSize: '12px', fontWeight: 900,
                      transition: 'all 0.2s',
                    }}>
                      {isSelected && '✓'}
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#1e293b' }}>{c.course}</div>
                      <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>Yaş: {c.age} • {c.moduleNum} Modül</div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
          <button className="primary-btn" onClick={handleSetTeacherCourses} style={{ padding: '12px 40px', fontWeight: 800 }}>
            Kursları Kaydet ({selectedCourseIds.length} seçili)
          </button>
        </div>
      )}

      {/* TAB 4: Create Group */}
      {activeTab === 'create-group' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
          <div className="report-card-internal" style={{ padding: '2.5rem' }}>
            <h3 style={{ margin: '0 0 2rem', fontSize: '1.1rem', fontWeight: 900, color: '#0f172a' }}>Yeni Grup Oluştur</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div>
                <label style={labelStyle}>KURS</label>
                <select value={groupForm.courseId} onChange={e => setGroupForm(f => ({ ...f, courseId: e.target.value }))} style={selectStyle}>
                  {courses.map(c => <option key={c.id} value={c.id}>{c.course} (Yaş: {c.age})</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>EĞİTMEN (Gruba Atanacak)</label>
                <select value={groupForm.teacherId} onChange={e => setGroupForm(f => ({ ...f, teacherId: e.target.value }))} style={selectStyle}>
                  {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <InputField label="PROGRAM (Opsiyonel)" value={groupForm.schedule} onChange={v => setGroupForm(f => ({ ...f, schedule: v }))} placeholder="Pazartesi 14:00, Çarşamba 16:00" />
              <button className="primary-btn" onClick={handleCreateGroup} style={{ padding: '14px 40px', fontWeight: 800 }}>
                Grup Oluştur
              </button>
            </div>
          </div>

          {/* Existing Groups */}
          <div className="report-card-internal" style={{ padding: '2rem', maxHeight: '500px', overflowY: 'auto' }}>
            <h3 style={{ margin: '0 0 1.5rem', fontSize: '1rem', fontWeight: 900, color: '#0f172a' }}>Mevcut Gruplar ({groups.length})</h3>
            {groups.length === 0 ? (
              <p style={{ color: '#94a3b8', textAlign: 'center', padding: '2rem' }}>Henüz grup yok.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {groups.map((g, idx) => {
                  const teacher = teachers.find(t => t.id === g.teacherId)
                  const colors = ['#6366f1', '#10b981', '#f59e0b', '#ec4899', '#06b6d4']
                  const c = colors[idx % colors.length]
                  const isEditing = editingGroup?.id === g.id
                  return (
                    <div key={g.id} style={{ padding: '14px 18px', borderRadius: '14px', background: '#f8fafc', border: '1px solid #f1f5f9', borderLeft: `4px solid ${c}` }}>
                      <div style={{ fontWeight: 800, fontSize: '0.9rem', color: '#1e293b' }}>{g.courseName || '—'}</div>
                      {isEditing ? (
                        <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <select value={editingGroup.teacherId} onChange={e => setEditingGroup(p => ({...p, teacherId: e.target.value}))} style={{...selectStyle, padding:'8px', fontSize:'0.8rem'}}>
                            {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                          </select>
                          <input value={editingGroup.schedule || ''} onChange={e => setEditingGroup(p => ({...p, schedule: e.target.value}))} placeholder="Program" style={{padding:'8px', borderRadius:'10px', border:'1px solid #e2e8f0', fontSize:'0.8rem'}} />
                          <div style={{display:'flex', gap:'6px'}}>
                            <button onClick={() => handleUpdateGroup(g.id, {teacherId: editingGroup.teacherId, schedule: editingGroup.schedule})} style={{flex:1, padding:'6px', background:'#6366f1', color:'#fff', border:'none', borderRadius:'8px', fontWeight:700, fontSize:'0.75rem', cursor:'pointer'}}>Kaydet</button>
                            <button onClick={() => setEditingGroup(null)} style={{padding:'6px 12px', background:'#f1f5f9', border:'none', borderRadius:'8px', fontWeight:700, fontSize:'0.75rem', cursor:'pointer'}}>İptal</button>
                          </div>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                          <div style={{ display: 'flex', gap: '1rem', fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>
                            <span>👤 {teacher?.name || '—'}</span>
                            {g.schedule && <span>📅 {g.schedule}</span>}
                            <span>👥 {g.studentCount ?? '—'} öğrenci</span>
                          </div>
                          <div style={{display:'flex', gap:'4px'}}>
                            <button onClick={() => setEditingGroup({id: g.id, teacherId: g.teacherId, schedule: g.schedule || ''})} style={{border:'none', background:'#dbeafe', color:'#2563eb', padding:'3px 10px', borderRadius:'6px', fontSize:'0.7rem', fontWeight:800, cursor:'pointer'}}>✎</button>
                            <button onClick={() => handleDeleteGroup(g.id)} style={{border:'none', background:'#fee2e2', color:'#dc2626', padding:'3px 10px', borderRadius:'6px', fontSize:'0.7rem', fontWeight:800, cursor:'pointer'}}>✕</button>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 5: Create Course */}
      {activeTab === 'create-course' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
          <div className="report-card-internal" style={{ padding: '2.5rem' }}>
            <h3 style={{ margin: '0 0 2rem', fontSize: '1.1rem', fontWeight: 900, color: '#0f172a' }}>Yeni Kurs Ekle</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <InputField label="KURS ADI" value={courseForm.course} onChange={v => setCourseForm(f => ({ ...f, course: v }))} placeholder="Python Developer" />
              <InputField label="YAŞ GRUBU" value={courseForm.age} onChange={v => setCourseForm(f => ({ ...f, age: v }))} placeholder="10-11" />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
                <InputField label="DERS SÜRESİ (dk)" value={courseForm.lessonSize} onChange={v => setCourseForm(f => ({ ...f, lessonSize: v }))} type="number" />
                <InputField label="MODÜL SAYISI" value={courseForm.moduleNum} onChange={v => setCourseForm(f => ({ ...f, moduleNum: v }))} type="number" />
                <InputField label="MODÜL DERS SAYISI" value={courseForm.moduleSize} onChange={v => setCourseForm(f => ({ ...f, moduleSize: v }))} type="number" />
              </div>
              {/* Preview badge */}
              {courseForm.course && (
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '4px' }}>
                  <span style={{ fontSize: '10px', fontWeight: 800, color: '#06b6d4', background: '#ecfeff', padding: '4px 10px', borderRadius: '6px' }}>
                    {courseForm.moduleNum || 1} Modül
                  </span>
                  <span style={{ fontSize: '10px', fontWeight: 800, color: '#10b981', background: '#f0fdf4', padding: '4px 10px', borderRadius: '6px' }}>
                    {(courseForm.moduleNum || 1) * (courseForm.moduleSize || 4)} Toplam Ders
                  </span>
                  <span style={{ fontSize: '10px', fontWeight: 800, color: '#f59e0b', background: '#fffbeb', padding: '4px 10px', borderRadius: '6px' }}>
                    {courseForm.lessonSize || 60}dk/ders
                  </span>
                </div>
              )}
              <button className="primary-btn" onClick={handleCreateCourse} style={{ padding: '14px 40px', fontWeight: 800 }}>
                Kurs Oluştur
              </button>
            </div>
          </div>

          {/* Existing Courses */}
          <div className="report-card-internal" style={{ padding: '2rem', maxHeight: '500px', overflowY: 'auto' }}>
            <h3 style={{ margin: '0 0 1.5rem', fontSize: '1rem', fontWeight: 900, color: '#0f172a' }}>Mevcut Kurslar ({courses.length})</h3>
            {courses.length === 0 ? (
              <p style={{ color: '#94a3b8', textAlign: 'center', padding: '2rem' }}>Henüz kurs yok.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {courses.map((c, idx) => {
                  const colors = ['#06b6d4', '#6366f1', '#10b981', '#f59e0b', '#ec4899']
                  const clr = colors[idx % colors.length]
                  const isEditing = editingCourse?.id === c.id
                  return (
                    <div key={c.id} style={{ padding: '14px 18px', borderRadius: '14px', background: '#f8fafc', border: '1px solid #f1f5f9', borderLeft: `4px solid ${clr}` }}>
                      {isEditing ? (
                        <div style={{display:'flex', flexDirection:'column', gap:'6px'}}>
                          <input value={editingCourse.course} onChange={e => setEditingCourse(p => ({...p, course: e.target.value}))} style={{padding:'6px 10px', borderRadius:'8px', border:'1px solid #e2e8f0', fontSize:'0.85rem', fontWeight:700}} />
                          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'4px'}}>
                            <input value={editingCourse.age} onChange={e => setEditingCourse(p => ({...p, age: e.target.value}))} placeholder="Yaş" style={{padding:'6px', borderRadius:'8px', border:'1px solid #e2e8f0', fontSize:'0.75rem'}} />
                            <input type="number" value={editingCourse.moduleNum} onChange={e => setEditingCourse(p => ({...p, moduleNum: e.target.value}))} placeholder="Modül" style={{padding:'6px', borderRadius:'8px', border:'1px solid #e2e8f0', fontSize:'0.75rem'}} />
                            <input type="number" value={editingCourse.lessonSize} onChange={e => setEditingCourse(p => ({...p, lessonSize: e.target.value}))} placeholder="dk" style={{padding:'6px', borderRadius:'8px', border:'1px solid #e2e8f0', fontSize:'0.75rem'}} />
                          </div>
                          <div style={{display:'flex', gap:'6px'}}>
                            <button onClick={() => handleUpdateCourse(c.id, editingCourse)} style={{flex:1, padding:'6px', background:'#06b6d4', color:'#fff', border:'none', borderRadius:'8px', fontWeight:700, fontSize:'0.75rem', cursor:'pointer'}}>Kaydet</button>
                            <button onClick={() => setEditingCourse(null)} style={{padding:'6px 12px', background:'#f1f5f9', border:'none', borderRadius:'8px', fontWeight:700, fontSize:'0.75rem', cursor:'pointer'}}>İptal</button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ fontWeight: 800, fontSize: '0.9rem', color: '#1e293b' }}>{c.course}</div>
                            <div style={{display:'flex', gap:'4px'}}>
                              <button onClick={() => setEditingCourse({id: c.id, course: c.course, age: c.age, lessonSize: c.lessonSize, moduleNum: c.moduleNum, moduleSize: c.moduleSize})} style={{border:'none', background:'#dbeafe', color:'#2563eb', padding:'3px 10px', borderRadius:'6px', fontSize:'0.7rem', fontWeight:800, cursor:'pointer'}}>✎</button>
                              <button onClick={() => handleDeleteCourse(c.id)} style={{border:'none', background:'#fee2e2', color:'#dc2626', padding:'3px 10px', borderRadius:'6px', fontSize:'0.7rem', fontWeight:800, cursor:'pointer'}}>✕</button>
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: '1rem', marginTop: '4px', fontSize: '0.75rem', color: '#64748b', fontWeight: 600, flexWrap: 'wrap' }}>
                            <span>🎂 Yaş: {c.age}</span>
                            <span>📦 {c.moduleNum} Modül × {c.moduleSize} Ders</span>
                            <span>⏱ {c.lessonSize}dk</span>
                          </div>
                        </>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// Shared styles
const labelStyle = { fontSize: '11px', fontWeight: 800, color: '#64748b', display: 'block', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }
const selectStyle = { width: '100%', padding: '12px', borderRadius: '14px', border: '1px solid #e2e8f0', fontSize: '0.9rem', fontWeight: 600, background: '#f8fafc', outline: 'none' }

const InputField = ({ label, value, onChange, placeholder, type = 'text' }) => (
  <div>
    <label style={labelStyle}>{label}</label>
    <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      style={{ width: '100%', padding: '12px', borderRadius: '14px', border: '1px solid #e2e8f0', fontSize: '0.9rem', fontWeight: 600, outline: 'none', background: '#f8fafc', boxSizing: 'border-box' }} />
  </div>
)

export default AdminManagement
