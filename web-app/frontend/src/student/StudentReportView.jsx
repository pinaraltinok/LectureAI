import React, { useState, useEffect } from 'react'
import { apiGet } from '../api'
import { FileText, Mic, BarChart3, ChevronDown, ChevronUp, Sparkles, AlertTriangle, BookOpen } from 'lucide-react'

/**
 * StudentReportView — Displays the student's voice analysis reports.
 * Data comes from GET /api/student/reports which returns pipeline-generated
 * pedagogical reports (voice biometric match + Gemini LLM analysis).
 */

// Parse markdown tables into structured data for rendering
function parseMarkdownTable(mdText) {
  const lines = mdText.split('\n').filter(l => l.trim().startsWith('|'))
  if (lines.length < 2) return null

  const headers = lines[0].split('|').map(h => h.trim()).filter(Boolean)
  const rows = lines.slice(2).map(row =>
    row.split('|').map(cell => cell.trim()).filter(Boolean)
  ).filter(r => r.length >= headers.length)

  return { headers, rows }
}

// Extract sections from markdown report text
function parseSections(md) {
  if (!md) return { intro: '', dimensions: [], strengths: '', tips: [], closing: '' }

  // Extract intro box
  const introMatch = md.match(/<div class="intro-box">([\s\S]*?)<\/div>/)
  const intro = introMatch ? introMatch[1].replace(/<[^>]*>/g, '').trim() : ''

  // Extract sections by ### headers
  const sectionRegex = /###\s+(.+)\n([\s\S]*?)(?=###|<div class="end-box"|$)/g
  const dimensions = []
  let strengths = ''
  const tips = []
  let match

  while ((match = sectionRegex.exec(md)) !== null) {
    const title = match[1].trim()
    const content = match[2].trim()

    if (title.includes('Güçlü Yön')) {
      strengths = content.replace(/\*\*/g, '')
    } else if (title.includes('Gelişim Öneri')) {
      const tipLines = content.split('\n').filter(l => l.trim().startsWith('-'))
      tipLines.forEach(l => tips.push(l.replace(/^-\s*/, '').replace(/\*\*/g, '')))
    } else {
      const table = parseMarkdownTable(content)
      if (table) {
        dimensions.push({ title, table })
      }
    }
  }

  // Extract closing
  const closingMatch = md.match(/<div class="end-box">([\s\S]*?)<\/div>/)
  const closing = closingMatch ? closingMatch[1].replace(/<[^>]*>/g, '').trim() : ''

  return { intro, dimensions, strengths, tips, closing }
}

function StatusBadge({ status }) {
  const config = {
    '✓ İyi': { bg: '#f0fdf4', color: '#15803d', border: '#bbf7d0' },
    '~ Gelişiyor': { bg: '#fffbeb', color: '#b45309', border: '#fde68a' },
    '↑ Çalışılacak': { bg: '#fef2f2', color: '#b91c1c', border: '#fecaca' },
  }
  const c = config[status] || { bg: '#f1f5f9', color: '#64748b', border: '#e2e8f0' }
  return (
    <span style={{
      display: 'inline-block', padding: '4px 14px', borderRadius: '8px',
      fontSize: '0.78rem', fontWeight: 800, background: c.bg, color: c.color,
      border: `1px solid ${c.border}`, whiteSpace: 'nowrap',
    }}>
      {status}
    </span>
  )
}

