import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/api';

export default function WachtwoordReset() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const navigate = useNavigate();

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!token) navigate('/wachtwoord-vergeten');
  }, [token, navigate]);

  const handleSubmit = async () => {
    if (password.length < 8) {
      setError(t('auth.password_too_short'));
      return;
    }
    if (password !== confirm) {
      setError(t('auth.passwords_dont_match'));
      return;
    }
    setLoading(true);
    setError('');
    try {
      await api.post('/auth/reset-password', { token, newPassword: password });
      setSuccess(true);
      setTimeout(() => navigate('/login'), 3000);
    } catch (e) {
      const detail = e?.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : t('common.error_generic'));
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="max-w-md mx-auto px-4 py-24 text-center" data-testid="reset-success">
        <p className="overline mb-4">{t('auth.reset_title')}</p>
        <h1 className="text-3xl font-bold tracking-tight mb-4">{t('auth.reset_success_title')}</h1>
        <p className="text-foreground/70 text-sm">
          {t('auth.reset_success_body')}
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto px-4 py-24" data-testid="reset-page">
      <p className="overline mb-4">{t('nav.profile')}</p>
      <h1 className="text-3xl font-bold tracking-tight mb-2">{t('auth.reset_title')}</h1>
      <p className="text-foreground/70 text-sm mb-10">
        {t('auth.reset_subtitle')}
      </p>

      <div className="space-y-4">
        <input
          type="password"
          className="input-flat w-full"
          placeholder={t('auth.new_password')}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          data-testid="reset-password-input"
          autoFocus
        />
        <input
          type="password"
          className="input-flat w-full"
          placeholder={t('auth.confirm_password')}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          data-testid="reset-confirm-input"
        />
        {error && (
          <p className="text-destructive text-sm" data-testid="reset-error">{error}</p>
        )}
        <button
          onClick={handleSubmit}
          disabled={loading || !password || !confirm}
          className="btn-primary w-full"
          data-testid="reset-submit-btn"
        >
          {loading ? t('common.saving') : t('auth.reset_btn')}
        </button>
        <Link
          to="/wachtwoord-vergeten"
          className="block text-center text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          {t('auth.request_new_link')}
        </Link>
      </div>
    </div>
  );
}
