import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Gamepad2, Code, Coffee, Globe, Bot, Joystick, Palette, Brain, Cat, Target, BarChart3, Smartphone, Monitor, BookOpen, Puzzle, Zap, GraduationCap, ClipboardCheck, BookOpenCheck, AlertTriangle, Play, CheckCircle2, Circle, ArrowRight, ChevronRight, Sparkles } from 'lucide-react'
import { apiGet } from '../api'
import { formatLessonLabel } from '../utils/lessonLabel'

// Keyword-based course icon & color matching
const COURSE_ICON_MAP = [
  { keywords: ['roblox'], icon: <Gamepad2 size={28} />, bg: '#f43f5e', gradient: 'linear-gradient(135deg, #f43f5e 0%, #ec4899 100%)', light: '#ffe4e6' },
  { keywords: ['python'], icon: <Code size={28} />, bg: '#6366f1', gradient: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)', light: '#ede9fe' },
  { keywords: ['java'], icon: <Coffee size={28} />, bg: '#f59e0b', gradient: 'linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%)', light: '#fef3c7' },
  { keywords: ['web', 'html', 'css'], icon: <Globe size={28} />, bg: '#06b6d4', gradient: 'linear-gradient(135deg, #06b6d4 0%, #22d3ee 100%)', light: '#cffafe' },
  { keywords: ['robot', 'arduino'], icon: <Bot size={28} />, bg: '#10b981', gradient: 'linear-gradient(135deg, #10b981 0%, #34d399 100%)', light: '#d1fae5' },
  { keywords: ['game', 'oyun'], icon: <Joystick size={28} />, bg: '#8b5cf6', gradient: 'linear-gradient(135deg, #8b5cf6 0%, #a78bfa 100%)', light: '#ede9fe' },
  { keywords: ['design', 'tasar\u0131m'], icon: <Palette size={28} />, bg: '#ec4899', gradient: 'linear-gradient(135deg, #ec4899 0%, #f472b6 100%)', light: '#fce7f3' },
  { keywords: ['ai', 'yapay'], icon: <Brain size={28} />, bg: '#7c3aed', gradient: 'linear-gradient(135deg, #7c3aed 0%, #a78bfa 100%)', light: '#ede9fe' },
  { keywords: ['scratch'], icon: <Cat size={28} />, bg: '#f97316', gradient: 'linear-gradient(135deg, #f97316 0%, #fb923c 100%)', light: '#fff7ed' },
  { keywords: ['unity', '3d'], icon: <Target size={28} />, bg: '#0ea5e9', gradient: 'linear-gradient(135deg, #0ea5e9 0%, #38bdf8 100%)', light: '#e0f2fe' },
  { keywords: ['data', 'veri'], icon: <BarChart3 size={28} />, bg: '#14b8a6', gradient: 'linear-gradient(135deg, #14b8a6 0%, #2dd4bf 100%)', light: '#ccfbf1' },
  { keywords: ['mobile', 'uygulama'], icon: <Smartphone size={28} />, bg: '#a855f7', gradient: 'linear-gradient(135deg, #a855f7 0%, #c084fc 100%)', light: '#f3e8ff' },
]

const FALLBACK_THEMES = [
  { icon: <Monitor size={28} />, bg: '#6366f1', gradient: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)', light: '#ede9fe' },
  { icon: <BookOpen size={28} />, bg: '#10b981', gradient: 'linear-gradient(135deg, #10b981 0%, #34d399 100%)', light: '#d1fae5' },
  { icon: <Puzzle size={28} />, bg: '#f59e0b', gradient: 'linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%)', light: '#fef3c7' },
  { icon: <Zap size={28} />, bg: '#06b6d4', gradient: 'linear-gradient(135deg, #06b6d4 0%, #22d3ee 100%)', light: '#cffafe' },
]

function getCourseTheme(courseName, index) {
  const lower = (courseName || '').toLowerCase()
  const match = COURSE_ICON_MAP.find(entry => entry.keywords.some(kw => lower.includes(kw)))
  if (match) return match
  return FALLBACK_THEMES[index % FALLBACK_THEMES.length]
}

