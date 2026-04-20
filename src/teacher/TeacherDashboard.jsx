import { useState } from 'react'
import SharedReport from '../components/SharedReport.jsx'

const TeacherDashboard = () => {
  const [selectedReport, setSelectedReport] = useState(1)
  const [teacherComment, setTeacherComment] = useState("");

  const teacherStats = [
    { label: "Total Students", value: "24", icon: "👥", color: "#6366f1" },
    { label: "Feedback Score", value: "4.9", icon: "⭐", color: "#10b981" },
    { label: "Total Hours", value: "142", icon: "⏳", color: "#f59e0b" },
    { label: "Active Groups", value: "3", icon: "📚", color: "#ec4899" }
  ]

  const pendingReports = [
    { 
      id: 1, group: "TURPRM1220", module: "Modül 8 - Ders 2", date: "11/02/2026", status: "Awaiting Feedback", 
      evaluator: 'Özlem', quality: '%95', ttt: '%42', duration: '75dk'
    },
    { 
      id: 2, group: "TURPRM1221", module: "Modül 9 - Ders 1", date: "14/02/2026", status: "New",
      evaluator: 'Hakan', quality: '%98', ttt: '%35', duration: '60dk'
    }
  ]

  const currentReport = pendingReports.find(r => r.id === selectedReport) || pendingReports[0]

  return (
    <div className="teacher-dashboard" style={{animation: 'fadeIn 0.5s ease'}}>
      
      {/* Executive Quick Stats */}
      <div className="stats-grid" style={{gridTemplateColumns:'repeat(4, 1fr)', gap:'1.5rem', marginBottom:'2.5rem'}}>
        {teacherStats.map((stat, idx) => (
          <div key={idx} className="stat-card" style={{
            minHeight:'120px', padding:'1.5rem', alignItems:'flex-start', 
            justifyContent:'space-between', borderRadius: '24px', position: 'relative', overflow: 'hidden'
          }}>
            <div style={{width:'42px', height:'42px', background:`${stat.color}11`, borderRadius:'12px', display:'grid', placeItems:'center', fontSize:'1.2rem'}}>
              {stat.icon}
            </div>
            <div>
              <span className="stat-label" style={{fontSize: '0.75rem', fontWeight: 800, textAlign: 'left', marginBottom: '4px', color: '#64748b'}}>{stat.label}</span>
              <span className="stat-value" style={{fontSize: '1.8rem', display: 'block', fontWeight: 800}}>{stat.value}</span>
            </div>
            <div style={{position:'absolute', right:'-5%', bottom:'-5%', width:'70px', height:'70px', background:stat.color, opacity:0.05, borderRadius:'50%', filter:'blur(20px)'}}></div>
          </div>
        ))}
      </div>

      <div style={{display: 'grid', gridTemplateColumns: '320px 1fr', gap: '2rem'}}>
        
        {/* Sidebar: Pending Reports List */}
        <div style={{display:'flex', flexDirection:'column', gap:'1.25rem'}}>
          <h3 style={{fontSize:'0.9rem', fontWeight:800, color:'#64748b', mb:'1rem', display:'flex', alignItems:'center', gap:'8px'}}>
            <span style={{width:'8px', height:'8px', background:'#f59e0b', borderRadius:'50%'}}></span>
            BEKLEYEN ANALİZLER
          </h3>
          
          {pendingReports.map(report => (
            <div 
              key={report.id}
              onClick={() => setSelectedReport(report.id)}
              style={{
                padding: '1.1rem', borderRadius: '16px', border: '1px solid',
                borderColor: selectedReport === report.id ? 'var(--primary)' : '#f1f5f9',
                background: selectedReport === report.id ? '#f5f3ff' : '#fff',
                cursor: 'pointer', transition: 'all 0.3s ease',
                boxShadow: selectedReport === report.id ? '0 10px 15px -3px rgba(99, 102, 241, 0.1)' : 'none'
              }}
            >
              <div style={{display:'flex', justifyContent:'space-between', marginBottom:'6px'}}>
                <span style={{fontSize:'10px', fontWeight:800, color: selectedReport === report.id ? 'var(--primary)' : '#94a3b8'}}>{report.group}</span>
                <span style={{fontSize:'10px', color:'#94a3b8'}}>{report.date}</span>
              </div>
              <h4 style={{margin:0, fontSize:'0.9rem', fontWeight:800, color:'#1e293b'}}>{report.module}</h4>
            </div>
          ))}
        </div>

        {/* Main: Shared QA Report Component */}
        <div style={{display: 'flex', flexDirection: 'column', gap: '2rem'}}>
           <SharedReport report={currentReport} />

           {/* Teacher's Response Area */}
           <div className="report-card-internal" style={{padding: '2.5rem', background: '#f8fafc', border: '1px solid #cbd5e1'}}>
              <h5 style={{margin:'0 0 1.25rem 0', fontSize:'11px', fontWeight:800, color:'#0f172a', textTransform:'uppercase', letterSpacing:'0.05em'}}>Eğitmen Yanıtı & Kabul Beyanı</h5>
              <textarea 
                placeholder="Rapor hakkında eklemek istediğiniz bir not var mı?"
                value={teacherComment}
                onChange={(e) => setTeacherComment(e.target.value)}
                style={{
                  width:'100%', minHeight:'120px', padding:'1.5rem', borderRadius:'16px', border:'1px solid #cbd5e1',
                  fontSize:'0.95rem', outline:'none', background:'#fff', transition:'0.3s'
                }}
              />
              <div style={{display:'flex', justifyContent:'flex-end', gap:'1rem', marginTop:'1.5rem'}}>
                 <button style={{padding:'12px 24px', background:'none', border:'1px solid #cbd5e1', borderRadius:'12px', fontWeight:700, cursor:'pointer'}}>Taslağı Kaydet</button>
                 <button 
                   className="primary-btn" 
                   onClick={() => { alert("Rapor onaylandı!"); setTeacherComment(""); }}
                   style={{padding:'12px 32px', background: teacherComment ? 'var(--primary)' : '#e2e8f0', pointerEvents: teacherComment ? 'auto' : 'none'}}
                 >
                   Onayla ve Gönder
                 </button>
              </div>
           </div>
        </div>

      </div>
    </div>
  )
}

export default TeacherDashboard
