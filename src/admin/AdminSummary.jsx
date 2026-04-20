import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer 
} from 'recharts'

const AdminSummary = () => {
  const stats = [
    { label: 'Eğitmenler', value: '32', icon: '👥', color: '#6366f1', trend: '+2 bu ay' },
    { label: 'Aktif Gruplar', value: '120', icon: '▦', color: '#06b6d4', trend: 'Kararlı' },
    { label: 'Genel Puan', value: '4.7', icon: '⭐', color: '#10b981', trend: '+0.2 artış' },
    { label: 'Kritik Uyarı', value: '2', icon: '⚠️', color: '#f43f5e', trend: '-3 azalma' },
  ]

  const data = [
    { month: 'Eki', skor: 65 },
    { month: 'Kas', skor: 72 },
    { month: 'Ara', skor: 68 },
    { month: 'Oca', skor: 85 },
    { month: 'Şub', skor: 92 },
    { month: 'Mar', skor: 94 },
  ]

  return (
    <div style={{animation: 'fadeIn 0.5s ease', padding: '1rem'}}>
      {/* 1. Header Stats Grid */}
      <section style={{display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1.5rem', marginBottom: '2.5rem'}}>
        {stats.map((s, idx) => (
          <div key={idx} className="stat-card" style={{
            position: 'relative', overflow: 'hidden', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem'
          }}>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
               <span style={{fontSize: '1.5rem'}}>{s.icon}</span>
               <span style={{fontSize: '10px', fontWeight: 800, color: s.color, background: `${s.color}15`, padding: '4px 10px', borderRadius: '100px'}}>{s.trend}</span>
            </div>
            <span style={{fontSize: '0.75rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', mt: '1rem'}}>{s.label}</span>
            <span style={{fontSize: '2rem', fontWeight: 950, color: '#0f172a'}}>{s.value}</span>
            <div style={{position:'absolute', bottom:0, left:0, width:'100%', height:'4px', background: s.color, opacity: 0.1}}></div>
          </div>
        ))}
      </section>

      <div style={{display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '2rem'}}>
        
        {/* 2. Institutional Performance Graph (Recharts AreaChart) */}
        <div className="report-card-internal" style={{padding: '2.5rem', background: '#fff', border: '1px solid #f1f5f9', minHeight: '400px'}}>
           <div style={{display:'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem'}}>
              <div>
                <h3 style={{margin: 0, fontSize: '1.25rem', fontWeight: 900, color: '#1e293b'}}>Eğitmen Performans Trendi</h3>
                <p style={{margin: '4px 0 0 0', fontSize: '0.85rem', color: '#64748b'}}>Kurumsal kalite skoru analitiği</p>
              </div>
           </div>
           
           <div style={{width: '100%', height: '300px'}}>
             <ResponsiveContainer width="100%" height="100%">
               <AreaChart data={data}>
                 <defs>
                   <linearGradient id="colorSkor" x1="0" y1="0" x2="0" y2="1">
                     <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                     <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                   </linearGradient>
                 </defs>
                 <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                 <XAxis 
                   dataKey="month" 
                   axisLine={false} 
                   tickLine={false} 
                   tick={{fontSize: 11, fontWeight: 700, fill: '#94a3b8'}}
                   dy={10}
                 />
                 <YAxis 
                   axisLine={false} 
                   tickLine={false} 
                   tick={{fontSize: 11, fontWeight: 700, fill: '#94a3b8'}}
                   domain={[0, 100]}
                 />
                 <Tooltip 
                   contentStyle={{
                     borderRadius: '12px', border: 'none', 
                     boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)',
                     fontSize: '12px', fontWeight: 700
                   }}
                 />
                 <Area 
                   type="monotone" 
                   dataKey="skor" 
                   stroke="#6366f1" 
                   strokeWidth={3}
                   fillOpacity={1} 
                   fill="url(#colorSkor)" 
                   animationDuration={1500}
                 />
               </AreaChart>
             </ResponsiveContainer>
           </div>
        </div>

        {/* 3. Quality Distribution Side Panel */}
        <div className="report-card-internal" style={{padding: '2.5rem', background: '#fff', border: '1px solid #f1f5f9'}}>
            <h3 style={{fontSize: '1.1rem', fontWeight: 900, color: '#1e293b', marginBottom: '2rem'}}>Kalite Dağılımı</h3>
            <div style={{display:'flex', flexDirection: 'column', gap: '1.5rem'}}>
               {[
                 { label: 'Mükemmel (90+)', count: 24, color: '#10b981' },
                 { label: 'İyi (75-90)', count: 6, color: '#6366f1' },
                 { label: 'Gelişmeli (50-75)', count: 2, color: '#f59e0b' }
               ].map((item, i) => (
                 <div key={i}>
                    <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '11px', fontWeight: 800}}>
                       <span style={{color: '#64748b'}}>{item.label}</span>
                       <span style={{color: item.color}}>{item.count} Eğitmen</span>
                    </div>
                    <div style={{height: '8px', background: '#f1f5f9', borderRadius: '10px', overflow: 'hidden'}}>
                       <div style={{width: `${(item.count/32)*100}%`, height: '100%', background: item.color, borderRadius: '10px'}}></div>
                    </div>
                 </div>
               ))}
            </div>

            <div style={{marginTop: '3rem', padding: '1.5rem', background: '#fef2f2', borderRadius: '20px', border: '1px solid #fee2e2'}}>
               <h4 style={{margin: '0 0 10px 0', fontSize: '12px', fontWeight: 900, color: '#b91c1c'}}>KRİTİK AKSİYON GEREKLİ</h4>
               <p style={{margin: 0, fontSize: '0.85rem', color: '#991b1b', lineHeight: 1.5}}>
                 2 eğitmenin son rapor skoru eşik değerin altında. Gözden geçirme bekleniyor.
               </p>
            </div>
        </div>

      </div>
    </div>
  )
}

export default AdminSummary
