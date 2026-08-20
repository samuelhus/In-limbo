import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { useAuth } from './AuthContext';

const MessagesContext = createContext(null);

// Zelfde poll-interval als de bestaande meldingen (PRD_direct_messaging.md
// §9) — 60 sec elders in de app, i.t.t. de kortere 10-15 sec-poll binnen
// een open gesprek (zie GesprekDetail.jsx).
const POLL_MS = 60_000;

// Eén gedeelde plek voor "heb ik ongelezen berichten?" (fase 9) — voorheen
// pollden Header.jsx (mobiele badge) en MessagesTab.jsx (desktop-icoon) dit
// allebei apart, met dubbele netwerkcalls tot gevolg. Nu is er ook 1 plek
// om `refresh()` aan te roepen zodat de badge onmiddellijk verdwijnt zodra
// een gesprek gelezen is, i.p.v. tot 60 sec te moeten wachten op de
// volgende poll (zie GesprekDetail.jsx::markRead).
export function MessagesProvider({ children }) {
  const { user } = useAuth();
  const isLoggedIn = user && typeof user === 'object';
  const [hasUnread, setHasUnread] = useState(false);

  const refresh = useCallback(async () => {
    if (!isLoggedIn) {
      setHasUnread(false);
      return;
    }
    try {
      const { data } = await api.get('/conversations/unread-count');
      setHasUnread(data.count > 0);
    } catch { /* silent, zelfde patroon als NotificationCenter */ }
  }, [isLoggedIn]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, POLL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  return (
    <MessagesContext.Provider value={{ hasUnread, refresh }}>
      {children}
    </MessagesContext.Provider>
  );
}

export const useMessages = () => useContext(MessagesContext);
