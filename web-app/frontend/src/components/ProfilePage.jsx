import { useState, useEffect } from 'react'
import { apiGet, apiPut } from '../api'

const ProfilePage = () => {
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    apiGet('/auth/me')
      .then(data => { setProfile(data); setForm(data); })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      const updated = await apiPut('/auth/me', {
        name: form.name,
        phone: form.phone,
        age: form.age,
        parent: form.parent,
        parentPhone: form.parentPhone,
      })
      setProfile(updated)
      setForm(updated)
      setEditing(false)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (err) {
      alert(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    setForm({ ...profile })
    setEditing(false)
  }

  if (loading) return (
    <div style={{display:'grid', placeItems:'center', minHeight:'400px'}}>
      <div style={{textAlign:'center', color:'#64748b'}}>
        <div style={{fontSize:'2rem', marginBottom:'1rem'}}>⏳</div>
        <p style={{fontWeight:700}}>Profil yükleniyor...</p>
      </div>
    </div>
  )

  if (!profile) return null

  const roleLabels = { ADMIN: 'Yönetici', TEACHER: 'Eğitmen', STUDENT: 'Öğrenci' }
  const roleColors = { ADMIN: '#f59e0b', TEACHER: '#6366f1', STUDENT: '#10b981' }
  const initials = (form.name || profile.name)?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '?'
  const color = roleColors[profile.role] || '#6366f1'

  // Editable fields config
  const editableFields = [
    { key: 'name', label: 'Ad Soyad', icon: '👤', editable: true },
    { key: 'email', label: 'E-posta', icon: '✉️', editable: false },
    { key: 'phone', label: 'Telefon', icon: '📱', editable: true, placeholder: '05XX XXX XXXX' },
    { key: 'role', label: 'Rol', icon: '🏷️', editable: false, displayValue: roleLabels[profile.role] || profile.role },
    { key: 'createdAt', label: 'Kayıt Tarihi', icon: '📅', editable: false, displayValue: profile.createdAt ? new Date(profile.createdAt).toLocaleDateString('tr-TR', { year:'numeric', month:'long', day:'numeric' }) : '—' },
  ]

  if (profile.role === 'STUDENT') {
    editableFields.push({ key: 'age', label: 'Yaş', icon: '🎂', editable: true, type: 'number' })
    editableFields.push({ key: 'parent', label: 'Veli Adı', icon: '👨‍👩‍👦', editable: true })
    editableFields.push({ key: 'parentPhone', label: 'Veli Telefonu', icon: '📞', editable: true, placeholder: '05XX XXX XXXX' })
  }
  if (profile.role === 'TEACHER') {
    editableFields.push({ key: 'startOfDate', label: 'Başlangıç Tarihi', icon: '🗓️', editable: false, displayValue: profile.startOfDate ? new Date(profile.startOfDate).toLocaleDateString('tr-TR', { year:'numeric', month:'long', day:'numeric' }) : '—' })
  }

  const inputStyle = {
    width: '100%', padding: '8px 12px', border: '2px solid #e2e8f0', borderRadius: '10px',
    fontSize: '0.9rem', fontWeight: 600, outline: 'none', background: '#fff',
    transition: 'border-color 0.2s',
  }

  return (
    <div style={{ maxWidth: '700px', margin: '0 auto', animation: 'fadeIn 0.5s ease' }}>
      {/* Success Toast */}
      {saved && (
        <div style={{
          position: 'fixed', top: '24px', right: '24px', zIndex: 999,
          padding: '12px 24px', borderRadius: '14px',
          background: '#10b981', color: '#fff', fontWeight: 800, fontSize: '0.9rem',
          boxShadow: '0 8px 24px rgba(16, 185, 129, 0.3)',
          animation: 'fadeIn 0.3s ease',
        }}>
          ✅ Profil güncellendi!
        </div>
      )}

      <div className="report-card-internal" style={{
        padding: 0, overflow: 'hidden', borderRadius: '16px',
        boxShadow: '0 12px 32px -8px rgba(0,0,0,0.08)',
      }}>
        {/* Banner */}
        <div style={{
          background: `linear-gradient(135deg, ${color} 0%, ${color}cc 100%)`,
          padding: '2.5rem 2.5rem 3.5rem', position: 'relative', textAlign: 'center',
        }}>
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0.1,
            backgroundImage: 'radial-gradient(circle at 20% 50%, white 1px, transparent 1px), radial-gradient(circle at 80% 20%, white 1px, transparent 1px)',
            backgroundSize: '60px 60px, 40px 40px',
          }}></div>
          <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 900, color: '#fff', letterSpacing: '-0.02em', position: 'relative' }}>
            Profilim
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: '0.9rem', color: 'rgba(255,255,255,0.8)', fontWeight: 600, position: 'relative' }}>
            {editing ? 'Bilgilerinizi düzenleyin' : 'Hesap bilgilerinizi görüntüleyin'}
          </p>
        </div>

        {/* Avatar */}
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: '-48px', position: 'relative', zIndex: 5 }}>
          <div style={{
            width: '96px', height: '96px', borderRadius: '20px',
            background: `linear-gradient(135deg, ${color}, ${color}cc)`,
            border: '4px solid #fff', display: 'grid', placeItems: 'center',
            color: '#fff', fontSize: '2rem', fontWeight: 900,
            boxShadow: `0 12px 30px -8px ${color}66`,
          }}>
            {initials}
          </div>
        </div>

        {/* Name & Role */}
        <div style={{ textAlign: 'center', padding: '1rem 2rem 0.5rem' }}>
          <h3 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 900, color: '#0f172a', letterSpacing: '-0.02em' }}>
            {form.name || profile.name}
          </h3>
          <span style={{
            display: 'inline-block', marginTop: '8px', padding: '4px 16px',
            borderRadius: '100px', fontSize: '11px', fontWeight: 800,
            background: `${color}15`, color: color, border: `1px solid ${color}30`,
          }}>
            {roleLabels[profile.role] || profile.role}
          </span>
        </div>

        {/* Edit Toggle */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '0.5rem 2.5rem 0' }}>
          {!editing ? (
            <button onClick={() => setEditing(true)} style={{
              background: 'none', border: `1.5px solid ${color}40`, color: color,
              padding: '6px 18px', borderRadius: '100px', fontSize: '0.78rem',
              fontWeight: 800, cursor: 'pointer', transition: 'all 0.2s',
              display: 'flex', alignItems: 'center', gap: '6px',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = `${color}10` }}
            onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
            >
              ✏️ Düzenle
            </button>
          ) : (
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={handleCancel} style={{
                background: '#f1f5f9', border: 'none', color: '#64748b',
                padding: '6px 18px', borderRadius: '100px', fontSize: '0.78rem',
                fontWeight: 800, cursor: 'pointer',
              }}>
                İptal
              </button>
              <button onClick={handleSave} disabled={saving} style={{
                background: color, border: 'none', color: '#fff',
                padding: '6px 20px', borderRadius: '100px', fontSize: '0.78rem',
                fontWeight: 800, cursor: saving ? 'wait' : 'pointer',
                boxShadow: `0 4px 12px ${color}40`,
              }}>
                {saving ? '⏳ Kaydediliyor...' : '💾 Kaydet'}
              </button>
            </div>
          )}
        </div>

        {/* Fields */}
        <div style={{ padding: '1rem 2.5rem 2.5rem' }}>
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            {editableFields.map((f, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: '1rem',
                padding: '0.85rem 1.25rem', borderRadius: '14px',
                background: editing && f.editable ? '#fff' : '#f8fafc',
                border: `1.5px solid ${editing && f.editable ? color + '30' : '#f1f5f9'}`,
                transition: 'all 0.25s',
              }}>
                <div style={{
                  width: '38px', height: '38px', borderRadius: '12px',
                  background: `${color}10`, display: 'grid', placeItems: 'center',
                  fontSize: '1rem', flexShrink: 0,
                }}>
                  {f.icon}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '3px' }}>
                    {f.label}
                  </div>
                  {editing && f.editable ? (
                    <input
                      type={f.type || 'text'}
                      value={form[f.key] || ''}
                      placeholder={f.placeholder || ''}
                      onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                      style={inputStyle}
                      onFocus={e => { e.currentTarget.style.borderColor = color }}
                      onBlur={e => { e.currentTarget.style.borderColor = '#e2e8f0' }}
                    />
                  ) : (
                    <div style={{ fontSize: '0.92rem', fontWeight: 700, color: '#1e293b' }}>
                      {f.displayValue || form[f.key] || '—'}
                    </div>
                  )}
                </div>
                {!editing && f.editable && (
                  <div style={{ fontSize: '0.7rem', color: '#cbd5e1' }}>✏️</div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default ProfilePage
