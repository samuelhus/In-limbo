import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/api';

export default function WachtwoordVergeten() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!email) return;
    setLoading(true);
    setError('');
    try {
      await api.post('/auth/forgot-password', { email });
      setSubmitted(true);
    } catch (e) {
      const detail = e?.response?.data?.detail;
      if (e?.response?.status === 429 && typeof detail === 'string') {
        setError(detail);
      } else {
        setError(t('common.error_generic'));
      }
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="max-w-md mx-auto px-4 py-24 text-center" data-testid="forgot-success">
        <p className="overline mb-4">{t('auth.forgot_title')}</p>
        <h1 className="text-3xl font-bold tracking-tight mb-4">
          {t('auth.forgot_success_title')}
        </h1>
        <p className="text-foreground/70 text-sm leading-relaxed mb-8">
          {t('auth.forgot_success_body')}
        </p>
        <Link to="/login" className="industrial-link text-sm" data-testid="forgot-back-to-login">
          {t('auth.back_to_login')}
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto px-4 py-24" data-testid="forgot-page">
      <p className="overline mb-4">{t('nav.profile')}</p>
      <h1 className="text-3xl font-bold tracking-tight mb-2">{t('auth.forgot_title')}</h1>
      <p className="text-foreground/70 text-sm mb-10">
        {t('auth.forgot_subtitle')}
      </p>

      <div className="space-y-4">
        <input
          type="email"
          className="input-flat w-full"
          placeholder="jouw@email.be"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          data-testid="forgot-email-input"
          autoFocus
        />
        {error && (
          <p className="text-destructive text-sm" data-testid="forgot-error">{error}</p>
        )}
        <button
          onClick={handleSubmit}
          disabled={loading || !email}
          className="btn-primary w-full"
          data-testid="forgot-submit-btn"
        >
          {loading ? t('common.saving') : t('auth.forgot_btn')}
        </button>
        <Link
          to="/login"
          className="block text-center text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          {t('auth.back_to_login')}
        </Link>
      </div>
    </div>
  );
}
