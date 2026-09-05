import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/api';

// Toont ALLE actieve kiosk-mededelingen tegelijk, onder de 4 tegels (PRD
// §6.6, aangepast op vraag van product: geen cyclus meer, altijd alles
// zichtbaar). Ververst zelf periodiek zodat een bericht dat een admin net
// (de)activeert ook verschijnt/verdwijnt zonder dat iemand het kiosk-toestel
// manueel herlaadt. Alle types delen hetzelfde neutrale megafoon-icoon en
// dezelfde stijl — het `type`-veld blijft bestaan in het datamodel en wordt
// nog apart getoond in het beheertabblad (AdminKiosk.jsx), enkel de visuele
// behandeling hier is uniform. Geen actieve berichten -> rendert null (geen
// dangling "Aankondigingen"-titel boven een lege lijst).
const POLL_MS = 60_000;

export default function KioskMessageBanner() {
  const { t } = useTranslation();
  const [messages, setMessages] = useState([]);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      api.get('/kiosk/messages')
        .then(({ data }) => { if (!cancelled) setMessages(data); })
        .catch(() => { /* stil falen — de banner is niet kritiek voor de kiosk-flow */ });
    };
    load();
    const poll = setInterval(load, POLL_MS);
    return () => { cancelled = true; clearInterval(poll); };
  }, []);

  if (messages.length === 0) return null;

  return (
    <div className="mt-12" data-testid="kiosk-message-banner">
      <p className="overline mb-4 text-center">{t('kiosk.announcements_heading')}</p>
      <div className="space-y-3">
        {messages.map((m) => (
          <div
            key={m.id}
            className="border border-border bg-surface px-4 py-3 flex items-center gap-3"
            data-testid={`kiosk-message-${m.id}`}
          >
            <span className="text-xl shrink-0" aria-hidden="true">📣</span>
            <p className="text-lg font-medium" data-testid="kiosk-message-banner-text">{m.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
