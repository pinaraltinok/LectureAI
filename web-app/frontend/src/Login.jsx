import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext.jsx'
import './Login.css'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
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

  // Turkish phone number helpers
  const formatPhone = (value) => {
    const digits = value.replace(/\D/g, '').slice(0, 11)
    if (digits.length <= 4) return digits
    if (digits.length <= 7) return `${digits.slice(0,4)} ${digits.slice(4)}`
    return `${digits.slice(0,4)} ${digits.slice(4,7)} ${digits.slice(7)}`
  }
  const isValidPhone = (val) => {
    const digits = val.replace(/\D/g, '')
    return digits.length === 11 && digits.startsWith('05')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setErrorMsg('')
    if (isLogin) {
      try {
        const response = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ email, password })
        })
        const data = await response.json()
        if (response.ok) {
          login(data)
          const r = data.role.toLowerCase()
          if (r === 'admin') navigate('/admin/kurum-ozeti')
          else if (r === 'teacher') navigate('/teacher/ders-ozeti')
          else navigate('/student/derslerim')
        } else {
          setErrorMsg(data.error || 'Giriş başarısız oldu')
        }
      } catch (err) {
        setErrorMsg('Sunucuya bağlanılamadı. Lütfen backend sunucusunun çalıştığından emin olun.')
      }
    } else {
      // ── Comprehensive Frontend Validation ──
      // Ad Soyad
      if (!name.trim()) {
        return setErrorMsg('Ad Soyad alanı zorunludur.')
      }
      if (name.trim().length < 2) {
        return setErrorMsg('Ad Soyad en az 2 karakter olmalıdır.')
      }
      if (/\d/.test(name)) {
        return setErrorMsg('Ad Soyad rakam içeremez.')
      }

      // E-posta
      if (!email.trim()) {
        return setErrorMsg('E-posta adresi zorunludur.')
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return setErrorMsg('Geçerli bir e-posta adresi giriniz. (örn: ad@mail.com)')
      }

      // Telefon (zorunlu)
      if (!phone.trim()) {
        return setErrorMsg('Telefon numarası zorunludur.')
      }
      if (!isValidPhone(phone)) {
        return setErrorMsg('Telefon numarası 05XX XXX XXXX formatında olmalıdır.')
      }

      // Şifre
      if (!password) {
        return setErrorMsg('Şifre alanı zorunludur.')
      }
      if (password.length < 8) {
        return setErrorMsg('Şifre en az 8 karakter olmalıdır.')
      }
      if (!/[A-Za-z]/.test(password)) {
        return setErrorMsg('Şifre en az bir harf içermelidir.')
      }
      if (!/[0-9]/.test(password)) {
        return setErrorMsg('Şifre en az bir rakam içermelidir.')
      }
      if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
        return setErrorMsg('Şifre en az bir özel karakter içermelidir. (!@#$%^&*)')
      }

      // Öğrenci-özel validasyonlar
      if (role === 'student') {
        if (!age) {
          return setErrorMsg('Yaş alanı zorunludur.')
        }
        if (parseInt(age) < 5 || parseInt(age) > 18) {
          return setErrorMsg('Yaş 5 ile 18 arasında olmalıdır.')
        }
        if (!parentName.trim()) {
          return setErrorMsg('Veli adı zorunludur.')
        }
        if (parentName.trim().length < 2) {
          return setErrorMsg('Veli adı en az 2 karakter olmalıdır.')
        }
        if (/\d/.test(parentName)) {
          return setErrorMsg('Veli adı rakam içeremez.')
        }
        if (!parentPhone.trim()) {
          return setErrorMsg('Veli telefon numarası zorunludur.')
        }
        if (!isValidPhone(parentPhone)) {
          return setErrorMsg('Veli telefon numarası 05XX XXX XXXX formatında olmalıdır.')
        }
      }

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
          credentials: 'include',
          body: JSON.stringify(body)
        })
        const data = await response.json()
        if (response.ok) {
          login(data)
          const r = data.role.toLowerCase()
          if (r === 'admin') navigate('/admin/kurum-ozeti')
          else if (r === 'teacher') navigate('/teacher/ders-ozeti')
          else navigate('/student/derslerim')
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
          <img src="/logo.png" alt="LectureAI" className="login-logo" />
          <h1 className="brand-name">Lecture<span className="ai-highlight">AI</span></h1>
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
                <input type="tel" placeholder="05XX XXX XXXX" value={phone} onChange={(e) => setPhone(formatPhone(e.target.value))} maxLength={13} />
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
                <input type="tel" placeholder="05XX XXX XXXX" value={parentPhone} onChange={(e) => setParentPhone(formatPhone(e.target.value))} maxLength={13} />
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
