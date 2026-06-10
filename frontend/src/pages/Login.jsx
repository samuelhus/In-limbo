import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const res = await login(email, password);
    setLoading(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    const u = res.user;
    if (u.status === 'pending') return navigate('/wachtkamer');
    if (u.status === 'rejected') return navigate('/afgewezen');
    const to = location.state?.from || '/catalogus';
    navigate(to);
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-16" data-testid="login-page">
      <div className="w-full max-w-md">
        <p className="overline mb-4">{t('auth.login_title')}</p>
        <h1 className="text-4xl font-bold tracking-tight mb-10">
          {t('auth.login_subtitle')}
        </h1>

        <form onSubmit={onSubmit} className="space-y-5">
          <div>
            <label className="label-overline" htmlFor="email">{t('auth.email')}</label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input-flat"
              data-testid="login-email-input"
            />
          </div>
          <div>
            <label className="label-overline" htmlFor="password">{t('auth.password')}</label>
            <input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input-flat"
              data-testid="login-password-input"
            />
          </div>

          {error && (
            <p
              data-testid="login-error"
              className="text-sm bg-destructive/10 border border-destructive/40 text-destructive px-3 py-2"
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full"
            data-testid="login-submit-btn"
          >
            {loading ? t('common.saving') : t('auth.login_btn')}
          </button>

          <div className="text-center">
            <Link
              to="/wachtwoord-vergeten"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              data-testid="forgot-password-link"
            >
              {t('auth.forgot_password')}
            </Link>
          </div>
        </form>

        <p className="mt-8 text-sm text-muted-foreground">
          {t('auth.no_account')}{' '}
          <Link to="/registreer" className="industrial-link text-foreground" data-testid="login-to-register-link">
            {t('auth.register_link')}
          </Link>
        </p>
      </div>
    </div>
  );
}
