import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, formatApiError } from '@/lib/api';

// Zelfde timeAgo-logica als NotificationCenter.jsx — bewust hier opnieuw
// gedefinieerd i.p.v. gedeeld, zelfde patroon als Notificaties.jsx.
function timeAgo(iso, lang = 'nl') {
  if (!iso) return '';
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  const labels = lang === 'fr'
    ? { now: "à l'instant", min: 'min', h: 'h', d: 'j' }
    : { now: 'zojuist', min: 'min geleden', h: 'u geleden', d: 'd geleden' };
  if (diff < 60) return labels.now;
  if (diff < 3600) return `${Math.floor(diff / 60)} ${labels.min}`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} ${labels.h}`;
  if (diff < 7 * 86400) return `${Math.floor(diff / 86400)} ${labels.d}`;
  const locale = lang === 'fr' ? 'fr-BE' : 'nl-BE';
  return new Date(iso).toLocaleDateString(locale, { day: 'numeric', month: 'short' });
}

// Gesprekslijst (fase 7, PRD_direct_messaging.md §6.3): naam tegenpartij,
// listingtitel, laatste berichtfragment, tijdstip en ongelezen-indicator
// per gesprek — data komt van GET /conversations/mine (fase 7).
export default function Berichten() {
  const { t, i18n } = useTranslation();
  const lang = (i18n.resolvedLanguage || 'nl').slice(0, 2);
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/conversations/mine');
      setItems(data);
    } catch (e) {
      setError(formatApiError(e));
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="max-w-3xl mx-auto px-4 py-12" data-testid="berichten-page">
      <p className="overline mb-2">{t('messages.title')}</p>
      <h1 className="text-4xl font-bold tracking-tight mb-10">{t('messages.title')}</h1>

      {error && <p className="text-destructive" data-testid="berichten-error">{error}</p>}
      {items === null && !error && <p className="text-muted-foreground">{t('common.loading')}</p>}
      {items && items.length === 0 && (
        <p className="text-muted-foreground" data-testid="berichten-empty">{t('messages.empty')}</p>
      )}

      {items && items.length > 0 && (
        <ul className="divide-y divide-border border-y border-border">
          {items.map((c) => (
            <li key={c.id}>
              <Link
                to={`/berichten/${c.id}`}
                data-testid={`berichten-item-${c.id}`}
                className={`block py-4 pl-4 hover:bg-muted transition-colors ${
                  c.unreadCount > 0 ? 'border-l-2 border-[#34D399] bg-muted/30' : ''
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className={`text-sm ${c.unreadCount > 0 ? 'text-foreground font-semibold' : 'text-foreground/85 font-medium'}`}>
                    {c.otherPartyName || t('messages.unknown_party')}
                  </p>
                  <span className="text-xs text-muted-foreground shrink-0" data-testid={`berichten-item-time-${c.id}`}>
                    {timeAgo(c.lastMessageAt || c.createdAt, lang)}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{c.listingTitle}</p>
                <p className={`text-sm mt-1 truncate ${c.unreadCount > 0 ? 'text-foreground/90' : 'text-muted-foreground'}`}>
                  {c.lastMessagePreview || t('messages.no_messages_yet')}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
