import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, NavLink, useNavigate, Navigate } from 'react-router-dom'
import Login from './Login.jsx'

// ADMIN sayfaları
import AdminSummary from './admin/AdminSummary.jsx'
import TeacherPool from './admin/TeacherPool.jsx'
import AnalysisWorkflow from './admin/AnalysisWorkflow.jsx'
import AdminManagement from './admin/AdminManagement.jsx'

// TEACHER sayfaları
import TeacherDashboard from './teacher/TeacherDashboard.jsx'
import TeacherAttendance from './teacher/TeacherAttendance.jsx'
import TeacherSurveys from './teacher/TeacherSurveys.jsx'

// COMPONENTS
import SharedReport from './components/SharedReport.jsx'

// STUDENT sayfaları
import StudentDashboard from './student/StudentDashboard.jsx'
import StudentSurvey from './student/StudentSurvey.jsx'
import StudentNotes from './student/StudentNotes.jsx'
import StudentLessonPlayer from './student/StudentLessonPlayer.jsx'
import ProfilePage from './components/ProfilePage.jsx'

function AppContent() {
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [role, setRole] = useState('admin')
  const [userName, setUserName] = useState('')
  const [workflowStep, setWorkflowStep] = useState('upload')
  const [sessionLoading, setSessionLoading] = useState(true)
  const navigate = useNavigate()

  // Restore session from localStorage token on page load / refresh
  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) {
      setSessionLoading(false)
      return
    }

    fetch('/api/auth/me', {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(res => {
        if (!res.ok) throw new Error('Token expired')
        return res.json()
      })
      .then(data => {
        setIsLoggedIn(true)
        setRole(data.role.toLowerCase())
        setUserName(data.name || '')
      })
      .catch(() => {
        // Token invalid or expired — clear it
        localStorage.removeItem('token')
      })
      .finally(() => setSessionLoading(false))
  }, [])

  const handleLogin = (userRole, name) => {
    setIsLoggedIn(true)
    setRole(userRole || 'student')
    setUserName(name || '')
    
    if (userRole === 'admin') navigate('/admin/kurum-ozeti')
    else if (userRole === 'teacher') navigate('/teacher/ders-ozeti')
    else navigate('/student/derslerim')
  }

  const handleLogout = () => {
    localStorage.removeItem('token')
    setIsLoggedIn(false)
    setRole('admin')
    setUserName('')
    navigate('/')
  }

  // Show loading spinner while checking session
  if (sessionLoading) {
    return (
      <div style={{display:'grid', placeItems:'center', minHeight:'100vh', background:'#0f172a'}}>
        <div style={{textAlign:'center', color:'#94a3b8'}}>
          <div style={{
            width:'48px', height:'48px', borderRadius:'50%',
            border:'3px solid #334155', borderTopColor:'#6366f1',
            animation:'spin 0.8s linear infinite', margin:'0 auto 1rem'
          }}></div>
          <p style={{fontWeight:600, fontSize:'0.9rem'}}>Oturum doğrulanıyor...</p>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  if (!isLoggedIn) {
    return <Login onLogin={handleLogin} />
  }

  const getInitials = (name) => {
    if (!name) return role === 'admin' ? 'A' : '?'
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand" style={{marginBottom: '3.5rem', padding: '0 1.2rem'}}>
          <div style={{display:'flex', alignItems:'center', gap:'1rem'}}>
            <div className="brand-icon-premium" style={{
              background: 'linear-gradient(135deg, #6366f1 0%, #06b6d4 100%)',
              boxShadow: '0 10px 25px -5px rgba(99, 102, 241, 0.3)',
              width: '42px', height: '42px', borderRadius: '12px',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <span style={{color: 'white', fontSize: '1.4rem'}}>▤</span>
            </div>
            <div style={{display:'flex', flexDirection:'column', lineHeight: 1.2}}>
              <span style={{fontSize: '1.25rem', fontWeight: 950, letterSpacing: '-0.02em', color: '#fff'}}>
                Lecture<span style={{color: '#06b6d4'}}>AI</span>
              </span>
              <span style={{
                fontSize: '0.6rem', fontWeight: 800, color: '#94a3b8', 
                letterSpacing: '0.15em', textTransform: 'uppercase'
              }}>Automated Reports</span>
            </div>
          </div>
        </div>
        <nav className="menu">
          {role === 'admin' && (
            <>
              <NavLink to="/admin/kurum-ozeti" className={({isActive})=>isActive?"menu-link active":"menu-link"}>▦ Kurum Özeti</NavLink>
              <NavLink to="/admin/egitmen-havuzu" className={({isActive})=>isActive?"menu-link active":"menu-link"}>👥 Eğitmenler & Raporlar</NavLink>
              <NavLink to="/admin/analiz-atama" className={({isActive})=>isActive?"menu-link active":"menu-link"}>☁ Ders Analizi Atama</NavLink>
              <NavLink to="/admin/yonetim" className={({isActive})=>isActive?"menu-link active":"menu-link"}>⚙ Kullanıcı & Grup Yönetimi</NavLink>
            </>
          )}

          {role === 'teacher' && (
            <>
              <NavLink to="/teacher/ders-ozeti" className={({isActive})=>isActive?"menu-link active":"menu-link"}>▦ Derslerim</NavLink>
              <NavLink to="/teacher/feedback" className={({isActive})=>isActive?"menu-link active":"menu-link"}>💬 Öğrenci Geri Bildirimi</NavLink>
              <NavLink to="/teacher/anketler" className={({isActive})=>isActive?"menu-link active":"menu-link"}>📊 Anket Sonuçları</NavLink>
            </>
          )}

          {role === 'student' && (
            <>
              <NavLink to="/student/derslerim" className={({isActive})=>isActive?"menu-link active":"menu-link"}>
                <span style={{marginRight: '12px', fontSize: '1.2rem'}}>📚</span> Derslerim
              </NavLink>
              <NavLink to="/student/anket" className={({isActive})=>isActive?"menu-link active":"menu-link"}>
                <span style={{marginRight: '12px', fontSize: '1.2rem'}}>✎</span> Ders Anketi
              </NavLink>
              <NavLink to="/student/notlar" className={({isActive})=>isActive?"menu-link active":"menu-link"}>
                <span style={{marginRight: '12px', fontSize: '1.2rem'}}>🗨</span> Hocamın Notları
              </NavLink>
            </>
          )}
        </nav>
        <button className="logout" onClick={handleLogout}>Çıkış Yap</button>
      </aside>

      <main className="content">
        <header className="topbar">
          <Routes>
            <Route path="/admin/*" element={
              <Routes>
                <Route path="kurum-ozeti" element={<div><h1>Kurum Performansı</h1><p>Kurum geneli analitik</p></div>} />
                <Route path="egitmen-havuzu" element={<div><h1>Eğitmenler & Raporlar</h1><p>Eğitmenlerin analiz raporlarını inceleyin.</p></div>} />
                <Route path="analiz-atama" element={
                  workflowStep === 'upload' 
                    ? <div><h1>Ders Analizi Atama</h1><p>Yeni bir ders kaydı yükleyin.</p></div>
                    : <div><h1>Taslak Rapor Önizleme</h1><p>Raporu onaylayın veya revize edin.</p></div>
                } />
                <Route path="yonetim" element={<div><h1>Kullanıcı & Grup Yönetimi</h1><p>Öğrenci, eğitmen ve grup işlemlerini yönetin.</p></div>} />
              </Routes>
            } />
            
            <Route path="/teacher/*" element={
              <Routes>
                <Route path="ders-ozeti" element={<div><h1>Ders Özeti</h1><p>Dersleriniz ve Analizleriniz</p></div>} />
                <Route path="feedback" element={<div><h1>Öğrenci Gelişim Notları</h1><p>Öğrencilerinize geri bildirim gönderin</p></div>} />
                <Route path="anketler" element={<div><h1>Öğrenci Geri Bildirim Analizi</h1><p>Anket sonuçları</p></div>} />
              </Routes>
            } />

            <Route path="/student/*" element={
              <Routes>
                <Route path="derslerim" element={<div><h1>Derslerim</h1><p>Kayıtlı olduğunuz dersler</p></div>} />
                <Route path="ders-kaydi" element={<div><h1>Ders Kaydı</h1><p>Ders kaydını izleyin ve not alın</p></div>} />
                <Route path="anket" element={<div><h1>Ders Anketi</h1><p>Anonim ders değerlendirmesi</p></div>} />
                <Route path="notlar" element={<div><h1>Hocamın Notları</h1><p>Eğitmenlerinizden gelen geri bildirimler</p></div>} />
              </Routes>
            } />

            <Route path="/profil" element={<div><h1>Profilim</h1><p>Hesap bilgileriniz</p></div>} />
          </Routes>

          <div className="user-chip" onClick={() => navigate('/profil')} style={{ cursor: 'pointer' }}
            onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
            onMouseLeave={e => e.currentTarget.style.opacity = '1'}
          >
            <div className="avatar" style={{background: role==='admin'?'#f59e0b':role==='teacher'?'#6366f1':'#10b981'}}>
               {getInitials(userName)}
            </div>
            <div>
              <strong>{userName || (role==='admin'?'Yönetici':role==='teacher'?'Eğitmen':'Öğrenci')}</strong>
              <small style={{display:'block'}}>{role.toUpperCase()}</small>
            </div>
          </div>
        </header>

        <Routes>
          <Route path="/admin/kurum-ozeti" element={<AdminSummary />} />
          <Route path="/admin/egitmen-havuzu" element={<TeacherPool />} />
          <Route path="/admin/analiz-atama" element={<AnalysisWorkflow onStepChange={setWorkflowStep} />} />
          <Route path="/admin/yonetim" element={<AdminManagement />} />
          
          <Route path="/teacher/ders-ozeti" element={<TeacherDashboard />} />
          <Route path="/teacher/feedback" element={<TeacherAttendance />} />
          <Route path="/teacher/anketler" element={<TeacherSurveys />} />

          <Route path="/student/derslerim" element={<StudentDashboard />} />
          <Route path="/student/ders-kaydi" element={<StudentLessonPlayer />} />
          <Route path="/student/anket" element={<StudentSurvey />} />
          <Route path="/student/notlar" element={<StudentNotes />} />

          <Route path="/profil" element={<ProfilePage />} />

          <Route path="/" element={<Navigate to={role==='admin'?'/admin/kurum-ozeti':role==='teacher'?'/teacher/ders-ozeti':'/student/derslerim'} />} />
        </Routes>
      </main>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  )
}
