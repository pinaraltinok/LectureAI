import { useState, useEffect } from 'react'
import { apiGet } from '../api'
import { FileText, ChevronDown, ChevronUp, Mic, BarChart3, BookOpen, Sparkles, Users } from 'lucide-react'

/* ── Reusable markdown parsing (same logic as StudentReportView) ── */
function parseMarkdownTable(mdText) {
  const lines = mdText.split('\n').filter(l => l.trim().startsWith('|'))
  if (lines.length < 2) return null
  const headers = lines[0].split('|').map(h => h.trim()).filter(Boolean)
  const rows = lines.slice(2).map(row => row.split('|').map(cell => cell.trim()).filter(Boolean)).filter(r => r.length >= headers.length)
  return { headers, rows }
}

function parseSections(md) {
  if (!md) return null
  const introMatch = md.match(/<div class="intro-box">([\s\S]*?)<\/div>/)
  const intro = introMatch ? introMatch[1].replace(/<[^>]*>/g, '').trim() : ''
  const sectionRegex = /###\s+(.+)\n([\s\S]*?)(?=###|<div class="end-box"|$)/g
  const dimensions = []; let strengths = ''; const tips = []; let match
  while ((match = sectionRegex.exec(md)) !== null) {
    const title = match[1].trim(); const content = match[2].trim()
    if (title.includes('Güçlü Yön')) { strengths = content.replace(/\*\*/g, '') }
    else if (title.includes('Gelişim Öneri')) { content.split('\n').filter(l => l.trim().startsWith('-')).forEach(l => tips.push(l.replace(/^-\s*/, '').replace(/\*\*/g, ''))) }
    else { const table = parseMarkdownTable(content); if (table) dimensions.push({ title, table }) }
  }
  const closingMatch = md.match(/<div class="end-box">([\s\S]*?)<\/div>/)
  const closing = closingMatch ? closingMatch[1].replace(/<[^>]*>/g, '').trim() : ''
  return { intro, dimensions, strengths, tips, closing }
}

function StatusBadge({ status }) {
  const config = { '✓ İyi': { bg: '#f0fdf4', color: '#15803d', border: '#bbf7d0' }, '~ Gelişiyor': { bg: '#fffbeb', color: '#b45309', border: '#fde68a' }, '↑ Çalışılacak': { bg: '#fef2f2', color: '#b91c1c', border: '#fecaca' } }
  const c = config[status] || { bg: '#f1f5f9', color: '#64748b', border: '#e2e8f0' }
  return <span style={{ display: 'inline-block', padding: '4px 14px', borderRadius: '8px', fontSize: '0.78rem', fontWeight: 800, background: c.bg, color: c.color, border: `1px solid ${c.border}`, whiteSpace: 'nowrap' }}>{status}</span>
}

