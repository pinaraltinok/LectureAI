import { useState } from 'react'
import './Login.css'

export default function Login({ onLogin }) {
  const [isLogin, setIsLogin] = useState(true)
  const [role, setRole] = useState('student')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const handleSubmit = (e) => {
    e.preventDefault()
    if (isLogin) {
      onLogin(role, email)
    } else {
      // Simulate signup success and switch to login
      alert("Kayıt başarıyla oluşturuldu! Şimdi giriş yapabilirsiniz.")
      setIsLogin(true)
    }
  }

  return (
    <div className="login-container">
      <div className="background-overlay"></div>
      <div className="login-card">
        <div className="login-header">
          <div className="brand-icon-premium">
            <span>▦</span>
          </div>
          <h1 className="brand-name">LectureAI</h1>
          <p className="brand-tagline">
            {isLogin ? "Geleceğin Eğitim Analiz Platformu" : "Aramıza Katılın"}
          </p>
        </div>

        <div className="role-tabs">
          <button className={role === 'student' ? 'active' : ''} onClick={() => setRole('student')}>Öğrenci</button>
          <button className={role === 'teacher' ? 'active' : ''} onClick={() => setRole('teacher')}>Eğitmen</button>
          <button className={role === 'admin' ? 'active' : ''} onClick={() => setRole('admin')}>Yönetici</button>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          {!isLogin && (
            <div className="input-group">
              <label>AD SOYAD</label>
              <input
                type="text"
                placeholder="Adınız ve Soyadınız"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
          )}
          <div className="input-group">
            <label>E-POSTA ADRESİ</label>
            <input
              type="email"
              placeholder={`${role}@lectureai.com`}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="input-group">
            <label>ŞİFRE</label>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <button type="submit" className="login-submit-btn">
            {isLogin ? "Giriş Yap" : "Hesap Oluştur"}
          </button>
        </form>

        <div className="login-footer">
          {isLogin ? (
            <p>
              Hesabınız yok mu? <a href="#" onClick={(e) => { e.preventDefault(); setIsLogin(false) }}>Şimdi Kaydolun</a>
            </p>
          ) : (
            <p>
              Zaten üye misiniz? <a href="#" onClick={(e) => { e.preventDefault(); setIsLogin(true) }}>Giriş Yapın</a>
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
