import React from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useKiosk } from '@/contexts/KioskContext';

// Zwevende "terug naar start"-knop (PRD §5/§6.2) — enkel zichtbaar wanneer
// kiosk-modus actief is en de bezoeker niet al op /kiosk zelf staat.
// position: fixed, dus los van de paginalayout (geen herschikking van
// bestaande content) — voldoet aan "geen impact op reguliere bezoekers".
export default function KioskReturnButton() {
  const { t } = useTranslation();
  const kiosk = useKiosk();
  const { pathname } = useLocation();

  if (!kiosk?.kioskActive || pathname === '/kiosk') return null;

  const handleClick = () => {
    if (!window.confirm(t('kiosk.return_confirm'))) return;
    kiosk.resetToStart();
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="fixed bottom-6 right-6 z-[90] btn-primary shadow-lg"
      data-testid="kiosk-return-btn"
    >
      {t('kiosk.return_btn')}
    </button>
  );
}