function DimensionCard({ dim, index }) {
  const [expanded, setExpanded] = useState(true)
  const icons = [<Mic size={18} />, <BarChart3 size={18} />, <BookOpen size={18} />]

  return (
    <div style={{
      border: '1px solid #e2e8f0', borderRadius: '16px', overflow: 'hidden',
      animation: `cardPopIn 0.5s ease ${0.2 + index * 0.1}s both`,
    }}>
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '1rem 1.25rem', background: '#f8fafc', border: 'none', cursor: 'pointer',
          borderBottom: expanded ? '1px solid #e2e8f0' : 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '36px', height: '36px', borderRadius: '10px', display: 'grid', placeItems: 'center',
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff',
          }}>
            {icons[index] || <FileText size={18} />}
          </div>
          <span style={{ fontSize: '0.9rem', fontWeight: 800, color: '#1e293b' }}>{dim.title}</span>
        </div>
        {expanded ? <ChevronUp size={16} color="#94a3b8" /> : <ChevronDown size={16} color="#94a3b8" />}
      </button>

      {expanded && dim.table && (
        <div style={{ overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr>
                {dim.table.headers.map((h, i) => (
                  <th key={i} style={{
                    padding: '10px 14px', textAlign: 'left', fontWeight: 800, fontSize: '0.72rem',
                    color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em',
                    background: '#f1f5f9', borderBottom: '2px solid #e2e8f0',
                  }}>{h.replace(/\*\*/g, '')}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dim.table.rows.map((row, ri) => (
                <tr key={ri} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  {row.map((cell, ci) => (
                    <td key={ci} style={{
                      padding: '10px 14px', color: ci === 0 ? '#1e293b' : '#475569',
                      fontWeight: ci === 0 ? 700 : 400, lineHeight: 1.5,
                    }}>
                      {['✓ İyi', '~ Gelişiyor', '↑ Çalışılacak'].includes(cell.trim())
                        ? <StatusBadge status={cell.trim()} />
                        : cell.replace(/\*\*/g, '')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

const StudentReportView = () => {
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expandedId, setExpandedId] = useState(null)

  useEffect(() => {
    apiGet('/student/reports')
      .then(data => {
        setReports(data)
        if (data.length > 0) setExpandedId(data[0].id)
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: '400px' }}>
        <div className="premium-loader">
          <div className="loader-ring"></div>
          <p style={{ fontWeight: 700, color: '#64748b', fontSize: '0.9rem' }}>Raporlar yükleniyor...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: '400px' }}>
        <div style={{ textAlign: 'center', color: '#f43f5e' }}>
          <AlertTriangle size={48} style={{ marginBottom: '1rem' }} />
          <p style={{ fontWeight: 800, fontSize: '1.1rem' }}>{error}</p>
        </div>
      </div>
    )
  }

  if (reports.length === 0) {
    return (
      <div className="dashboard-page" style={{ display: 'grid', placeItems: 'center', minHeight: '400px' }}>
        <div style={{ textAlign: 'center', padding: '3rem', animation: 'bounceIn 0.6s ease' }}>
          <div style={{ marginBottom: '1.5rem', animation: 'float 3s ease-in-out infinite' }}>
            <FileText size={56} color="#94a3b8" />
          </div>
          <h3 style={{ fontWeight: 900, color: '#1e293b', fontSize: '1.5rem', marginBottom: '0.5rem' }}>
            Henüz rapor yok
          </h3>
          <p style={{ color: '#94a3b8', fontSize: '1rem' }}>
            Ses analiziniz tamamlandığında raporunuz burada görünecek!
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="dashboard-page">
      {/* Header Banner */}
      <div className="welcome-banner" style={{
        background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #4338ca 100%)',
        marginBottom: '2rem',
        animation: 'cardPopIn 0.5s cubic-bezier(0.22, 1, 0.36, 1) both',
      }}>
        <div className="banner-particle"></div>
        <div className="banner-particle"></div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
              <span style={{
                fontSize: '0.7rem', fontWeight: 800, padding: '4px 12px', borderRadius: '100px',
                background: 'rgba(139, 92, 246, 0.3)', color: '#c7d2fe', letterSpacing: '0.08em',
              }}>
                SES ANALİZ RAPORLARI
              </span>
            </div>
            <h2 style={{ fontSize: '1.8rem', fontWeight: 950, letterSpacing: '-0.03em', margin: '0 0 0.5rem' }}>
              Ders Performansım <Sparkles size={24} style={{ display: 'inline', verticalAlign: 'middle' }} />
            </h2>
            <p style={{ fontSize: '0.95rem', opacity: 0.6, fontWeight: 500, margin: 0 }}>
              {reports.length} rapor mevcut
            </p>
          </div>
          <div style={{
            width: '80px', height: '80px', borderRadius: '20px',
            background: 'rgba(139, 92, 246, 0.15)', backdropFilter: 'blur(10px)',
            display: 'grid', placeItems: 'center',
            animation: 'rotateFloat 4s ease-in-out infinite',
            border: '1px solid rgba(139, 92, 246, 0.2)',
          }}>
            <Mic size={36} />
          </div>
        </div>
      </div>

      {/* Report Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {reports.map((report, idx) => {
          const isExpanded = expandedId === report.id
          const sections = report.reportMarkdown ? parseSections(report.reportMarkdown) : null

          return (
            <div key={report.id} style={{
              background: '#fff', borderRadius: '20px', overflow: 'hidden',
              border: '1px solid #e2e8f0', boxShadow: '0 4px 20px rgba(0,0,0,0.04)',
              animation: `cardPopIn 0.5s ease ${0.1 + idx * 0.1}s both`,
            }}>
              {/* Report Header */}
              <button
                onClick={() => setExpandedId(isExpanded ? null : report.id)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '1.25rem 1.5rem', background: isExpanded
                    ? 'linear-gradient(135deg, #0f172a 0%, #334155 100%)'
                    : '#fff',
                  border: 'none', cursor: 'pointer', color: isExpanded ? '#fff' : '#1e293b',
                  borderBottom: '1px solid #e2e8f0', transition: 'all 0.3s ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <div style={{
                    width: '44px', height: '44px', borderRadius: '14px', display: 'grid', placeItems: 'center',
                    background: isExpanded ? 'rgba(99,102,241,0.2)' : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                    color: '#fff', fontSize: '1.1rem', fontWeight: 900,
                  }}>
                    <FileText size={20} />
                  </div>
                  <div style={{ textAlign: 'left' }}>
                    <div style={{ fontWeight: 800, fontSize: '1rem' }}>
                      {report.courseName || 'Ders Raporu'} — Ders {report.lessonNo || '?'}
                    </div>
                    <div style={{
                      fontSize: '0.78rem', fontWeight: 600, marginTop: '2px',
                      opacity: isExpanded ? 0.7 : 0.5,
                    }}>
                      {report.teacherName || ''} • {new Date(report.createdAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}
                      {report.biometricScore ? ` • Ses Eşleşme: %${Math.round(report.biometricScore * 100)}` : ''}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{
                    fontSize: '0.7rem', fontWeight: 800, padding: '4px 12px', borderRadius: '100px',
                    background: report.status === 'FINALIZED' ? '#10b981' : '#6366f1',
                    color: '#fff',
                  }}>
                    {report.status === 'FINALIZED' ? 'ONAYLANDI' : 'HAZIR'}
                  </span>
                  {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </div>
              </button>

              {/* Report Body */}
              {isExpanded && sections && (
                <div style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                  {/* Intro */}
                  {sections.intro && (
                    <div style={{
                      padding: '1.25rem 1.5rem', borderRadius: '14px',
                      background: 'linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%)',
                      borderLeft: '4px solid #7c3aed', fontSize: '0.9rem',
                      color: '#4c1d95', lineHeight: 1.7, fontWeight: 500,
                    }}>
                      {sections.intro}
                    </div>
                  )}

                  {/* Metric Dimensions */}
                  {sections.dimensions.map((dim, di) => (
                    <DimensionCard key={di} dim={dim} index={di} />
                  ))}

                  {/* Strengths */}
                  {sections.strengths && (
                    <div style={{
                      padding: '1.25rem 1.5rem', borderRadius: '14px',
                      background: '#f0fdf4', border: '1px solid #bbf7d0',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                        <Sparkles size={16} color="#15803d" />
                        <span style={{ fontWeight: 800, color: '#15803d', fontSize: '0.85rem' }}>Öne Çıkan Güçlü Yönler</span>
                      </div>
                      <p style={{ margin: 0, fontSize: '0.88rem', color: '#166534', lineHeight: 1.7 }}>
                        {sections.strengths}
                      </p>
                    </div>
                  )}

                  {/* Tips */}
                  {sections.tips.length > 0 && (
                    <div style={{
                      padding: '1.25rem 1.5rem', borderRadius: '14px',
                      background: '#fffbeb', border: '1px solid #fde68a',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                        <BarChart3 size={16} color="#b45309" />
                        <span style={{ fontWeight: 800, color: '#b45309', fontSize: '0.85rem' }}>Gelişim Önerileri</span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {sections.tips.map((tip, ti) => (
                          <div key={ti} style={{
                            display: 'flex', gap: '10px', alignItems: 'flex-start',
                            fontSize: '0.85rem', color: '#92400e', lineHeight: 1.6,
                          }}>
                            <span style={{
                              width: '22px', height: '22px', borderRadius: '50%', flexShrink: 0,
                              background: '#fbbf24', color: '#fff', display: 'grid', placeItems: 'center',
                              fontSize: '0.7rem', fontWeight: 900, marginTop: '2px',
                            }}>{ti + 1}</span>
                            <span>{tip}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Closing */}
                  {sections.closing && (
                    <div style={{
                      padding: '1.25rem 1.5rem', borderRadius: '14px',
                      background: 'linear-gradient(135deg, #f0fdf4, #dcfce7)',
                      borderLeft: '4px solid #22c55e', fontStyle: 'italic',
                      fontSize: '0.88rem', color: '#166534', lineHeight: 1.7,
                    }}>
                      {sections.closing}
                    </div>
                  )}
                </div>
              )}

              {/* Fallback: No parsed markdown */}
              {isExpanded && !sections && (
                <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>
                  <FileText size={32} style={{ marginBottom: '0.5rem', opacity: 0.5 }} />
                  <p style={{ fontWeight: 700, fontSize: '0.9rem' }}>
                    Rapor içeriği henüz oluşturulmamış.
                  </p>
                  <p style={{ fontSize: '0.8rem' }}>
                    Analiz tamamlandığında detaylı rapor burada görünecektir.
                  </p>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default StudentReportView
