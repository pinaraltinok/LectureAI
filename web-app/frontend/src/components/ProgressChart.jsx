import { useState, useMemo } from 'react'

/**
 * ProgressChart — Premium SVG line chart for teacher performance over time.
 * Props:
 *   data: [{ date: string|Date, score: number, label?: string }]
 *   title?: string
 *   height?: number
 *   accentColor?: string  (default: '#6366f1')
 */
const ProgressChart = ({ data = [], title = 'Performans İlerlemesi', height = 260, accentColor = '#6366f1' }) => {
  const [hoveredIdx, setHoveredIdx] = useState(null)

  const chartId = useMemo(() => 'chart_' + Math.random().toString(36).slice(2, 8), [])

  // Process & sort data
  const points = useMemo(() => {
    if (!data || data.length === 0) return []
    return data
      .map(d => ({
        date: new Date(d.date),
        score: typeof d.score === 'number' ? d.score : 0,
        label: d.label || '',
      }))
      .sort((a, b) => a.date - b.date)
  }, [data])

  if (points.length === 0) {
    return (
      <div style={{
        background: '#fff', borderRadius: '20px', border: '1px solid #f1f5f9',
        padding: '2.5rem', textAlign: 'center', color: '#94a3b8',
      }}>
        <div style={{fontSize:'2.5rem', marginBottom:'0.75rem', opacity:0.5}}>📊</div>
        <p style={{fontWeight:700, fontSize:'0.95rem', margin:0}}>Henüz yeterli veri yok</p>
        <p style={{fontSize:'0.8rem', margin:'4px 0 0', color:'#cbd5e1'}}>İlerleme grafiği en az 1 rapor sonrası görüntülenebilir.</p>
      </div>
    )
  }

  // Chart dimensions
  const W = 600
  const H = height
  const pad = { top: 30, right: 30, bottom: 45, left: 45 }
  const cW = W - pad.left - pad.right
  const cH = H - pad.top - pad.bottom

  // Scale Y: 0 – 5 (or max score)
  const maxScore = Math.max(5, ...points.map(p => p.score))
  const minScore = 0
  const yScale = (v) => pad.top + cH - ((v - minScore) / (maxScore - minScore)) * cH

  // Scale X: spread evenly if 1 point, use date range otherwise
  const minDate = points[0].date.getTime()
  const maxDate = points.length > 1 ? points[points.length - 1].date.getTime() : minDate + 1
  const xScale = (d) => {
    if (points.length === 1) return pad.left + cW / 2
    return pad.left + ((d.getTime() - minDate) / (maxDate - minDate)) * cW
  }

  // Build SVG path
  const pathPoints = points.map(p => ({ x: xScale(p.date), y: yScale(p.score) }))
  const linePath = pathPoints.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ')
  
  // Area path (for gradient fill)
  const areaPath = linePath + ` L${pathPoints[pathPoints.length-1].x},${pad.top + cH} L${pathPoints[0].x},${pad.top + cH} Z`

  // Grid lines (horizontal)
  const gridLines = [0, 1, 2, 3, 4, 5].filter(v => v <= maxScore)

  // Date labels
  const dateFormatter = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short' })

  // Compute avg
  const avg = points.length > 0 ? (points.reduce((s, p) => s + p.score, 0) / points.length) : 0
  const trend = points.length >= 2 ? points[points.length - 1].score - points[0].score : 0

  return (
    <div style={{
      background: '#fff', borderRadius: '20px', border: '1px solid #f1f5f9',
      boxShadow: '0 4px 20px rgba(0,0,0,0.03)',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '1.25rem 1.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        borderBottom: '1px solid #f1f5f9',
      }}>
        <div>
          <h4 style={{margin: 0, fontSize: '1rem', fontWeight: 900, color: '#0f172a', letterSpacing: '-0.02em'}}>
            📈 {title}
          </h4>
          <p style={{margin: '2px 0 0', fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600}}>
            Lesson tarihlerine göre analiz skorları
          </p>
        </div>
        <div style={{display: 'flex', gap: '10px'}}>
          <div style={{
            padding: '6px 14px', borderRadius: '10px', fontSize: '0.72rem', fontWeight: 800,
            background: '#f5f3ff', color: '#6366f1',
          }}>
            Ort: {avg.toFixed(1)}/5
          </div>
          <div style={{
            padding: '6px 14px', borderRadius: '10px', fontSize: '0.72rem', fontWeight: 800,
            background: trend >= 0 ? '#f0fdf4' : '#fef2f2',
            color: trend >= 0 ? '#15803d' : '#dc2626',
          }}>
            {trend >= 0 ? '↑' : '↓'} {Math.abs(trend).toFixed(1)}
          </div>
          <div style={{
            padding: '6px 14px', borderRadius: '10px', fontSize: '0.72rem', fontWeight: 800,
            background: '#f8fafc', color: '#64748b',
          }}>
            {points.length} ders
          </div>
        </div>
      </div>

      {/* Chart */}
      <div style={{padding: '1rem 1rem 0.5rem', position: 'relative'}}>
        <svg viewBox={`0 0 ${W} ${H}`} style={{width: '100%', height: 'auto', overflow: 'visible'}}>
          <defs>
            <linearGradient id={`${chartId}_grad`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={accentColor} stopOpacity="0.2" />
              <stop offset="100%" stopColor={accentColor} stopOpacity="0.01" />
            </linearGradient>
            <linearGradient id={`${chartId}_line`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={accentColor} />
              <stop offset="100%" stopColor="#a855f7" />
            </linearGradient>
            <filter id={`${chartId}_shadow`}>
              <feDropShadow dx="0" dy="2" stdDeviation="4" floodColor={accentColor} floodOpacity="0.3" />
            </filter>
          </defs>

          {/* Grid lines */}
          {gridLines.map(v => (
            <g key={v}>
              <line
                x1={pad.left} y1={yScale(v)} x2={pad.left + cW} y2={yScale(v)}
                stroke="#f1f5f9" strokeWidth="1"
              />
              <text
                x={pad.left - 10} y={yScale(v) + 4}
                textAnchor="end" fontSize="10" fontWeight="700" fill="#94a3b8"
              >
                {v}
              </text>
            </g>
          ))}

          {/* Area fill */}
          {points.length > 1 && (
            <path d={areaPath} fill={`url(#${chartId}_grad)`}>
              <animate attributeName="opacity" from="0" to="1" dur="0.8s" fill="freeze" />
            </path>
          )}

          {/* Line */}
          <path
            d={linePath}
            fill="none"
            stroke={`url(#${chartId}_line)`}
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            filter={`url(#${chartId}_shadow)`}
          >
            <animate attributeName="stroke-dashoffset" from="2000" to="0" dur="1.2s" fill="freeze" />
            <animate attributeName="stroke-dasharray" values="2000;2000" dur="0.01s" fill="freeze" />
          </path>

          {/* Average line */}
          <line
            x1={pad.left} y1={yScale(avg)} x2={pad.left + cW} y2={yScale(avg)}
            stroke="#94a3b8" strokeWidth="1" strokeDasharray="6 4" opacity="0.5"
          />
          <text
            x={pad.left + cW + 4} y={yScale(avg) + 3}
            fontSize="8" fill="#94a3b8" fontWeight="700"
          >
            ORT
          </text>

          {/* Data points */}
          {pathPoints.map((p, i) => (
            <g key={i}
              onMouseEnter={() => setHoveredIdx(i)}
              onMouseLeave={() => setHoveredIdx(null)}
              style={{cursor: 'pointer'}}
            >
              {/* Larger hit area */}
              <circle cx={p.x} cy={p.y} r="16" fill="transparent" />
              
              {/* Outer ring on hover */}
              {hoveredIdx === i && (
                <circle cx={p.x} cy={p.y} r="12" fill={accentColor} opacity="0.12">
                  <animate attributeName="r" from="6" to="12" dur="0.2s" fill="freeze" />
                </circle>
              )}
              
              {/* Dot */}
              <circle
                cx={p.x} cy={p.y} r={hoveredIdx === i ? 6 : 4.5}
                fill="#fff" stroke={accentColor} strokeWidth="2.5"
                style={{transition: 'r 0.2s ease'}}
              />

              {/* Date label */}
              <text
                x={p.x} y={pad.top + cH + 20}
                textAnchor="middle" fontSize="9" fontWeight="700" fill="#94a3b8"
                transform={points.length > 6 ? `rotate(-30, ${p.x}, ${pad.top + cH + 20})` : ''}
              >
                {dateFormatter.format(points[i].date)}
              </text>

              {/* Score label (always visible) */}
              <text
                x={p.x} y={p.y - 12}
                textAnchor="middle" fontSize="10" fontWeight="900"
                fill={accentColor}
                opacity={hoveredIdx === i ? 1 : 0.7}
              >
                {points[i].score.toFixed(1)}
              </text>

              {/* Tooltip on hover */}
              {hoveredIdx === i && (
                <g>
                  <rect
                    x={p.x - 65} y={p.y - 52} width="130" height="32"
                    rx="8" fill="#1e1b4b" opacity="0.95"
                  />
                  <text x={p.x} y={p.y - 34} textAnchor="middle" fontSize="10" fontWeight="700" fill="#fff">
                    {points[i].date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </text>
                  {points[i].label && (
                    <text x={p.x} y={p.y - 62} textAnchor="middle" fontSize="8" fontWeight="600" fill="#c4b5fd">
                      {points[i].label}
                    </text>
                  )}
                </g>
              )}
            </g>
          ))}
        </svg>
      </div>
    </div>
  )
}

export default ProgressChart
