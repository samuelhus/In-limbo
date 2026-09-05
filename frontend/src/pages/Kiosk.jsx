import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useKiosk } from '@/contexts/KioskContext';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';
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
  const auth = useAuth();

  // Idempotent: zet de il_kiosk_mode-vlag, ook als hij al aan staat (§6.1).
  // Logt daarnaast altijd in als het ene vaste kiosk-account (POST
  // /auth/kiosk-login) — dat overschrijft de bestaande il_token-cookie, wat
  // meteen ook uitlogt wie hier toevallig al op dit toestel ingelogd was.
  // Dit gebeurt bij elk bezoek aan /kiosk, dus ook nadat de idle-reset of de
  // "terug naar start"-knop (KioskContext::resetToStart) hierheen navigeert
  // — geen aparte logica daar nodig. Los van de il_kiosk_mode-vlag hierboven:
  // dit is een echt, beperkt account (role=="kiosk"), geen localStorage-vlag.
  useEffect(() => {
    kiosk?.activateKiosk();
    api.post('/auth/kiosk-login').catch(() => {}).finally(() => auth?.refresh());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen bg-background" data-testid="kiosk-page">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16">
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

        <KioskMessageBanner />

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
