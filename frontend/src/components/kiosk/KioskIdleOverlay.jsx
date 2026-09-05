import React from 'react';
import { useTranslation } from 'react-i18next';
import { useKiosk } from '@/contexts/KioskContext';

// Full-screen aftelklok-overlay (PRD §6.3) — verschijnt bij 280s inactiviteit,
// telt naar 0 (=300s totaal) waarna KioskContext zelf de reset-routine
// uitvoert. Elke interactie met de overlay (klik/toets/aanraking, niet enkel
// de knop) telt via de document-brede listeners in KioskContext al als
// activiteit — geen stopPropagation hier, anders zou dat niet meer werken.
export default function KioskIdleOverlay() {
  const { t } = useTranslation();
  const kiosk = useKiosk();

  if (!kiosk?.kioskActive || kiosk.idleSecondsRemaining === null) return null;

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center px-4"
      data-testid="kiosk-idle-overlay"
    >
      <div className="bg-background border border-border max-w-md w-full p-8 text-center" style={{ borderRadius: 2 }}>
        <p className="overline mb-3">{t('kiosk.idle.overline')}</p>
        <h2 className="text-2xl font-bold tracking-tight mb-6" data-testid="kiosk-idle-countdown">
          {t('kiosk.idle.message', { seconds: kiosk.idleSecondsRemaining })}
        </h2>
        <button
          type="button"
          onClick={kiosk.stayActive}
          className="btn-primary"
          data-testid="kiosk-idle-stay-btn"
        >
          {t('kiosk.idle.stay_btn')}
        </button>
      </div>
    </div>
  );
}
