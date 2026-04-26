import { useState, useEffect } from 'react'
import { apiGet } from '../api'

const ProfilePage = () => {
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    apiGet('/auth/me')
      .then(data => setProfile(data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

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
  const initials = profile.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '?'
  const color = roleColors[profile.role] || '#6366f1'

  const fields = [
    { label: 'Ad Soyad', value: profile.name, icon: '👤' },
    { label: 'E-posta', value: profile.email, icon: '✉️' },
    { label: 'Telefon', value: profile.phone || '—', icon: '📱' },
    { label: 'Rol', value: roleLabels[profile.role] || profile.role, icon: '🏷️' },
    { label: 'Kayıt Tarihi', value: profile.createdAt ? new Date(profile.createdAt).toLocaleDateString('tr-TR', { year: 'numeric', month: 'long', day: 'numeric' }) : '—', icon: '📅' },
  ]

  if (profile.role === 'STUDENT') {
    fields.push({ label: 'Yaş', value: profile.age || '—', icon: '🎂' })
    fields.push({ label: 'Veli Adı', value: profile.parent || '—', icon: '👨‍👩‍👦' })
    fields.push({ label: 'Veli Telefonu', value: profile.parentPhone || '—', icon: '📞' })
  }
  if (profile.role === 'TEACHER') {
    fields.push({ label: 'Başlangıç Tarihi', value: profile.startOfDate ? new Date(profile.startOfDate).toLocaleDateString('tr-TR', { year: 'numeric', month: 'long', day: 'numeric' }) : '—', icon: '🗓️' })
  }

  return (
    <div style={{ maxWidth: '700px', margin: '0 auto', animation: 'fadeIn 0.5s ease' }}>
      {/* Profile Header Card */}
      <div className="report-card-internal" style={{
        padding: 0, overflow: 'hidden', borderRadius: '28px',
        boxShadow: '0 25px 50px -12px rgba(0,0,0,0.08)',
      }}>
        {/* Banner */}
        <div style={{
          background: `linear-gradient(135deg, ${color} 0%, ${color}cc 100%)`,
          padding: '3rem 2.5rem 4rem', position: 'relative', textAlign: 'center',
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
            Hesap bilgilerinizi görüntüleyin
          </p>
        </div>

        {/* Avatar overlapping banner */}
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: '-48px', position: 'relative', zIndex: 5 }}>
          <div style={{
            width: '96px', height: '96px', borderRadius: '28px',
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
          <h3 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 900, color: '#0f172a', letterSpacing: '-0.02em' }}>{profile.name}</h3>
          <span style={{
            display: 'inline-block', marginTop: '8px', padding: '4px 16px',
            borderRadius: '100px', fontSize: '11px', fontWeight: 800,
            background: `${color}15`, color: color, border: `1px solid ${color}30`,
          }}>
            {roleLabels[profile.role] || profile.role}
          </span>
        </div>

        {/* Fields */}
        <div style={{ padding: '1.5rem 2.5rem 2.5rem' }}>
          <div style={{ display: 'grid', gap: '1rem' }}>
            {fields.map((f, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: '1rem',
                padding: '1rem 1.25rem', borderRadius: '16px',
                background: '#f8fafc', border: '1px solid #f1f5f9',
                transition: 'all 0.2s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#f5f3ff'; e.currentTarget.style.borderColor = `${color}30`; }}
              onMouseLeave={e => { e.currentTarget.style.background = '#f8fafc'; e.currentTarget.style.borderColor = '#f1f5f9'; }}
              >
                <div style={{
                  width: '40px', height: '40px', borderRadius: '12px',
                  background: `${color}10`, display: 'grid', placeItems: 'center',
                  fontSize: '1.1rem', flexShrink: 0,
                }}>
                  {f.icon}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '2px' }}>{f.label}</div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#1e293b' }}>{f.value}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default ProfilePage
