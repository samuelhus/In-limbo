import React from 'react';
import { useTranslation } from 'react-i18next';

// Placeholder voor de "Berichten"-tab (fase 6, PRD_direct_messaging.md §6.3).
// Bevat bewust geen gesprekslijst of -venster — die komen in een latere
// fase van de rollout. Deze pagina bestaat enkel zodat de tab in Header.jsx
// ergens naartoe kan linken i.p.v. een dode link.
export default function Berichten() {
  const { t } = useTranslation();

  return (
    <div className="max-w-3xl mx-auto px-4 py-12" data-testid="berichten-page">
      <p className="overline mb-2">{t('messages.title')}</p>
      <h1 className="text-4xl font-bold tracking-tight mb-6">{t('messages.title')}</h1>
      <p className="text-muted-foreground" data-testid="berichten-coming-soon">
        {t('messages.coming_soon')}
      </p>
    </div>
  );
}
