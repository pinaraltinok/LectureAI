import { useState } from 'react'
import { BrowserRouter, Routes, Route, NavLink, useNavigate, Navigate } from 'react-router-dom'
import Login from './Login.jsx'

// ADMIN sayfaları
import AdminSummary from './admin/AdminSummary.jsx'
import TeacherPool from './admin/TeacherPool.jsx'
import AnalysisWorkflow from './admin/AnalysisWorkflow.jsx'

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

function AppContent() {
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [role, setRole] = useState('admin')
  const [workflowStep, setWorkflowStep] = useState('upload')
  const navigate = useNavigate()

  const handleLogin = (userRole) => {
    setIsLoggedIn(true)
    setRole(userRole || 'student')
    
    if (userRole === 'admin') navigate('/admin/kurum-ozeti')
    else if (userRole === 'teacher') navigate('/teacher/ders-ozeti')
    else navigate('/student/derslerim') // Varsayılan derslerim
  }

  if (!isLoggedIn) {
    return <Login onLogin={handleLogin} />
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
        <button className="logout" onClick={() => { setIsLoggedIn(false); navigate('/'); }}>Çıkış Yap</button>
      </aside>

      <main className="content">
        <header className="topbar">
          <Routes>
            <Route path="/admin/*" element={
              <Routes>
                <Route path="kurum-ozeti" element={<div><h1>Kurum Performansı</h1><p>32 Eğitmen / 120 Grup Aktif</p></div>} />
                <Route path="egitmen-havuzu" element={<div><h1>Eğitmen Havuzu</h1><p>Eğitmenlerin raporlarını inceleyin.</p></div>} />
                <Route path="analiz-atama" element={
                  workflowStep === 'upload' 
                    ? <div><h1>Ders Analizi Atama</h1><p>Yeni bir ders kaydı yükleyin.</p></div>
                    : <div><h1>Taslak Rapor Önizleme</h1><p>Raporu onaylayın veya revize edin.</p></div>
                } />
              </Routes>
            } />
            
            <Route path="/teacher/*" element={
              <Routes>
                <Route path="ders-ozeti" element={<div><h1>Ders Özeti</h1><p>Sıradaki Ders: Python-102</p></div>} />
                <Route path="feedback" element={<div><h1>ATTENDANCE</h1><p>Hoş Geldiniz, TEACHER</p></div>} />
                <Route path="anketler" element={<div><h1>Öğrenci Feedbackleri</h1><p>Sistem durumu: Aktif</p></div>} />
              </Routes>
            } />

            <Route path="/student/*" element={
              <Routes>
                <Route path="derslerim" element={<div><h1>Active Courses</h1><p>Your current learning modules</p></div>} />
                <Route path="anket" element={<div><h1>Course Assessment</h1><p>Anonymous quality feedback</p></div>} />
                <Route path="notlar" element={<div><h1>Instructor Notes</h1><p>Resource feedback & communication</p></div>} />
              </Routes>
            } />
          </Routes>

          <div className="user-chip">
            <div className="avatar" style={{background: role==='admin'?'#f59e0b':role==='teacher'?'#6366f1':'#10b981'}}>
               {role==='admin'?'A':role==='teacher'?'ZB':'AV'}
            </div>
            <div>
              <strong>{role==='admin'?'Sistem Yöneticisi':role==='teacher'?'Zehra Bozkurt':'Ali Vural'}</strong>
              <small style={{display:'block'}}>{role.toUpperCase()}</small>
            </div>
          </div>
        </header>

        <Routes>
          <Route path="/admin/kurum-ozeti" element={<AdminSummary />} />
          <Route path="/admin/egitmen-havuzu" element={<TeacherPool />} />
          <Route path="/admin/analiz-atama" element={<AnalysisWorkflow onStepChange={setWorkflowStep} />} />
          
          <Route path="/teacher/ders-ozeti" element={<TeacherDashboard />} />
          <Route path="/teacher/feedback" element={<TeacherAttendance />} />
          <Route path="/teacher/anketler" element={<TeacherSurveys />} />

          <Route path="/student/derslerim" element={<StudentDashboard />} />
          <Route path="/student/anket" element={<StudentSurvey />} />
          <Route path="/student/notlar" element={<StudentNotes />} />

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
