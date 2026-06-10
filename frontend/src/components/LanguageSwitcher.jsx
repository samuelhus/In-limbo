import React from 'react';
import { useTranslation } from 'react-i18next';

export default function LanguageSwitcher({ className = '' }) {
  const { i18n } = useTranslation();
  const current = (i18n.resolvedLanguage || i18n.language || 'nl').slice(0, 2);

  const setLang = (lng) => {
    if (lng === current) return;
    i18n.changeLanguage(lng);
  };

  const btn = (lng, label) => (
    <button
      key={lng}
      onClick={() => setLang(lng)}
      data-testid={`lang-switch-${lng}`}
      aria-pressed={current === lng}
      className={`text-xs uppercase tracking-widest transition-colors ${
        current === lng ? 'text-foreground font-semibold' : 'text-muted-foreground hover:text-foreground'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div
      className={`inline-flex items-center gap-1.5 ${className}`}
      data-testid="language-switcher"
    >
      {btn('nl', 'NL')}
      <span className="text-muted-foreground/50">·</span>
      {btn('fr', 'FR')}
    </div>
  );
}
