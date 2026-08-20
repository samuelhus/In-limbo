import React, { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, formatApiError } from '@/lib/api';
import { cloudinaryThumb } from '@/lib/cloudinary';
import { useMessages } from '@/contexts/MessagesContext';

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

// Gesprekslijst (fase 7, PRD_direct_messaging.md §6.3) — fase 9 hertekent
// deze pagina naar dezelfde stijl als MijnAanbiedingen.jsx: gegroepeerd per
// status (In behandeling/Afgehandeld) met een aantal per groep, de
// listingfoto + -titel prominent, een knop naar de aanbieding zelf, en
// bewust géén berichtinhoud (dat blijft voorbehouden aan het gespreksvenster
// zelf). "Afgehandeld" (handledBy) is een apart, omkeerbaar statusveld —
// los van écht verwijderen, dat via de ×-knop hieronder blijft werken.
const STATUS_GROUPS = [
  { key: 'active', labelKey: 'messages.group_active' },
  { key: 'handled', labelKey: 'messages.group_handled' },
];

export default function Berichten() {
  const { t, i18n } = useTranslation();
  const lang = (i18n.resolvedLanguage || 'nl').slice(0, 2);
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const navigate = useNavigate();
  const { refresh: refreshBadge } = useMessages();

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/conversations/mine');
      setItems(data);
    } catch (e) {
      setError(formatApiError(e));
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Afgehandeld/terugzetten (fase 9) — puur organisatorisch, wijzigt enkel
  // welke sectie het gesprek toont; blijft gewoon in de lijst staan.
  const toggleHandled = async (e, conv) => {
    e.preventDefault();
    e.stopPropagation();
    setBusyId(conv.id);
    try {
      const path = conv.handledByMe ? 'unmark-handled' : 'mark-handled';
      await api.patch(`/conversations/${conv.id}/${path}`);
      setItems((prev) => prev.map((c) => (c.id === conv.id ? { ...c, handledByMe: !conv.handledByMe } : c)));
    } catch (err) {
      alert(formatApiError(err));
    } finally {
      setBusyId(null);
    }
  };

  // Verwijderen (PRD §6.5) — soft-delete: verdwijnt enkel uit mijn eigen
  // lijst, de andere partij behoudt het gesprek volledig, en het verschijnt
  // bij mij terug zodra er een nieuw bericht binnenkomt (zie
  // backend/routes/conversations.py::hide_conversation). Optimistische
  // update i.p.v. herladen, zelfde patroon als Notificaties.jsx::remove.
  const hide = async (e, conversationId) => {
    e.preventDefault();
    e.stopPropagation();
    if (!window.confirm(t('messages.confirm_hide'))) return;
    try {
      await api.delete(`/conversations/${conversationId}`);
      setItems((prev) => prev.filter((c) => c.id !== conversationId));
      // Een verborgen gesprek met ongelezen berichten telt niet meer mee
      // (zie _my_conversations_filter) — ververs de badge meteen i.p.v. tot
      // 60 sec te wachten op de volgende poll.
      refreshBadge();
    } catch (err) {
      alert(formatApiError(err));
    }
  };

  if (items === null) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-24 text-muted-foreground" data-testid="berichten-loading">
        {t('common.loading')}
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-24">
        <p className="text-destructive" data-testid="berichten-error">{error}</p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-24" data-testid="berichten-empty">
        <p className="overline mb-3">{t('messages.title')}</p>
        <h1 className="text-4xl font-bold tracking-tight">{t('messages.empty')}</h1>
      </div>
    );
  }

  const grouped = STATUS_GROUPS.map((g) => ({
    ...g, items: items.filter((c) => (g.key === 'handled' ? c.handledByMe : !c.handledByMe)),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-10 py-12" data-testid="berichten-page">
      <p className="overline">{t('messages.title')} · {items.length}</p>
      <h1 className="mt-2 text-4xl font-bold tracking-tight mb-10">{t('messages.title')}</h1>

      {grouped.map((g) => (
        <section key={g.key} className="mb-12" data-testid={`berichten-group-${g.key}`}>
          <p className="overline mb-4">{t(g.labelKey)} · {g.items.length}</p>
          <ul className="space-y-3">
            {g.items.map((c) => (
              <li key={c.id} data-testid={`berichten-item-${c.id}`}>
                <div
                  role="link"
                  tabIndex={0}
                  onClick={() => navigate(`/berichten/${c.id}`)}
                  onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && navigate(`/berichten/${c.id}`)}
                  className={`cursor-pointer border-l-4 bg-surface px-4 py-3 flex items-center gap-4 hover:bg-muted/60 transition-colors ${
                    c.unreadCount > 0 ? 'border-[#34D399]' : 'border-border'
                  }`}
                >
                  <div className="w-16 h-16 bg-muted overflow-hidden flex-shrink-0">
                    {c.listingPhoto && (
                      <img src={cloudinaryThumb(c.listingPhoto, 200, 200)} alt="" className="w-full h-full object-cover" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`truncate ${c.unreadCount > 0 ? 'font-semibold' : 'font-medium'}`} data-testid={`berichten-item-title-${c.id}`}>
                      {c.listingTitle}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1 truncate">
                      {c.otherPartyName || t('messages.unknown_party')} · {timeAgo(c.lastMessageAt || c.createdAt, lang)}
                    </p>
                  </div>
                  {c.unreadCount > 0 && (
                    // Fase 9: enkel een stip, geen berichtinhoud/aantal — die
                    // blijft voorbehouden aan het gespreksvenster zelf.
                    <span
                      className="w-2.5 h-2.5 rounded-full bg-red-600 flex-shrink-0"
                      data-testid={`berichten-item-unread-${c.id}`}
                      aria-label={t('messages.unread_indicator')}
                      title={t('messages.unread_indicator')}
                    />
                  )}
                  <Link
                    to={`/aanbieding/${c.listingId}`}
                    onClick={(e) => e.stopPropagation()}
                    className="btn-secondary !py-1 px-3 text-xs whitespace-nowrap"
                    data-testid={`berichten-view-listing-${c.id}`}
                  >
                    {t('notifications.view_listing')}
                  </Link>
                  <button
                    onClick={(e) => toggleHandled(e, c)}
                    disabled={busyId === c.id}
                    className="btn-secondary !py-1 px-3 text-xs whitespace-nowrap"
                    data-testid={`berichten-toggle-handled-${c.id}`}
                  >
                    {c.handledByMe ? t('messages.mark_active_btn') : t('messages.mark_handled_btn')}
                  </button>
                  <button
                    onClick={(e) => hide(e, c.id)}
                    className="text-muted-foreground hover:text-destructive text-lg leading-none px-2 shrink-0"
                    data-testid={`berichten-hide-${c.id}`}
                    aria-label={t('messages.hide_btn')}
                    title={t('messages.hide_btn')}
                  >
                    ×
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
