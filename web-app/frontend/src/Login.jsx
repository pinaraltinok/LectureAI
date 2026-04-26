import { useState } from 'react'
import './Login.css'

export default function Login({ onLogin }) {
  const [isLogin, setIsLogin] = useState(true)
  const [role, setRole] = useState('student')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [phone, setPhone] = useState('')
  const [age, setAge] = useState('')
  const [parentName, setParentName] = useState('')
  const [parentPhone, setParentPhone] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setErrorMsg('')
    if (isLogin) {
      try {
        const response = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        })
        const data = await response.json()
        if (response.ok) {
          localStorage.setItem('token', data.token)
          onLogin(data.role.toLowerCase(), data.name || '')
        } else {
          setErrorMsg(data.error || 'Giriş başarısız oldu')
        }
      } catch (err) {
        setErrorMsg('Sunucuya bağlanılamadı. Lütfen backend sunucusunun çalıştığından emin olun.')
      }
    } else {
      try {
        const body = { name, email, password, phone, role }
        if (role === 'student') {
          body.age = age
          body.parent = parentName
          body.parentPhone = parentPhone
        }
        const response = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        })
        const data = await response.json()
        if (response.ok) {
          localStorage.setItem('token', data.token)
          onLogin(data.role.toLowerCase(), data.name || '')
        } else {
          setErrorMsg(data.error || 'Kayıt başarısız oldu')
        }
      } catch (err) {
        setErrorMsg('Sunucuya bağlanılamadı. Lütfen backend sunucusunun çalıştığından emin olun.')
      }
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
          {errorMsg && (
            <div style={{color: '#f43f5e', background: '#ffe4e6', padding: '0.75rem', borderRadius: '8px', fontSize: '0.85rem', marginBottom: '1rem', textAlign: 'center'}}>
              {errorMsg}
            </div>
          )}
          {!isLogin && (
            <>
              <div className="input-group">
                <label>AD SOYAD</label>
                <input type="text" placeholder="Adınız ve Soyadınız" value={name} onChange={(e) => setName(e.target.value)} required />
              </div>
              <div className="input-group">
                <label>TELEFON</label>
                <input type="tel" placeholder="05XX XXX XXXX" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
            </>
          )}
          <div className="input-group">
            <label>E-POSTA ADRESİ</label>
            <input type="email" placeholder={`${role}@lectureai.com`} value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="input-group">
            <label>ŞİFRE</label>
            <input type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>

          {/* Student-specific fields */}
          {!isLogin && role === 'student' && (
            <>
              <div className="input-group">
                <label>YAŞ</label>
                <input type="number" placeholder="Yaşınız" value={age} onChange={(e) => setAge(e.target.value)} min="5" max="18" />
              </div>
              <div className="input-group">
                <label>VELİ ADI</label>
                <input type="text" placeholder="Veli Adı Soyadı" value={parentName} onChange={(e) => setParentName(e.target.value)} />
              </div>
              <div className="input-group">
                <label>VELİ TELEFONU</label>
                <input type="tel" placeholder="05XX XXX XXXX" value={parentPhone} onChange={(e) => setParentPhone(e.target.value)} />
              </div>
            </>
          )}

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
