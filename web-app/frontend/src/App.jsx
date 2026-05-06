import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, NavLink, useNavigate, Navigate, useLocation } from 'react-router-dom'
import { LayoutDashboard, Users, Upload, Settings, BookOpen, MessageSquare, BarChart3, GraduationCap, ClipboardEdit, StickyNote, LogOut, BookOpenCheck, Menu, X, Mic } from 'lucide-react'
import { AuthProvider, useAuth } from './context/AuthContext.jsx'
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
import StudentReportView from './student/StudentReportView.jsx'
import ProfilePage from './components/ProfilePage.jsx'

function AppContent() {
  const { user, loading, logout, isAuthenticated } = useAuth()
  const [workflowStep, setWorkflowStep] = useState('upload')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()

  // Close sidebar on route change (mobile)
  useEffect(() => {
    setSidebarOpen(false)
  }, [location.pathname])

  const handleLogout = () => {
    logout()
    navigate('/')
  }

  // Show loading spinner while checking session
  if (loading) {
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

  if (!isAuthenticated) {
    return <Login />
  }

  const role = user.role
  const userName = user.name

  const getInitials = (name) => {
    if (!name) return role === 'admin' ? 'A' : '?'
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
  }

  return (
    <div className="app-shell">
      {/* Mobile hamburger toggle */}
      <button className="sidebar-toggle" onClick={() => setSidebarOpen(!sidebarOpen)} aria-label="Menüyü Aç/Kapat">
        {sidebarOpen ? <X size={22} /> : <Menu size={22} />}
      </button>

      {/* Mobile overlay */}
      <div
        className={`sidebar-overlay ${sidebarOpen ? 'active' : ''}`}
        onClick={() => setSidebarOpen(false)}
      />

      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="brand" style={{marginBottom: '2.5rem', padding: '0 1.2rem', cursor: 'pointer'}} onClick={() => navigate('/')}>
          <div style={{display:'flex', alignItems:'center', gap:'1rem'}}>
            <div style={{
              width: '52px', height: '52px', borderRadius: '50%',
              overflow: 'hidden', flexShrink: 0
            }}>
              <img src="/logo.png" alt="LectureAI" style={{width: '100%', height: '100%', objectFit: 'cover'}} />
            </div>
            <div style={{display:'flex', flexDirection:'column', lineHeight: 1.2}}>
              <span style={{fontSize: '1.25rem', fontWeight: 950, letterSpacing: '-0.02em', color: '#fff'}}>
                Lecture<span style={{color: '#06b6d4'}}>AI</span>
              </span>
              <span style={{
                fontSize: '0.6rem', fontWeight: 800, color: '#475569', 
                letterSpacing: '0.15em', textTransform: 'uppercase'
              }}>Smart Analytics</span>
            </div>
          </div>
        </div>

        <div className="sidebar-section-label">
          {role === 'admin' ? '◇ Yönetim Paneli' : role === 'teacher' ? '◇ Eğitmen Paneli' : '◇ Öğrenci Paneli'}
        </div>

        <nav className="menu">
          {role === 'admin' && (
            <>
              <NavLink to="/admin/kurum-ozeti" className={({isActive})=>isActive?"menu-link active":"menu-link"}>
                <LayoutDashboard size={18} style={{marginRight:'12px', opacity: 0.8, flexShrink: 0}} />
                Kurum Özeti
              </NavLink>
              <NavLink to="/admin/egitmen-havuzu" className={({isActive})=>isActive?"menu-link active":"menu-link"}>
                <Users size={18} style={{marginRight:'12px', opacity: 0.8, flexShrink: 0}} />
                Eğitmenler & Raporlar
              </NavLink>
              <NavLink to="/admin/analiz-atama" className={({isActive})=>isActive?"menu-link active":"menu-link"}>
                <Upload size={18} style={{marginRight:'12px', opacity: 0.8, flexShrink: 0}} />
                Ders Analizi Atama
              </NavLink>
              <NavLink to="/admin/yonetim" className={({isActive})=>isActive?"menu-link active":"menu-link"}>
                <Settings size={18} style={{marginRight:'12px', opacity: 0.8, flexShrink: 0}} />
                Kullanıcı & Grup Yönetimi
              </NavLink>
            </>
          )}

          {role === 'teacher' && (
            <>
              <NavLink to="/teacher/ders-ozeti" className={({isActive})=>isActive?"menu-link active":"menu-link"}>
                <BookOpenCheck size={18} style={{marginRight:'12px', opacity: 0.8, flexShrink: 0}} />
                Derslerim
              </NavLink>
              <NavLink to="/teacher/feedback" className={({isActive})=>isActive?"menu-link active":"menu-link"}>
                <MessageSquare size={18} style={{marginRight:'12px', opacity: 0.8, flexShrink: 0}} />
                Öğrenci Geri Bildirimi
              </NavLink>
              <NavLink to="/teacher/anketler" className={({isActive})=>isActive?"menu-link active":"menu-link"}>
                <BarChart3 size={18} style={{marginRight:'12px', opacity: 0.8, flexShrink: 0}} />
                Anket Sonuçları
              </NavLink>
            </>
          )}

          {role === 'student' && (
            <>
              <NavLink to="/student/derslerim" className={({isActive})=>isActive?"menu-link active":"menu-link"}>
                <GraduationCap size={18} style={{marginRight:'12px', opacity: 0.8, flexShrink: 0}} />
                Derslerim
              </NavLink>
              <NavLink to="/student/anket" className={({isActive})=>isActive?"menu-link active":"menu-link"}>
                <ClipboardEdit size={18} style={{marginRight:'12px', opacity: 0.8, flexShrink: 0}} />
                Ders Anketi
              </NavLink>
              <NavLink to="/student/notlar" className={({isActive})=>isActive?"menu-link active":"menu-link"}>
                <StickyNote size={18} style={{marginRight:'12px', opacity: 0.8, flexShrink: 0}} />
                Hocamın Notları
              </NavLink>
              <NavLink to="/student/raporlarim" className={({isActive})=>isActive?"menu-link active":"menu-link"}>
                <Mic size={18} style={{marginRight:'12px', opacity: 0.8, flexShrink: 0}} />
                Ses Raporlarım
              </NavLink>
            </>
          )}
        </nav>

        <div className="sidebar-divider"></div>

        <div className="sidebar-user-block" onClick={() => navigate('/profil')} style={{cursor:'pointer'}}>
          <div className="sidebar-user-avatar" style={{background: role==='admin'?'linear-gradient(135deg, #f59e0b, #ef4444)':role==='teacher'?'linear-gradient(135deg, #6366f1, #8b5cf6)':'linear-gradient(135deg, #10b981, #06b6d4)'}}>
            {getInitials(userName)}
          </div>
          <div className="sidebar-user-info">
            <span className="sidebar-user-name">{userName || (role==='admin'?'Yönetici':role==='teacher'?'Eğitmen':'Öğrenci')}</span>
            <span className="sidebar-user-role">{role === 'admin' ? 'Yönetici' : role === 'teacher' ? 'Eğitmen' : 'Öğrenci'}</span>
          </div>
        </div>

        <button className="logout" onClick={handleLogout}>
          <LogOut size={16} style={{flexShrink: 0}} />
          Çıkış Yap
        </button>
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
                <Route path="raporlarim" element={<div><h1>Ses Analiz Raporlarım</h1><p>Ders performansınıza dair pedagojik raporlar</p></div>} />
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
              <small style={{display:'block'}}>{role === 'admin' ? 'YÖNETİCİ' : role === 'teacher' ? 'EĞİTMEN' : 'ÖĞRENCİ'}</small>
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
          <Route path="/student/raporlarim" element={<StudentReportView />} />

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
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </BrowserRouter>
  )
}
