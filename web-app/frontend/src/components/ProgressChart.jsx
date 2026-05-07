import { useState, useMemo } from 'react'

/**
 * ProgressChart — Premium SVG line chart for teacher performance over time.
 * Props:
 *   data: [{ date: string|Date, score: number, label?: string }]
 *   title?: string
 *   height?: number
 *   accentColor?: string  (default: '#6366f1')
 */
const ProgressChart = ({ data = [], title = 'Performans İlerlemesi', height = 300, accentColor = '#6366f1' }) => {
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

  // Chart dimensions — more generous padding for labels
  const W = 700
  const H = height
  const pad = { top: 40, right: 40, bottom: 60, left: 55 }
  const cW = W - pad.left - pad.right
  const cH = H - pad.top - pad.bottom

  // Scale Y: always 0 – 5
  const maxScore = 5
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

  // Smooth curved line using catmull-rom to bezier conversion
  const buildSmoothPath = (pts) => {
    if (pts.length === 1) return `M${pts[0].x},${pts[0].y}`
    if (pts.length === 2) return `M${pts[0].x},${pts[0].y} L${pts[1].x},${pts[1].y}`
    
    let d = `M${pts[0].x},${pts[0].y}`
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)]
      const p1 = pts[i]
      const p2 = pts[i + 1]
      const p3 = pts[Math.min(pts.length - 1, i + 2)]
      
      const cp1x = p1.x + (p2.x - p0.x) / 6
      const cp1y = p1.y + (p2.y - p0.y) / 6
      const cp2x = p2.x - (p3.x - p1.x) / 6
      const cp2y = p2.y - (p3.y - p1.y) / 6
      
      d += ` C${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`
    }
    return d
  }

  const linePath = buildSmoothPath(pathPoints)
  
  // Area path (for gradient fill)
  const areaPath = linePath + ` L${pathPoints[pathPoints.length-1].x},${pad.top + cH} L${pathPoints[0].x},${pad.top + cH} Z`

  // Grid lines (horizontal) — 0 to 5
  const gridLines = [0, 1, 2, 3, 4, 5]

  // Date labels — limit to max 8 to avoid overlap
  const maxLabels = 8
  const labelStep = Math.max(1, Math.ceil(points.length / maxLabels))

  // Date formatter
  const dateFormatter = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short' })

  // Compute avg
  const avg = points.length > 0 ? (points.reduce((s, p) => s + p.score, 0) / points.length) : 0
  const trend = points.length >= 2 ? points[points.length - 1].score - points[0].score : 0
  const lastScore = points[points.length - 1].score

  // Color coding for score
  const scoreColor = (score) => {
    if (score >= 4) return '#10b981'
    if (score >= 3) return '#f59e0b'
    return '#f43f5e'
  }

  return (
    <div style={{
      background: '#fff', borderRadius: '20px', border: '1px solid #f1f5f9',
      boxShadow: '0 4px 20px rgba(0,0,0,0.03)',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '1.25rem 1.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        borderBottom: '1px solid #f1f5f9', flexWrap: 'wrap', gap: '10px',
      }}>
        <div>
          <h4 style={{margin: 0, fontSize: '1rem', fontWeight: 900, color: '#0f172a', letterSpacing: '-0.02em'}}>
            📈 {title}
          </h4>
          <p style={{margin: '2px 0 0', fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600}}>
            Ders tarihlerine göre analiz skorları
          </p>
        </div>
        <div style={{display: 'flex', gap: '10px', flexWrap: 'wrap'}}>
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
            background: scoreColor(lastScore) + '15', color: scoreColor(lastScore),
            border: `1px solid ${scoreColor(lastScore)}30`,
          }}>
            Son: {lastScore.toFixed(1)}
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
      <div style={{padding: '1rem 0.5rem 0.5rem', position: 'relative'}}>
        <svg viewBox={`0 0 ${W} ${H}`} style={{width: '100%', height: 'auto', display: 'block'}}>
          <defs>
            <linearGradient id={`${chartId}_grad`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={accentColor} stopOpacity="0.18" />
              <stop offset="100%" stopColor={accentColor} stopOpacity="0.02" />
            </linearGradient>
            <linearGradient id={`${chartId}_line`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={accentColor} />
              <stop offset="50%" stopColor="#8b5cf6" />
              <stop offset="100%" stopColor="#a855f7" />
            </linearGradient>
            <filter id={`${chartId}_shadow`}>
              <feDropShadow dx="0" dy="3" stdDeviation="5" floodColor={accentColor} floodOpacity="0.25" />
            </filter>
            <filter id={`${chartId}_glow`}>
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Background bands for score zones */}
          <rect x={pad.left} y={yScale(5)} width={cW} height={yScale(4) - yScale(5)} fill="#10b98108" />
          <rect x={pad.left} y={yScale(4)} width={cW} height={yScale(3) - yScale(4)} fill="#f59e0b06" />
          <rect x={pad.left} y={yScale(3)} width={cW} height={yScale(0) - yScale(3)} fill="#f43f5e04" />

          {/* Grid lines */}
          {gridLines.map(v => (
            <g key={v}>
              <line
                x1={pad.left} y1={yScale(v)} x2={pad.left + cW} y2={yScale(v)}
                stroke="#e2e8f0" strokeWidth="1" strokeDasharray={v === 0 ? "none" : "4 4"}
              />
              <text
                x={pad.left - 12} y={yScale(v) + 4}
                textAnchor="end" fontSize="11" fontWeight="700" fill="#94a3b8"
                fontFamily="system-ui, -apple-system, sans-serif"
              >
                {v}
              </text>
            </g>
          ))}

          {/* Y axis label */}
          <text
            x={14} y={pad.top + cH / 2}
            textAnchor="middle" fontSize="9" fontWeight="800" fill="#cbd5e1"
            transform={`rotate(-90, 14, ${pad.top + cH / 2})`}
            fontFamily="system-ui, -apple-system, sans-serif"
            letterSpacing="0.1em"
          >
            SKOR
          </text>

          {/* Area fill */}
          <path d={areaPath} fill={`url(#${chartId}_grad)`}>
            <animate attributeName="opacity" from="0" to="1" dur="0.8s" fill="freeze" />
          </path>

          {/* Line */}
          <path
            d={linePath}
            fill="none"
            stroke={`url(#${chartId}_line)`}
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            filter={`url(#${chartId}_shadow)`}
          />

          {/* Average line */}
          <line
            x1={pad.left} y1={yScale(avg)} x2={pad.left + cW} y2={yScale(avg)}
            stroke="#94a3b8" strokeWidth="1" strokeDasharray="6 4" opacity="0.5"
          />
          <rect
            x={pad.left + cW + 4} y={yScale(avg) - 8}
            width="32" height="16" rx="4" fill="#f1f5f9"
          />
          <text
            x={pad.left + cW + 20} y={yScale(avg) + 4}
            textAnchor="middle" fontSize="8" fill="#94a3b8" fontWeight="800"
            fontFamily="system-ui, -apple-system, sans-serif"
          >
            ORT
          </text>

          {/* Date labels on X axis */}
          {pathPoints.map((p, i) => {
            // Only show every Nth label to avoid overlap
            if (i % labelStep !== 0 && i !== points.length - 1) return null
            return (
              <text
                key={`date-${i}`}
                x={p.x} y={pad.top + cH + 24}
                textAnchor="middle" fontSize="10" fontWeight="700" fill="#94a3b8"
                fontFamily="system-ui, -apple-system, sans-serif"
              >
                {dateFormatter.format(points[i].date)}
              </text>
            )
          })}

          {/* Vertical hover guide line */}
          {hoveredIdx !== null && (
            <line
              x1={pathPoints[hoveredIdx].x} y1={pad.top}
              x2={pathPoints[hoveredIdx].x} y2={pad.top + cH}
              stroke={accentColor} strokeWidth="1" strokeDasharray="4 3" opacity="0.3"
            />
          )}

          {/* Data points */}
          {pathPoints.map((p, i) => {
            const isHovered = hoveredIdx === i
            const ptColor = scoreColor(points[i].score)
            
            return (
              <g key={i}
                onMouseEnter={() => setHoveredIdx(i)}
                onMouseLeave={() => setHoveredIdx(null)}
                style={{cursor: 'pointer'}}
              >
                {/* Larger hit area */}
                <circle cx={p.x} cy={p.y} r="18" fill="transparent" />
                
                {/* Outer ring on hover */}
                {isHovered && (
                  <circle cx={p.x} cy={p.y} r="14" fill={accentColor} opacity="0.1">
                    <animate attributeName="r" from="6" to="14" dur="0.2s" fill="freeze" />
                  </circle>
                )}
                
                {/* Dot */}
                <circle
                  cx={p.x} cy={p.y} r={isHovered ? 7 : 5}
                  fill="#fff" stroke={ptColor} strokeWidth="3"
                  style={{transition: 'all 0.2s ease'}}
                />
                {/* Inner dot color fill */}
                <circle
                  cx={p.x} cy={p.y} r={isHovered ? 3 : 2}
                  fill={ptColor}
                  style={{transition: 'all 0.2s ease'}}
                />

                {/* Score label above dot (always visible) */}
                <text
                  x={p.x} y={p.y - 16}
                  textAnchor="middle" fontSize="11" fontWeight="900"
                  fill={ptColor}
                  opacity={isHovered ? 1 : 0.8}
                  fontFamily="system-ui, -apple-system, sans-serif"
                >
                  {points[i].score.toFixed(1)}
                </text>

                {/* Tooltip on hover */}
                {isHovered && (() => {
                  const tooltipW = 160
                  const tooltipH = points[i].label ? 52 : 36
                  // Position tooltip above the point, but clamp so it doesn't go out of bounds
                  let tooltipX = p.x - tooltipW / 2
                  let tooltipY = p.y - 36 - tooltipH
                  if (tooltipY < 4) tooltipY = p.y + 24 // flip below if too high
                  if (tooltipX < 4) tooltipX = 4
                  if (tooltipX + tooltipW > W - 4) tooltipX = W - 4 - tooltipW
                  
                  return (
                    <g>
                      <rect
                        x={tooltipX} y={tooltipY} width={tooltipW} height={tooltipH}
                        rx="10" fill="#1e1b4b" opacity="0.95"
                        filter={`url(#${chartId}_glow)`}
                      />
                      {/* Arrow */}
                      <polygon
                        points={`${p.x - 6},${tooltipY + tooltipH} ${p.x},${tooltipY + tooltipH + 7} ${p.x + 6},${tooltipY + tooltipH}`}
                        fill="#1e1b4b" opacity="0.95"
                        style={{display: tooltipY < p.y ? 'block' : 'none'}}
                      />
                      <text
                        x={tooltipX + tooltipW / 2} y={tooltipY + 16}
                        textAnchor="middle" fontSize="11" fontWeight="700" fill="#fff"
                        fontFamily="system-ui, -apple-system, sans-serif"
                      >
                        📅 {points[i].date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}
                      </text>
                      <text
                        x={tooltipX + tooltipW / 2} y={tooltipY + 30}
                        textAnchor="middle" fontSize="10" fontWeight="800" fill="#a5b4fc"
                        fontFamily="system-ui, -apple-system, sans-serif"
                      >
                        Skor: {points[i].score.toFixed(1)} / 5.0
                      </text>
                      {points[i].label && (
                        <text
                          x={tooltipX + tooltipW / 2} y={tooltipY + 44}
                          textAnchor="middle" fontSize="9" fontWeight="600" fill="#c4b5fd"
                          fontFamily="system-ui, -apple-system, sans-serif"
                        >
                          {points[i].label.length > 22 ? points[i].label.slice(0, 22) + '…' : points[i].label}
                        </text>
                      )}
                    </g>
                  )
                })()}
              </g>
            )
          })}
        </svg>
      </div>

      {/* Legend */}
      <div style={{
        display: 'flex', justifyContent: 'center', gap: '1.5rem', padding: '0.5rem 1rem 1rem',
        fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8',
      }}>
        <div style={{display: 'flex', alignItems: 'center', gap: '5px'}}>
          <div style={{width: '10px', height: '10px', borderRadius: '3px', background: '#10b98120', border: '1px solid #10b98140'}} />
          <span>İyi (4-5)</span>
        </div>
        <div style={{display: 'flex', alignItems: 'center', gap: '5px'}}>
          <div style={{width: '10px', height: '10px', borderRadius: '3px', background: '#f59e0b20', border: '1px solid #f59e0b40'}} />
          <span>Geliştirilmeli (3-4)</span>
        </div>
        <div style={{display: 'flex', alignItems: 'center', gap: '5px'}}>
          <div style={{width: '10px', height: '10px', borderRadius: '3px', background: '#f43f5e20', border: '1px solid #f43f5e40'}} />
          <span>Yetersiz (0-3)</span>
        </div>
      </div>
    </div>
  )
}

export default ProgressChart
