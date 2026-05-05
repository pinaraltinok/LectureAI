import { useState, useEffect } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts'
import { Users, GraduationCap, Star, Hourglass, Target, Trophy, TrendingUp, FileText, BarChart3, AlertTriangle, Activity } from 'lucide-react'
import { apiGet } from '../api'

const AdminSummary = () => {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    apiGet('/admin/stats')
      .then(data => setStats(data))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  // Trend data - only real data from API (no mock data)
  const data = stats?.performanceTrend || []

  if (loading) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: '400px' }}>
        <div className="premium-loader">
          <div className="loader-ring"></div>
          <p style={{ fontWeight: 700, color: '#64748b', fontSize: '0.9rem' }}>Veriler yükleniyor...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: '400px' }}>
        <div style={{ textAlign: 'center', color: '#f43f5e', animation: 'bounceIn 0.5s ease' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}><AlertTriangle size={48} color="#f43f5e" /></div>
          <p style={{ fontWeight: 700 }}>{error}</p>
        </div>
      </div>
    )
  }

  const statCards = [
    { label: 'Eğitmenler', value: stats?.activeTeachers ?? '0', icon: <Users size={22} />, color: '#6366f1', trend: `${stats?.activeTeachers ?? 0} aktif`, gradient: 'linear-gradient(135deg, #6366f1, #8b5cf6)' },
    { label: 'Toplam Öğrenci', value: stats?.totalStudents ?? '0', icon: <GraduationCap size={22} />, color: '#06b6d4', trend: `${stats?.totalLessons ?? 0} ders`, gradient: 'linear-gradient(135deg, #06b6d4, #22d3ee)' },
    { label: 'Kurum Puanı', value: stats?.institutionScore ?? '0', icon: <Star size={22} />, color: '#10b981', trend: 'Final Ortalaması', gradient: 'linear-gradient(135deg, #10b981, #34d399)' },
    { label: 'Bekleyen Analiz', value: stats?.pendingAnalysis ?? '0', icon: <Hourglass size={22} />, color: '#f43f5e', trend: 'İşlem bekliyor', gradient: 'linear-gradient(135deg, #f43f5e, #fb7185)' },
  ]

  // Quality distribution from real API data
  const totalTeachers = stats?.activeTeachers || 0
  const excellent = stats?.qualityDistribution?.excellent ?? 0
  const good = stats?.qualityDistribution?.good ?? 0
  const needsWork = stats?.qualityDistribution?.needsWork ?? 0

  return (
    <div className="dashboard-page">
      {/* Welcome Banner */}
      <div className="welcome-banner" style={{
        background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 40%, #312e81 100%)',
        marginBottom: '2rem',
        backgroundSize: '200% 200%',
        animation: 'cardPopIn 0.6s cubic-bezier(0.22, 1, 0.36, 1) 0.05s both, gradientFlow 8s ease infinite',
      }}>
        <div className="banner-particle"></div>
        <div className="banner-particle"></div>
        <div className="banner-particle"></div>
        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
          <div>
            <div style={{display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px'}}>
              <span style={{fontSize: '0.7rem', fontWeight: 800, padding: '4px 12px', borderRadius: '100px', background: 'rgba(99, 102, 241, 0.3)', color: '#c7d2fe', letterSpacing: '0.08em'}}>
                YÖNETİCİ PANELİ
              </span>
            </div>
            <h2 style={{ fontSize: '1.8rem', fontWeight: 950, letterSpacing: '-0.03em', margin: '0 0 0.5rem', lineHeight: 1.2 }}>
              Kurumsal Performans <span style={{color: '#818cf8'}}>Merkezi</span>
            </h2>
            <p style={{ fontSize: '0.95rem', opacity: 0.6, fontWeight: 500, margin: 0 }}>
              Eğitmen analizleri, kalite metrikleri ve kurum geneli istatistikler
            </p>
          </div>
          <div className="banner-icon-box" style={{
            width: '80px', height: '80px', borderRadius: '20px',
            background: 'rgba(99, 102, 241, 0.15)', backdropFilter: 'blur(10px)',
            display: 'grid', placeItems: 'center', fontSize: '2.5rem',
            animation: 'rotateFloat 4s ease-in-out infinite',
            border: '1px solid rgba(99, 102, 241, 0.2)',
          }}>
            <BarChart3 size={36} />
          </div>
        </div>
      </div>

      {/* 1. Header Stats Grid */}
      <section className="responsive-stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1.25rem', marginBottom: '2rem' }}>
        {statCards.map((s, idx) => (
          <div key={idx} className="premium-stat-card" style={{'--card-color': s.color}}>
            <div style={{position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: s.gradient, borderRadius: '20px 20px 0 0', opacity: 0, transition: 'opacity 0.3s ease'}}
              className="card-top-bar"></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
              <div className="stat-icon-bubble" style={{ background: `${s.color}12`, color: s.color }}>
                {s.icon}
              </div>
              <span className="stat-trend-badge" style={{ color: s.color, background: `${s.color}12` }}>
                {s.trend}
              </span>
            </div>
            <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '6px' }}>
              {s.label}
            </span>
            <span className="stat-number" style={{animationDelay: `${0.3 + idx * 0.1}s`}}>
              {s.value}
            </span>
            <div className="stat-bottom-glow" style={{background: s.color}}></div>
          </div>
        ))}
      </section>

      <div className="responsive-chart-grid" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.5rem' }}>

        {/* 2. Institutional Performance Graph (Recharts AreaChart) */}
        <div className="premium-chart-card" style={{ minHeight: '400px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
            <div>
              <div style={{display: 'flex', alignItems: 'center', gap: '10px'}}>
                <div style={{width: '10px', height: '10px', borderRadius: '50%', background: 'linear-gradient(135deg, #6366f1, #06b6d4)', boxShadow: '0 0 10px rgba(99,102,241,0.4)'}}></div>
                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 900, color: '#1e293b' }}>Eğitmen Performans Trendi</h3>
              </div>
              <p style={{ margin: '6px 0 0 20px', fontSize: '0.82rem', color: '#94a3b8', fontWeight: 500 }}>Kurumsal kalite skoru analitiği</p>
            </div>
            <div style={{
              padding: '6px 14px', borderRadius: '100px',
              background: 'rgba(6,182,212,0.08)', color: '#10b981',
              fontSize: '11px', fontWeight: 800,
              display: 'flex', alignItems: 'center', gap: '6px'
            }}>
              <span style={{width: '6px', height: '6px', borderRadius: '50%', background: '#10b981', display: 'inline-block'}}></span>
              Canlı Veri
            </div>
          </div>

          <div style={{ width: '100%', height: '300px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data}>
                <defs>
                  <linearGradient id="colorSkor" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.25} />
                    <stop offset="50%" stopColor="#6366f1" stopOpacity={0.08} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis
                  dataKey="month"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fontWeight: 700, fill: '#94a3b8' }}
                  dy={10}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fontWeight: 700, fill: '#94a3b8' }}
                  domain={[0, 100]}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: '14px', border: 'none',
                    boxShadow: '0 20px 40px -10px rgba(0,0,0,0.12)',
                    fontSize: '12px', fontWeight: 700,
                    padding: '12px 16px',
                  }}
                  cursor={{ stroke: '#6366f1', strokeWidth: 1, strokeDasharray: '4 4' }}
                />
                <Area
                  type="monotone"
                  dataKey="skor"
                  stroke="#6366f1"
                  strokeWidth={3}
                  fillOpacity={1}
                  fill="url(#colorSkor)"
                  animationDuration={2000}
                  animationEasing="ease-out"
                  dot={{ r: 0 }}
                  activeDot={{ r: 6, strokeWidth: 3, stroke: '#fff', fill: '#6366f1' }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 3. Quality Distribution Side Panel */}
        <div className="quality-panel">
          <div style={{display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '2rem'}}>
            <div style={{width: '36px', height: '36px', borderRadius: '12px', background: '#f0fdf4', display: 'grid', placeItems: 'center'}}>
              <Target size={18} color="#10b981" />
            </div>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 900, color: '#1e293b', margin: 0 }}>Kalite Dağılımı</h3>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
            {[
              { label: 'Mükemmel (90+)', count: excellent, color: '#10b981', emoji: <Trophy size={16} /> },
              { label: 'İyi (75-90)', count: good, color: '#6366f1', emoji: <TrendingUp size={16} /> },
              { label: 'Gelişmeli (50-75)', count: needsWork, color: '#f59e0b', emoji: <FileText size={16} /> }
            ].map((item, i) => (
              <div key={i} style={{animation: `slideInRight 0.4s ease ${0.7 + i * 0.15}s both`}}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', fontSize: '11px', fontWeight: 800, alignItems: 'center' }}>
                  <span style={{ color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{color: item.color}}>{item.emoji}</span>
                    {item.label}
                  </span>
                  <span style={{
                    color: item.color, background: `${item.color}12`,
                    padding: '3px 10px', borderRadius: '100px',
                    fontSize: '10px'
                  }}>
                    {item.count} Eğitmen
                  </span>
                </div>
                <div className="quality-bar">
                  <div className="quality-bar-fill" style={{
                    width: `${(item.count / Math.max(totalTeachers, 1)) * 100}%`,
                    background: `linear-gradient(90deg, ${item.color}, ${item.color}aa)`,
                    animationDelay: `${0.9 + i * 0.2}s`
                  }}></div>
                </div>
              </div>
            ))}
          </div>

          {(stats?.pendingAnalysis || 0) > 0 && (
            <div className="action-alert">
              <div style={{paddingLeft: '12px'}}>
                <div style={{display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px'}}>
                  <AlertTriangle size={18} color="#b91c1c" />
                  <h4 style={{ margin: 0, fontSize: '12px', fontWeight: 900, color: '#b91c1c', letterSpacing: '0.04em' }}>AKSİYON GEREKLİ</h4>
                </div>
                <p style={{ margin: 0, fontSize: '0.85rem', color: '#991b1b', lineHeight: 1.6 }}>
                  {stats.pendingAnalysis} analiz işlemi beklemede. Yönetim panelinden kontrol ediniz.
                </p>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}

export default AdminSummary
