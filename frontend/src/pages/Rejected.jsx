import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';

export default function Rejected() {
  const { user, logout } = useAuth();
  const { t } = useTranslation();
  if (!user) return null;
  return (
    <div className="max-w-2xl mx-auto px-4 py-24" data-testid="rejected-page">
      <p className="overline mb-4 text-destructive">{t('pages.rejected_title')}</p>
      <h1 className="text-5xl font-bold tracking-tight">
        {t('pages.rejected_body')}
      </h1>
      {user.rejectionReason ? (
        <div className="mt-8 border-l-2 border-destructive pl-4">
          <p className="overline mb-1">{t('pages.rejected_body')}</p>
          <p className="text-foreground/85 leading-relaxed">{user.rejectionReason}</p>
        </div>
      ) : null}
      <p className="mt-8 text-foreground/80">
        {t('pages.rejected_contact')}
      </p>
      <div className="mt-10 flex flex-wrap gap-4">
        <Link to="/registreer" className="btn-primary" data-testid="rejected-reregister-btn">
          {t('nav.register')}
        </Link>
        <button onClick={logout} className="btn-secondary" data-testid="rejected-logout-btn">
          {t('nav.logout')}
        </button>
      </div>
    </div>
  );
}