/* ── Report body renderer ── */
function ReportBody({ sections }) {
  if (!sections) return <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}><FileText size={32} style={{ marginBottom: '0.5rem', opacity: 0.5 }} /><p style={{ fontWeight: 700, fontSize: '0.9rem' }}>Rapor içeriği henüz oluşturulmamış.</p></div>
  const icons = [<Mic size={18} />, <BarChart3 size={18} />, <BookOpen size={18} />]
  return (
    <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {sections.intro && <div style={{ padding: '1rem 1.25rem', borderRadius: '14px', background: 'linear-gradient(135deg, #f5f3ff, #ede9fe)', borderLeft: '4px solid #7c3aed', fontSize: '0.88rem', color: '#4c1d95', lineHeight: 1.7 }}>{sections.intro}</div>}
      {sections.dimensions.map((dim, di) => (
        <div key={di} style={{ border: '1px solid #e2e8f0', borderRadius: '14px', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '0.75rem 1rem', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', display: 'grid', placeItems: 'center', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff' }}>{icons[di] || <FileText size={16} />}</div>
            <span style={{ fontSize: '0.88rem', fontWeight: 800, color: '#1e293b' }}>{dim.title}</span>
          </div>
          {dim.table && (
            <div style={{ overflow: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem' }}>
                <thead><tr>{dim.table.headers.map((h, i) => <th key={i} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 800, fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', background: '#f1f5f9', borderBottom: '2px solid #e2e8f0' }}>{h.replace(/\*\*/g, '')}</th>)}</tr></thead>
                <tbody>{dim.table.rows.map((row, ri) => <tr key={ri} style={{ borderBottom: '1px solid #f1f5f9' }}>{row.map((cell, ci) => <td key={ci} style={{ padding: '8px 12px', color: ci === 0 ? '#1e293b' : '#475569', fontWeight: ci === 0 ? 700 : 400, lineHeight: 1.5 }}>{['✓ İyi', '~ Gelişiyor', '↑ Çalışılacak'].includes(cell.trim()) ? <StatusBadge status={cell.trim()} /> : cell.replace(/\*\*/g, '')}</td>)}</tr>)}</tbody>
              </table>
            </div>
          )}
        </div>
      ))}
      {sections.strengths && (
        <div style={{ padding: '1rem 1.25rem', borderRadius: '14px', background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}><Sparkles size={16} color="#15803d" /><span style={{ fontWeight: 800, color: '#15803d', fontSize: '0.85rem' }}>Öne Çıkan Güçlü Yönler</span></div>
          <p style={{ margin: 0, fontSize: '0.86rem', color: '#166534', lineHeight: 1.7 }}>{sections.strengths}</p>
        </div>
      )}
      {sections.tips.length > 0 && (
        <div style={{ padding: '1rem 1.25rem', borderRadius: '14px', background: '#fffbeb', border: '1px solid #fde68a' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}><BarChart3 size={16} color="#b45309" /><span style={{ fontWeight: 800, color: '#b45309', fontSize: '0.85rem' }}>Gelişim Önerileri</span></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {sections.tips.map((tip, ti) => (
              <div key={ti} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', fontSize: '0.83rem', color: '#92400e', lineHeight: 1.6 }}>
                <span style={{ width: '20px', height: '20px', borderRadius: '50%', flexShrink: 0, background: '#fbbf24', color: '#fff', display: 'grid', placeItems: 'center', fontSize: '0.65rem', fontWeight: 900, marginTop: '2px' }}>{ti + 1}</span>
                <span>{tip}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {sections.closing && <div style={{ padding: '1rem 1.25rem', borderRadius: '14px', background: 'linear-gradient(135deg, #f0fdf4, #dcfce7)', borderLeft: '4px solid #22c55e', fontStyle: 'italic', fontSize: '0.86rem', color: '#166534', lineHeight: 1.7 }}>{sections.closing}</div>}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════ */
const AdminStudentReports = () => {
  const [groups, setGroups] = useState([])
  const [selectedGroupId, setSelectedGroupId] = useState('')
  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingReports, setLoadingReports] = useState(false)
  const [expandedStudent, setExpandedStudent] = useState(null)
  const [expandedReport, setExpandedReport] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    apiGet('/admin/groups')
      .then(g => { setGroups(g); if (g.length > 0) setSelectedGroupId(g[0].id) })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!selectedGroupId) { setStudents([]); return }
    setLoadingReports(true); setError(''); setExpandedStudent(null); setExpandedReport(null)
    apiGet(`/admin/group/${selectedGroupId}/student-reports`)
      .then(data => setStudents(data))
      .catch(err => setError(err.message))
      .finally(() => setLoadingReports(false))
  }, [selectedGroupId])

  const selectedGroup = groups.find(g => g.id === selectedGroupId)
  const studentsWithReports = students.filter(s => s.reportCount > 0)
  const totalReports = students.reduce((sum, s) => sum + s.reportCount, 0)

  if (loading) return (
    <div style={{ display: 'grid', placeItems: 'center', minHeight: '400px' }}>
      <div style={{ textAlign: 'center', color: '#64748b' }}><div style={{ fontSize: '2rem', marginBottom: '1rem' }}>⏳</div><p style={{ fontWeight: 700 }}>Yükleniyor...</p></div>
    </div>
  )

  return (
    <div style={{ animation: 'fadeIn 0.5s ease' }}>
      {/* Header */}
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.8rem', fontWeight: 950, color: '#0f172a', letterSpacing: '-0.02em', margin: '0 0 4px' }}>Öğrenci Ses Raporları</h1>
        <p style={{ color: '#64748b', fontSize: '1rem', margin: 0 }}>Grup seçerek öğrencilerin ses analiz raporlarını inceleyin.</p>
      </div>

      {/* Group Selector */}
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 300px', maxWidth: '500px' }}>
          <label style={{ fontSize: '11px', fontWeight: 800, color: '#64748b', display: 'block', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>GRUP SEÇİMİ</label>
          <select
            value={selectedGroupId}
            onChange={e => setSelectedGroupId(e.target.value)}
            style={{ width: '100%', padding: '0.9rem 1.1rem', borderRadius: '14px', border: '1px solid #e2e8f0', fontWeight: 700, outline: 'none', background: '#fff', fontSize: '0.9rem' }}
          >
            {groups.length === 0 && <option value="">— Grup bulunamadı —</option>}
            {groups.map(g => (
              <option key={g.id} value={g.id}>
                {g.name ? `${g.name} • ` : ''}{g.courseName} — {g.teacherName || '?'} {g.schedule ? `(${g.schedule})` : ''} — {g.studentCount ?? 0} öğrenci
              </option>
            ))}
          </select>
        </div>

        {/* Quick Stats */}
        {selectedGroupId && !loadingReports && (
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#6366f1', background: '#f5f3ff', padding: '8px 16px', borderRadius: '10px', border: '1px solid #ddd6fe' }}>
              👥 {students.length} öğrenci
            </span>
            <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#10b981', background: '#f0fdf4', padding: '8px 16px', borderRadius: '10px', border: '1px solid #bbf7d0' }}>
              📊 {totalReports} rapor
            </span>
            <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#f59e0b', background: '#fffbeb', padding: '8px 16px', borderRadius: '10px', border: '1px solid #fde68a' }}>
              ✓ {studentsWithReports.length} öğrencinin raporu var
            </span>
          </div>
        )}
      </div>

      {error && <div style={{ color: '#f43f5e', background: '#ffe4e6', padding: '0.75rem 1.5rem', borderRadius: '12px', fontSize: '0.9rem', marginBottom: '1.5rem', fontWeight: 700 }}>⚠ {error}</div>}

      {/* Loading state */}
      {loadingReports && (
        <div style={{ display: 'grid', placeItems: 'center', minHeight: '200px' }}>
          <div style={{ textAlign: 'center', color: '#64748b' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '50%', border: '3px solid #f1f5f9', borderTopColor: '#6366f1', animation: 'spin 0.8s linear infinite', margin: '0 auto 1rem' }}></div>
            <p style={{ fontWeight: 700, fontSize: '0.9rem' }}>Raporlar yükleniyor...</p>
          </div>
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        </div>
      )}

      {/* Student list */}
      {!loadingReports && students.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {students.map((student, idx) => {
            const isExpanded = expandedStudent === student.studentId
            return (
              <div key={student.studentId} style={{
                background: '#fff', borderRadius: '16px', overflow: 'hidden',
                border: '1px solid #e2e8f0', boxShadow: '0 2px 10px rgba(0,0,0,0.03)',
                animation: `fadeIn 0.3s ease ${idx * 0.05}s both`,
              }}>
                {/* Student header */}
                <button
                  onClick={() => { setExpandedStudent(isExpanded ? null : student.studentId); setExpandedReport(null) }}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '1rem 1.5rem', background: isExpanded ? 'linear-gradient(135deg, #1e1b4b, #312e81)' : '#fff',
                    border: 'none', cursor: 'pointer', color: isExpanded ? '#fff' : '#1e293b',
                    borderBottom: isExpanded ? 'none' : '1px solid transparent', transition: 'all 0.3s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div style={{
                      width: '44px', height: '44px', borderRadius: '14px', display: 'grid', placeItems: 'center',
                      background: isExpanded ? 'rgba(99,102,241,0.2)' : 'linear-gradient(135deg, #10b981, #06b6d4)',
                      color: '#fff', fontSize: '0.85rem', fontWeight: 900,
                    }}>
                      {student.studentName?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '?'}
                    </div>
                    <div style={{ textAlign: 'left' }}>
                      <div style={{ fontWeight: 800, fontSize: '0.95rem' }}>{student.studentName}</div>
                      <div style={{ fontSize: '0.75rem', fontWeight: 600, marginTop: '2px', opacity: 0.6 }}>{student.studentEmail}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{
                      fontSize: '0.7rem', fontWeight: 800, padding: '4px 12px', borderRadius: '100px',
                      background: student.reportCount > 0 ? (isExpanded ? 'rgba(16,185,129,0.3)' : '#10b981') : (isExpanded ? 'rgba(148,163,184,0.3)' : '#94a3b8'),
                      color: '#fff',
                    }}>
                      {student.reportCount} rapor
                    </span>
                    {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                  </div>
                </button>

                {/* Expanded: student's reports */}
                {isExpanded && (
                  <div style={{ padding: '1rem 1.5rem 1.5rem', background: '#fafbfc' }}>
                    {student.reports.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8' }}>
                        <Mic size={32} style={{ marginBottom: '0.5rem', opacity: 0.5 }} />
                        <p style={{ fontWeight: 700 }}>Bu öğrencinin henüz ses analiz raporu bulunmuyor.</p>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        {student.reports.map(report => {
                          const isReportExpanded = expandedReport === report.id
                          const sections = report.reportMarkdown ? parseSections(report.reportMarkdown) : null
                          const statusColors = { FINALIZED: '#10b981', DRAFT: '#6366f1', PROCESSING: '#f59e0b' }
                          const statusLabels = { FINALIZED: 'ONAYLANDI', DRAFT: 'HAZIR', PROCESSING: 'İŞLENİYOR' }

                          return (
                            <div key={report.id} style={{ border: '1px solid #e2e8f0', borderRadius: '14px', overflow: 'hidden', background: '#fff' }}>
                              <button
                                onClick={() => setExpandedReport(isReportExpanded ? null : report.id)}
                                style={{
                                  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                  padding: '0.85rem 1.25rem', background: isReportExpanded ? '#f8fafc' : '#fff',
                                  border: 'none', cursor: 'pointer', borderBottom: isReportExpanded ? '1px solid #e2e8f0' : 'none',
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                  <FileText size={16} color="#6366f1" />
                                  <span style={{ fontWeight: 700, fontSize: '0.85rem', color: '#1e293b' }}>
                                    {report.courseName || 'Ders'} — Ders {report.lessonNo || '?'}
                                  </span>
                                  <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 600 }}>
                                    {new Date(report.createdAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' })}
                                  </span>
                                  {report.biometricScore && <span style={{ fontSize: '0.68rem', fontWeight: 800, color: '#6366f1', background: '#ede9fe', padding: '2px 8px', borderRadius: '6px' }}>Ses: %{Math.round(report.biometricScore * 100)}</span>}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <span style={{ fontSize: '0.65rem', fontWeight: 800, padding: '3px 10px', borderRadius: '100px', background: statusColors[report.status] || '#94a3b8', color: '#fff' }}>
                                    {statusLabels[report.status] || report.status}
                                  </span>
                                  {isReportExpanded ? <ChevronUp size={14} color="#94a3b8" /> : <ChevronDown size={14} color="#94a3b8" />}
                                </div>
                              </button>
                              {isReportExpanded && <ReportBody sections={sections} />}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Empty state */}
      {!loadingReports && students.length === 0 && selectedGroupId && (
        <div style={{ textAlign: 'center', padding: '3rem', background: '#fff', borderRadius: '20px', border: '1px solid #e2e8f0' }}>
          <Users size={48} color="#cbd5e1" style={{ marginBottom: '1rem' }} />
          <p style={{ fontWeight: 800, color: '#94a3b8', fontSize: '1rem' }}>Bu grupta henüz öğrenci bulunmuyor.</p>
        </div>
      )}
    </div>
  )
}

export default AdminStudentReports
