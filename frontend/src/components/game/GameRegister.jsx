import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useGameAuth } from '@/contexts/GameAuthContext';
import { Checkbox } from '@/components/ui/checkbox';

// PRD_Schat_of_Schroot.md §3: username + email, geen wachtwoord (email
// fungeert als toegangssleutel). Nieuwe username -> account; bestaande
// username + zelfde email -> login; bestaande username + ander email ->
// foutmelding. GDPR-consent is verplicht (ontwerpbeslissing, zie plan).
export default function GameRegister() {
  const { t } = useTranslation();
  const { register } = useGameAuth();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!consent) {
      setError(t('game.register.consent_required'));
      return;
    }
    setBusy(true);
    setError('');
    const result = await register(username.trim(), email.trim(), consent);
    setBusy(false);
    if (!result.ok) setError(result.error);
  };

  return (
    <div className="max-w-sm mx-auto px-4 py-16" data-testid="game-register">
      <p className="overline mb-2">{t('game.title')}</p>
      <h1 className="text-3xl font-bold tracking-tight mb-2">{t('game.register.heading')}</h1>
      <p className="text-muted-foreground mb-8">{t('game.register.intro')}</p>
      <form onSubmit={submit} className="space-y-5">
        <div>
          <label className="label-overline" htmlFor="game-username">{t('game.register.username_label')}</label>
          <input
            id="game-username"
            className="input-flat"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            minLength={2}
            maxLength={30}
            data-testid="game-username-input"
          />
        </div>
        <div>
          <label className="label-overline" htmlFor="game-email">{t('game.register.email_label')}</label>
          <input
            id="game-email"
            type="email"
            className="input-flat"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            data-testid="game-email-input"
          />
          <p className="text-xs text-muted-foreground mt-1">{t('game.register.email_hint')}</p>
        </div>
        <label className="flex items-start gap-2 text-sm cursor-pointer">
          <Checkbox
            checked={consent}
            onCheckedChange={(v) => setConsent(!!v)}
            className="mt-0.5"
            data-testid="game-consent-checkbox"
          />
          <span>{t('game.register.consent_label')}</span>
        </label>
        {error && <p className="text-destructive text-sm" data-testid="game-register-error">{error}</p>}
        <button type="submit" disabled={busy} className="btn-primary w-full" data-testid="game-register-submit">
          {busy ? t('game.register.submitting') : t('game.register.submit')}
        </button>
      </form>
    </div>
  );
}
