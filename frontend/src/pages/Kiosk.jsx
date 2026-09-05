import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useKiosk } from '@/contexts/KioskContext';
import KioskMessageBanner from '@/components/kiosk/KioskMessageBanner';

// Kiosk-startmenu (PRD §6.1) — publiek, geen <ProtectedRoute>, zelfde patroon
// als /checkout. Vier grote tegels naar de bestaande, al-publieke pagina's;
// geen wijziging aan die pagina's zelf. Onvermeld in de site-navigatie (§4).
const TILES = [
  { key: 'checkout', to: '/checkout' },
  { key: 'catalogus', to: '/catalogus' },
  { key: 'spel', to: '/spel' },
  { key: 'inspiratie', to: '/inspiratie' },
];

export default function Kiosk() {
  const { t } = useTranslation();
  const kiosk = useKiosk();

  // Idempotent: zet de il_kiosk_mode-vlag, ook als hij al aan staat (§6.1).
  useEffect(() => {
    kiosk?.activateKiosk();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen bg-background" data-testid="kiosk-page">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16">
        <KioskMessageBanner />

        <p className="overline mb-3 text-center">In Limbo · {t('kiosk.overline')}</p>
        <h1 className="text-4xl font-bold tracking-tight mb-12 text-center">{t('kiosk.title')}</h1>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {TILES.map((tile) => (
            <Link
              key={tile.key}
              to={tile.to}
              className="border border-border bg-surface px-6 py-10 text-center transition-all duration-200 hover:border-foreground hover:-translate-y-1"
              data-testid={`kiosk-tile-${tile.key}`}
            >
              <span className="text-2xl font-bold tracking-tight">{t(`kiosk.tiles.${tile.key}`)}</span>
            </Link>
          ))}
        </div>

        <KioskDisableAction />
      </div>
    </div>
  );
}

// Kleine, bewuste UI-actie om kiosk-modus weer uit te schakelen (§6.5) —
// bewust geen wachtwoord/PIN (§11), enkel deze extra tussenstap om per-
// ongeluk-uitschakelen door een gewone kioskgebruiker te vermijden.
function KioskDisableAction() {
  const { t } = useTranslation();
  const kiosk = useKiosk();

  const handleDisable = () => {
    if (!window.confirm(t('kiosk.disable_confirm'))) return;
    kiosk?.deactivateKiosk();
  };

  return (
    <div className="text-center mt-16">
      <button
        type="button"
        onClick={handleDisable}
        className="text-muted-foreground hover:text-foreground text-xs tracking-widest"
        aria-label={t('kiosk.disable_btn_label')}
        data-testid="kiosk-disable-btn"
      >
        •••
      </button>
    </div>
  );
}
