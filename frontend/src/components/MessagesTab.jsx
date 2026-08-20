import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { MessageCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/api';

// Zelfde poll-interval als NotificationCenter.jsx (PRD_direct_messaging.md
// §9): 60 sec wanneer de gebruiker niet in een open gesprek zit. Er is nog
// geen gespreksvenster (dat komt in een latere fase), dus deze component
// pollt altijd aan dit tempo.
const POLL_MS = 60_000;

export default function MessagesTab() {
  const { t } = useTranslation();
  const [unreadCount, setUnreadCount] = useState(0);

  const load = useCallback(async () => {
    try {
      // Lichtgewicht badge-route (fase 6) — telt gesprekken met ongelezen
      // berichten, niet het totaal aantal berichten (PRD §6.3). Nog geen
      // GET /conversations/mine (die komt met de gesprekslijst).
      const { data } = await api.get('/conversations/unread-count');
      setUnreadCount(data.count);
    } catch { /* silent, zelfde patroon als NotificationCenter */ }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  return (
    <Link
      to="/berichten"
      className="relative p-2 hover:bg-muted transition-colors"
      aria-label={t('messages.open')}
      data-testid="messages-tab"
    >
      <MessageCircle className="w-5 h-5" />
      {unreadCount > 0 && (
        <span
          className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 inline-flex items-center justify-center text-[10px] font-bold text-white bg-red-600 rounded-full"
          data-testid="messages-tab-badge"
        >
          {unreadCount > 9 ? '9+' : unreadCount}
        </span>
      )}
    </Link>
  );
}