const StudentDashboard = () => {
  const navigate = useNavigate()
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    apiGet('/student/courses')
      .then(data => setGroups(data))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  const goToSurvey = (lesson, group) => {
    navigate('/student/anket', { state: { lessonId: lesson.lessonId, courseName: group.courseName, instructor: group.teacherName, lessonNo: lesson.lessonNo, moduleSize: group.moduleSize } })
  }

  if (loading) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: '400px' }}>
        <div className="premium-loader">
          <div className="loader-ring"></div>
          <p style={{ fontWeight: 700, color: '#64748b', fontSize: '0.9rem' }}>Dersler yükleniyor...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: '400px' }}>
        <div style={{ textAlign: 'center', color: '#f43f5e', animation: 'bounceIn 0.5s ease' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>😵</div>
          <p style={{ fontWeight: 800, fontSize: '1.1rem' }}>{error}</p>
        </div>
      </div>
    )
  }

  if (groups.length === 0) {
    return (
      <div className="dashboard-page" style={{ display: 'grid', placeItems: 'center', minHeight: '400px' }}>
        <div style={{ textAlign: 'center', padding: '3rem', animation: 'bounceIn 0.6s ease' }}>
          <div style={{marginBottom:'1.5rem', animation: 'float 3s ease-in-out infinite'}}><BookOpen size={56} color="#94a3b8" /></div>
          <h3 style={{ fontWeight: 900, color: '#1e293b', fontSize: '1.5rem', marginBottom: '0.5rem' }}>Henüz kayıtlı ders yok</h3>
          <p style={{ color: '#94a3b8', fontSize: '1rem' }}>Bir gruba kaydolduğunda burada görünecek!</p>
        </div>
      </div>
    )
  }

  const totalLessons = groups.reduce((acc, g) => acc + g.lessons.length, 0)
  const completedSurveys = groups.reduce((acc, g) => acc + g.lessons.filter(l => l.hasSurvey).length, 0)

  return (
    <div className="dashboard-page">
      {/* Welcome Banner */}
      <div className="welcome-banner" style={{
        background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #4338ca 100%)',
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
                ÖĞRENCİ PANELİ
              </span>
            </div>
            <h2 style={{ fontSize: '1.8rem', fontWeight: 950, letterSpacing: '-0.03em', margin: '0 0 0.5rem', lineHeight: 1.2 }}>
              Hoş geldin! <span style={{display: 'inline-flex', verticalAlign: 'middle'}}><Sparkles size={24} /></span>
            </h2>
            <p style={{ fontSize: '0.95rem', opacity: 0.6, fontWeight: 500, margin: 0 }}>
              {groups.length} aktif kursun var. Derslerini takip et, anketlerini doldur!
            </p>
          </div>
          <div style={{
            width: '80px', height: '80px', borderRadius: '20px',
            background: 'rgba(99, 102, 241, 0.15)', backdropFilter: 'blur(10px)',
            display: 'grid', placeItems: 'center', fontSize: '2.5rem',
            animation: 'rotateFloat 4s ease-in-out infinite',
            border: '1px solid rgba(99, 102, 241, 0.2)',
          }}>
            <GraduationCap size={36} />
          </div>
        </div>

        {/* Quick Stats Strip */}
        <div style={{
          display: 'flex', gap: '1.5rem', marginTop: '1.5rem',
          paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.1)'
        }}>
          {[
            { label: 'Aktif Kurs', value: groups.length, icon: <BookOpenCheck size={18} /> },
            { label: 'Toplam Ders', value: totalLessons, icon: <Target size={18} /> },
            { label: 'Anket Doldurulan', value: completedSurveys, icon: <ClipboardCheck size={18} /> },
          ].map((item, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              padding: '8px 16px', borderRadius: '14px',
              background: 'rgba(255,255,255,0.08)', backdropFilter: 'blur(4px)',
              animation: `slideInRight 0.4s ease ${0.3 + i * 0.1}s both`,
            }}>
              <span style={{color: 'rgba(255,255,255,0.9)'}}>{item.icon}</span>
              <div>
                <span style={{fontSize: '1.1rem', fontWeight: 900, display: 'block', lineHeight: 1}}>{item.value}</span>
                <span style={{fontSize: '0.6rem', fontWeight: 700, opacity: 0.5, textTransform: 'uppercase', letterSpacing: '0.06em'}}>{item.label}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Course Cards Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: groups.length === 1 ? '1fr' : 'repeat(auto-fill, minmax(420px, 1fr))', gap: '1.5rem' }}>
        {groups.map((group, gIdx) => {
          const theme = getCourseTheme(group.courseName, gIdx)
          return (
            <div key={group.groupId} className="premium-course-card" style={{animationDelay: `${0.15 + gIdx * 0.1}s`}}>
              {/* Course Header */}
              <div className="course-header-gradient" style={{ background: theme.gradient }}>
                <div style={{ position: 'absolute', top: '-5px', right: '20px', opacity: 0.12, animation: 'rotateFloat 6s ease-in-out infinite', color: '#fff' }}>
                  {React.cloneElement(theme.icon, { size: 72 })}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', position: 'relative' }}>
                  <div style={{
                    width: '56px', height: '56px', background: 'rgba(255,255,255,0.2)',
                    borderRadius: '18px', display: 'grid', placeItems: 'center',
                    backdropFilter: 'blur(8px)',
                    border: '1px solid rgba(255,255,255,0.15)',
                    transition: 'transform 0.3s ease',
                    color: '#fff',
                  }}>
                    {theme.icon}
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 900, color: '#fff', letterSpacing: '-0.02em' }}>
                      {group.courseName}
                    </h3>
                    <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: 'rgba(255,255,255,0.75)', fontWeight: 600 }}>
                      {group.teacherName} • {group.age} yaş
                    </p>
                  </div>
                </div>
                {group.schedule && (
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: '6px',
                    marginTop: '14px', padding: '7px 16px', borderRadius: '100px',
                    background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(4px)',
                    fontSize: '0.78rem', fontWeight: 700, color: '#fff',
                    border: '1px solid rgba(255,255,255,0.1)',
                  }}>
                    📅 {group.schedule}
                  </div>
                )}
              </div>

              {/* Lessons */}
              <div style={{ padding: '1.5rem' }}>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    DERSLER
                  </span>
                  <span style={{
                    fontSize: '10px', fontWeight: 800, padding: '3px 10px',
                    borderRadius: '100px', background: theme.light, color: theme.bg,
                  }}>
                    {group.lessons.length}
                  </span>
                  {/* Completion indicator */}
                  <div style={{marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px'}}>
                    <div style={{width: '60px', height: '4px', borderRadius: '10px', background: '#f1f5f9', overflow: 'hidden'}}>
                      <div style={{
                        width: `${(group.lessons.filter(l => l.hasSurvey).length / Math.max(group.lessons.length, 1)) * 100}%`,
                        height: '100%', borderRadius: '10px', background: theme.gradient,
                        transition: 'width 1s ease',
                      }}></div>
                    </div>
                    <span style={{fontSize: '0.6rem', fontWeight: 800, color: '#94a3b8'}}>
                      {group.lessons.filter(l => l.hasSurvey).length}/{group.lessons.length}
                    </span>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '10px' }}>
                  {group.lessons.map((lesson, lIdx) => (
                    <div
                      key={lesson.lessonId}
                      className={`lesson-mini-card ${lesson.hasSurvey ? 'completed' : ''}`}
                      style={{animation: `cardPopIn 0.4s ease ${0.3 + lIdx * 0.06}s both`}}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                        <span style={{ fontSize: '0.95rem', fontWeight: 900, color: '#1e293b' }}>{formatLessonLabel(lesson.lessonNo, group.moduleSize)}</span>
                        <span style={{
                          fontSize: '8px', fontWeight: 800, padding: '3px 8px', borderRadius: '100px',
                          background: lesson.hasSurvey ? '#10b981' : theme.bg, color: '#fff',
                        }}>
                          {lesson.hasSurvey ? '✓ TAMAM' : 'ANKET'}
                        </span>
                      </div>
                      <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 600, display: 'block', marginBottom: '10px' }}>
                        {new Date(lesson.dateTime).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                          className="gradient-action-btn"
                          onClick={() => navigate(`/student/ders-kaydi?id=${lesson.lessonId}`)}
                          style={{ flex: 1, background: 'linear-gradient(135deg, #8b5cf6, #6366f1)' }}
                        ><Play size={13} style={{marginRight: '4px'}} /> Kayıt</button>
                        {!lesson.hasSurvey && (
                          <button
                            className="gradient-action-btn"
                            onClick={() => goToSurvey(lesson, group)}
                            style={{ flex: 1, background: theme.gradient }}
                          ><ClipboardCheck size={13} style={{marginRight: '4px'}} /> Anket</button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default StudentDashboard
