import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff } from 'lucide-react'
import { useAuth } from './context/AuthContext.jsx'
import './Login.css'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [isLogin, setIsLogin] = useState(true)
  const [isForgotPasswordView, setIsForgotPasswordView] = useState(false)
  const [role, setRole] = useState('student')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [forgotEmail, setForgotEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newPasswordRepeat, setNewPasswordRepeat] = useState('')
  const [showMainPassword, setShowMainPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showNewPasswordRepeat, setShowNewPasswordRepeat] = useState(false)
  const [forgotPasswordSuccess, setForgotPasswordSuccess] = useState('')
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

  const validatePassword = (value) => {
    if (value.length < 8) return 'Şifre en az 8 karakter olmalıdır.'
    if (!/[A-Za-z]/.test(value)) return 'Şifre en az bir harf içermelidir.'
    if (!/[0-9]/.test(value)) return 'Şifre en az bir rakam içermelidir.'
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(value)) {
      return 'Şifre en az bir özel karakter içermelidir. (!@#$%^&*)'
    }
    return ''
  }

  const handleForgotPasswordSubmit = async (e) => {
    e.preventDefault()
    setErrorMsg('')
    setForgotPasswordSuccess('')

    if (!forgotEmail.trim()) {
      return setErrorMsg('E-posta adresi zorunludur.')
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(forgotEmail)) {
      return setErrorMsg('Geçerli bir e-posta adresi giriniz. (örn: ad@mail.com)')
    }
    const passwordValidationError = validatePassword(newPassword)
    if (passwordValidationError) {
      return setErrorMsg(passwordValidationError)
    }
    if (newPassword !== newPasswordRepeat) {
      return setErrorMsg('Yeni şifre ve tekrar şifresi aynı olmalıdır.')
    }

    try {
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: forgotEmail, newPassword, newPasswordRepeat })
      })
      const data = await response.json()
      if (!response.ok) {
        return setErrorMsg(data.error || 'Şifre sıfırlama başarısız oldu.')
      }
      setForgotPasswordSuccess('Şifreniz başarıyla güncellendi. Yeni şifrenizle giriş yapabilirsiniz.')
      setNewPassword('')
      setNewPasswordRepeat('')
    } catch (err) {
      setErrorMsg('Sunucuya bağlanılamadı. Lütfen backend sunucusunun çalıştığından emin olun.')
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

        {!isForgotPasswordView && (
        <div className="role-tabs">
          <button className={role === 'student' ? 'active' : ''} onClick={() => setRole('student')}>Öğrenci</button>
          <button className={role === 'teacher' ? 'active' : ''} onClick={() => setRole('teacher')}>Eğitmen</button>
          <button className={role === 'admin' ? 'active' : ''} onClick={() => setRole('admin')}>Yönetici</button>
        </div>
        )}

        {!isForgotPasswordView ? (
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
            <div className="password-input-wrap">
              <input
                type={showMainPassword ? 'text' : 'password'}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="password-input-with-icon"
              />
              <button
                type="button"
                className="password-toggle-icon-btn"
                onClick={() => setShowMainPassword((prev) => !prev)}
                aria-label={showMainPassword ? 'Şifreyi gizle' : 'Şifreyi göster'}
              >
                {showMainPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {isLogin && (
              <a
                href="#"
                className="forgot-password-inline-link"
                onClick={(e) => {
                  e.preventDefault()
                  setIsForgotPasswordView(true)
                }}
              >
                Şifremi unuttum
              </a>
            )}
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
        ) : (
          <form onSubmit={handleForgotPasswordSubmit} className="login-form forgot-password-view">
            {errorMsg && (
              <div style={{color: '#f43f5e', background: '#ffe4e6', padding: '0.75rem', borderRadius: '8px', fontSize: '0.85rem', marginBottom: '1rem', textAlign: 'center'}}>
                {errorMsg}
              </div>
            )}
            {forgotPasswordSuccess && (
              <div style={{color: '#166534', background: '#dcfce7', padding: '0.75rem', borderRadius: '8px', fontSize: '0.85rem', marginBottom: '1rem', textAlign: 'center'}}>
                {forgotPasswordSuccess}
              </div>
            )}
            <div className="input-group">
              <label>EMAIL</label>
              <input type="email" placeholder="ornek@mail.com" value={forgotEmail} onChange={(e) => setForgotEmail(e.target.value)} required />
            </div>
            <div className="input-group">
              <label>YENİ ŞİFRE</label>
              <div className="password-input-wrap">
                <input
                  type={showNewPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  className="password-input-with-icon"
                />
                <button
                  type="button"
                  className="password-toggle-icon-btn"
                  onClick={() => setShowNewPassword((prev) => !prev)}
                  aria-label={showNewPassword ? 'Şifreyi gizle' : 'Şifreyi göster'}
                >
                  {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <div className="input-group">
              <label>YENİ ŞİFRE (TEKRAR)</label>
              <div className="password-input-wrap">
                <input
                  type={showNewPasswordRepeat ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={newPasswordRepeat}
                  onChange={(e) => setNewPasswordRepeat(e.target.value)}
                  required
                  className="password-input-with-icon"
                />
                <button
                  type="button"
                  className="password-toggle-icon-btn"
                  onClick={() => setShowNewPasswordRepeat((prev) => !prev)}
                  aria-label={showNewPasswordRepeat ? 'Şifreyi gizle' : 'Şifreyi göster'}
                >
                  {showNewPasswordRepeat ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <button type="submit" className="login-submit-btn">
              Şifreyi Güncelle
            </button>
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault()
                setErrorMsg('')
                setForgotPasswordSuccess('')
                setIsForgotPasswordView(false)
              }}
            >
              Giriş ekranına dön
            </a>
          </form>
        )}

        {!isForgotPasswordView && (
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
        )}
      </div>
    </div>
  )
}
