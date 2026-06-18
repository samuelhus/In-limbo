import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';

export default function Pending() {
  const { user, logout } = useAuth();
  const { t } = useTranslation();
  if (!user) return null;
  return (
    <div className="max-w-2xl mx-auto px-4 py-24" data-testid="pending-page">
      <p className="overline mb-4">{t('pages.pending_title')}</p>
      <h1 className="text-5xl font-bold tracking-tight">
        {t('pages.pending_heading_before')}{' '}
        <em className="not-italic underline decoration-2 underline-offset-8">in limbo</em>
        {t('pages.pending_heading_after')}
      </h1>
      <p className="mt-6 text-lg leading-relaxed text-foreground/80">
        {t('pages.pending_body')}
      </p>
      <div className="mt-10 flex flex-wrap gap-4">
        <Link to="/catalogus" className="btn-primary" data-testid="pending-catalogus-btn">
          {t('nav.catalogus')}
        </Link>
        <button onClick={logout} className="btn-secondary" data-testid="pending-logout-btn">
          {t('nav.logout')}
        </button>
      </div>
    </div>
  );
}
