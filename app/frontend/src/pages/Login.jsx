import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { UtensilsCrossed, Eye, EyeOff, AlertCircle, Moon, Sun } from 'lucide-react';
import './Login.css';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    return localStorage.getItem('theme-mode') === 'dark' || 
           window.matchMedia('(prefers-color-scheme: dark)').matches
  })
  const { login } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.setAttribute('data-theme', 'dark')
      document.body.style.backgroundColor = '#0f172a'
    } else {
      document.documentElement.removeAttribute('data-theme')
      document.body.style.backgroundColor = '#f8fafc'
    }
    localStorage.setItem('theme-mode', isDarkMode ? 'dark' : 'light')
  }, [isDarkMode])

  const toggleTheme = () => {
    setIsDarkMode(prev => !prev)
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const userData = await login(username, password);
      if (userData.user.role === 'cashier') {
        navigate('/pos')
      } else {
        navigate('/dashboard')
      };
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <button 
        className="login-theme-toggle"
        onClick={toggleTheme}
        title={isDarkMode ? 'وضع فاتح' : 'وضع داكن'}
        aria-label="تبديل وضع المظهر"
      >
        {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
      </button>

      <div className="login-background">
        <div className="login-pattern"></div>
      </div>

      <div className="login-card">
        <div className="login-header">
          <div className="login-logo">
            <UtensilsCrossed size={48} />
          </div>
          <h1>نظام إدارة المطاعم</h1>
          <p className="login-subtitle">نقطة البيع الذكية</p>
        </div>

        {error && (
          <div className="login-error">
            <AlertCircle size={20} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label htmlFor="username">اسم المستخدم</label>
            <div className="input-wrapper">
              <input
                id="username"
                type="text"
                placeholder="أدخل اسم المستخدم"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="form-input"
                autoComplete="username"
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="password">كلمة المرور</label>
            <div className="input-wrapper">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                placeholder="أدخل كلمة المرور"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="form-input"
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
          </div>

          <button type="submit" className="btn btn-primary btn-lg w-full login-btn" disabled={loading}>
            {loading ? (
              <>
                <div className="spinner-small"></div>
                <span>جاري تسجيل الدخول...</span>
              </>
            ) : (
              'تسجيل الدخول'
            )}
          </button>
        </form>

      
      </div>
    </div>
  );
}
