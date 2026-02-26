import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../utils/AuthContext';
import { useLanguage } from '../utils/LanguageContext';

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  const { login } = useAuth();
  const { t, language, setLanguage } = useLanguage();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const result = await login(email, password);
    
    if (result.success) {
      navigate('/dashboard');
    } else {
      setError(result.error);
    }
    
    setLoading(false);
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
          <select 
            className="form-select" 
            style={{ width: 'auto' }}
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
          >
            <option value="he">עברית</option>
            <option value="en">English</option>
            <option value="pt">Português</option>
          </select>
        </div>
        
        <h2>{t('app_name')}</h2>
        <h3 style={{ textAlign: 'center', marginBottom: '1.5rem', color: '#7f8c8d' }}>
          {t('login')}
        </h3>

        {error && (
          <div className="alert alert-error">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">{t('email')}</label>
            <input
              type="email"
              className="form-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">{t('password')}</label>
            <input
              type="password"
              className="form-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button 
            type="submit" 
            className="btn btn-primary" 
            style={{ width: '100%' }}
            disabled={loading}
          >
            {loading ? t('loading') : t('login')}
          </button>
        </form>

        <div className="auth-footer">
          <p>
            {t('register')}?{' '}
            <Link to="/register" className="auth-link">
              {t('register')}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default Login;
