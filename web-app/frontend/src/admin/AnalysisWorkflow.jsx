import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import SharedReport from '../components/SharedReport.jsx'

const AnalysisWorkflow = ({ onStepChange }) => {
  const [step, setStep] = useState('upload')
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [adminNote, setAdminNote] = useState('')
  const [isRegenerating, setIsRegenerating] = useState(false)
  const fileInputRef = useRef(null)
  const navigate = useNavigate()
  
  const startAnalysis = (regeneration = false) => {
    setIsAnalyzing(true)
    setIsRegenerating(regeneration)
    setTimeout(() => {
      setIsAnalyzing(false)
      setIsRegenerating(false)
      setStep('preview')
      onStepChange('preview')
      if (regeneration) {
        alert("Rapor geri bildirimlerinize göre optimize edildi!")
        setAdminNote('')
      }
    }, 3000)
  }

  const handleStep = (newStep) => {
    setStep(newStep)
    onStepChange(newStep)
  }

  const mockDraft = {
    id: 'DRAFT-99',
    name: 'Zehra Bozkurt',
    module: 'Modül 8 - Veri Yapıları',
    date: '19/04/2026',
    group: 'PYTHON-101',
    evaluator: 'Sistem (AI)',
    quality: '%96',
    ttt: '%28',
    duration: '62dk',
    obs: [
      { t: 'Pedagojik Akış', c: 'Ders planına %100 sadık kalınmıştır. Geçişler yumuşak ve anlaşılırdır.' },
      { t: 'Öğrenci Katılımı', c: 'Öğrencilerin soruları bekletilmeden, teknik terimler sadeleştirilerek cevaplanmıştır.' }
    ]
  }

  if (isAnalyzing) {
    return (
      <div style={{display:'grid', placeItems:'center', minHeight:'500px', textAlign:'center', animation: 'fadeIn 0.5s ease'}}>
        <div style={{maxWidth: '430px'}}>
          <div style={{
            width: '80px', height: '80px', borderRadius: '50%', border: '4px solid #f1f5f9',
            borderTopColor: isRegenerating ? '#10b981' : '#6366f1', margin: '0 auto 2rem', animation: 'spin 1s linear infinite'
          }}></div>
          <h2 style={{fontSize:'2.2rem', fontWeight:950, color: '#0f172a', letterSpacing: '-0.02em'}}>
            {isRegenerating ? 'Rapor Optimize Ediliyor' : 'Ders Analiz Ediliyor'}
          </h2>
          <p style={{color:'#64748b', fontWeight:600, lineHeight: 1.6}}>
            {isRegenerating 
              ? 'Geri bildirimleriniz AI modelimize aktarıldı. Rapor içeriği ve skorlamalar notlarınıza göre yeniden hesaplanıyor...' 
              : 'AI motorumuz ses ve görüntü verilerini işleyerek pedagojik performans raporunu hazırlıyor. Lütfen bekleyin...'}
          </p>
        </div>
        <style>{`
          @keyframes spin { 100% { transform: rotate(360deg); } }
        `}</style>
      </div>
    )
  }

  if (step === 'upload') {
    return (
      <div className="workflow-container" style={{animation: 'fadeIn 0.5s ease'}}>
        {/* 1. Header Area */}
        <div style={{marginBottom: '3rem'}}>
           <h1 style={{fontSize: '2rem', fontWeight: 950, color: '#0f172a', letterSpacing: '-0.02em', margin: 0}}>Yeni Analiz Atama</h1>
           <p style={{color: '#64748b', fontSize: '1.05rem', marginTop: '4px'}}>Ders kaydını yükleyin ve yapay zeka analizini başlatın.</p>
        </div>

        <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3rem', alignItems: 'start'}}>
          {/* Left: Dropzone Area */}
          <div 
            onClick={() => fileInputRef.current.click()}
            style={{
              padding: '4rem 2rem', border: '2.5px dashed #e2e8f0', borderRadius: '32px',
              textAlign: 'center', cursor: 'pointer', background: '#f8fafc', transition: '0.3s',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem'
            }}
            onMouseOver={(e) => { e.currentTarget.style.borderColor = '#6366f1'; e.currentTarget.style.background = '#f5f3ff'; }}
            onMouseOut={(e) => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.background = '#f8fafc'; }}
          >
            <input 
              type="file" 
              ref={fileInputRef} 
              accept="video/mp4" 
              style={{display: 'none'}} 
              onChange={(e) => alert(`${e.target.files[0].name} seçildi. Hazır!`)}
            />
            <div style={{width: '72px', height: '72px', background: '#fff', borderRadius: '24px', display: 'grid', placeItems: 'center', fontSize: '2rem', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.05)'}}>☁</div>
            <div>
               <h3 style={{margin: '0 0 8px 0', fontSize: '1.2rem', fontWeight: 900, color: '#1e293b'}}>Ders Kaydını Yükleyin</h3>
               <p style={{margin: 0, color: '#64748b', fontSize: '0.9rem', fontWeight: 600}}>Sadece <strong style={{color: '#6366f1'}}>MP4</strong> formatı kabul edilir.</p>
            </div>
            <button style={{
              marginTop: '1rem', padding: '0.9rem 2rem', background: '#fff', border: '1px solid #cbd5e1', 
              borderRadius: '14px', fontWeight: 800, cursor: 'pointer', fontSize: '0.85rem'
            }}>Bilgisayarınızdan Seçin</button>
          </div>

          {/* Right: Metadata Form */}
          <div className="analysis-form" style={{padding:0, background:'transparent', border:'none'}}>
            <div style={{display:'flex', flexDirection:'column', gap: '1.5rem'}}>
              <div className="form-group">
                <label style={{fontSize: '11px', fontWeight: 800, color: '#64748b', marginBottom: '8px', display: 'block'}}>EĞİTMEN SEÇİMİ</label>
                <select style={{width:'100%', padding:'1rem', borderRadius:'14px', border:'1px solid #e2e8f0', fontWeight:700, outline: 'none', background:'#fff'}}>
                  <option>Zehra Bozkurt</option>
                  <option>Murat Kaya</option>
                  <option>Caner Öz</option>
                </select>
              </div>
              
              <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1.5rem'}}>
                <div className="form-group">
                  <label style={{fontSize: '11px', fontWeight: 800, color: '#64748b', marginBottom: '8px', display: 'block'}}>DERS KODU</label>
                  <input placeholder="Örn: PYTHON-101" style={{width:'100%', padding:'1rem', borderRadius:'14px', border:'1px solid #e2e8f0', fontWeight:700, outline: 'none'}} />
                </div>
                <div className="form-group">
                  <label style={{fontSize: '11px', fontWeight: 800, color: '#64748b', marginBottom: '8px', display: 'block'}}>TARİH SEÇİMİ</label>
                  <input 
                    type="date" 
                    style={{width:'100%', padding:'1rem', borderRadius:'14px', border:'1px solid #e2e8f0', fontWeight:700, outline: 'none', fontFamily: 'inherit'}} 
                  />
                </div>
              </div>

              <div className="form-group">
                <label style={{fontSize: '11px', fontWeight: 800, color: '#64748b', marginBottom: '8px', display: 'block'}}>MODÜL / KONU</label>
                <input placeholder="Örn: Modül 8 - Veri Yapıları" style={{width:'100%', padding:'1rem', borderRadius:'14px', border:'1px solid #e2e8f0', fontWeight:700, outline: 'none'}} />
              </div>
              
              <button 
                className="primary-btn" 
                style={{marginTop: '1.5rem', padding: '1.25rem', fontSize: '1rem', boxShadow: '0 20px 25px -5px rgba(99, 102, 241, 0.4)'}} 
                onClick={() => startAnalysis(false)}
              >
                Analizi Başlat & Raporu Hazırla
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (step === 'success') {
    return (
      <div style={{display:'grid', placeItems:'center', minHeight:'500px', textAlign:'center', animation: 'fadeIn 0.5s ease'}}>
        <div style={{maxWidth: '430px'}}>
          <div style={{
            width: '80px', height: '80px', borderRadius: '50%', background: '#f0fdf4', 
            color: '#10b981', margin: '0 auto 2rem', display: 'grid', placeItems: 'center', fontSize: '2.5rem'
          }}>✓</div>
          <h2 style={{fontSize:'2.2rem', fontWeight:950, color: '#0f172a', letterSpacing: '-0.02em'}}>İşlem Başarılı</h2>
          <p style={{color:'#64748b', fontWeight:600, lineHeight: 1.6, marginBottom: '2.5rem'}}>
            Analiz raporu onaylandı ve eğitmen paneline başarıyla gönderildi. Eğitmen yeni analizi anasayfasında görebilir.
          </p>
          <div style={{display: 'flex', flexDirection: 'column', gap: '1rem'}}>
             <button 
               className="primary-btn" 
               style={{padding: '1.1rem', borderRadius: '16px'}}
               onClick={() => handleStep('upload')}
             >
               Yeni Bir Analiz Ataması Yap
             </button>
             <button 
               className="outline-btn" 
               style={{padding: '1.1rem', borderRadius: '16px'}}
               onClick={() => navigate('/admin/egitmen-havuzu')}
             >
               Eğitmen Listesine Git
             </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="workflow-container" style={{animation: 'fadeIn 0.5s ease'}}>
      <div className="alert-banner" style={{background: '#f8fafc', border: '1.5px solid #e2e8f0', borderRadius: '24px', padding: '1.5rem', marginBottom: '3rem', display: 'flex', gap: '1.25rem', alignItems: 'center'}}>
        <div style={{width: '42px', height: '42px', background: '#6366f1', color: '#fff', borderRadius: '50%', display: 'grid', placeItems: 'center', fontWeight: 900}}>!</div>
        <div>
           <strong style={{fontSize: '0.9rem', color: '#0f172a'}}>YAYIN ÖNCESİ TASLAK KONTROLÜ</strong>
           <p style={{margin: '4px 0 0 0', fontSize: '0.85rem', color: '#64748b'}}>Hocaya iletilmeden önce raporun son halini aşağıdan inceleyebilirsiniz.</p>
        </div>
      </div>

      {/* Full Report Preview for Admin Review */}
      <div style={{marginBottom: '4rem'}}>
        <h4 style={{fontSize: '11px', fontWeight: 900, color: '#64748b', marginBottom: '1.5rem', textTransform: 'uppercase', letterSpacing: '0.1em'}}>Taslak Rapor Önizlemesi</h4>
        <SharedReport report={mockDraft} />
      </div>

      <div style={{marginTop: '3.5rem', borderTop: '1px solid #f1f5f9', paddingTop: '3.5rem'}}>
        <label style={{fontSize: '11px', fontWeight: 800, color: '#64748b', display: 'block', marginBottom: '1rem'}}>AI GELİŞTİRME NOTUNA EKLEME YAP (OPSİYONEL)</label>
        <textarea 
          placeholder="Hocaya iletilecek özel bir mesajınız var mı? Veya raporun değişmesini istediğiniz kısımları buraya yazıp feedback döngüsü başlatın." 
          value={adminNote}
          onChange={(e) => setAdminNote(e.target.value)}
          style={{width:'100%', minHeight:'120px', border:'1.5px solid #e2e8f0', borderRadius:'24px', padding:'1.5rem', fontSize:'0.95rem', outline:'none'}}
        ></textarea>
        
        <div style={{display: 'flex', gap: '1.5rem', marginTop: '2.5rem'}}>
          <button 
            className="outline-btn" 
            style={{flex: 1, padding: '1.1rem', borderRadius: '16px', opacity: adminNote ? 1 : 0.5, cursor: adminNote ? 'pointer' : 'not-allowed'}} 
            onClick={() => adminNote && startAnalysis(true)}
          >
            ↺ Feedback ile Yeniden Oluştur
          </button>
          <button 
            className="primary-btn" 
            style={{flex: 2, padding: '1.1rem', borderRadius: '16px'}} 
            onClick={() => handleStep('success')}
          >
            ✓ Raporu Onayla ve Eğitmen Paneline Gönder
          </button>
        </div>
      </div>
    </div>
  )
}

export default AnalysisWorkflow
