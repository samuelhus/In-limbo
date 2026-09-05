import React, { useEffect, useState } from 'react';
import { api } from '@/lib/api';

// Wisselende banner met actieve kiosk-mededelingen (PRD §6.6) — enkel op het
// kiosk-startmenu (/kiosk), niet elders op de site. Toont er één tegelijk,
// wisselt na CYCLE_MS als er meerdere actief zijn; verversd de lijst zelf
// periodiek zodat een bericht dat een admin net (de)activeert ook verschijnt/
// verdwijnt zonder dat iemand het kiosk-toestel manueel herlaadt. Geen
// actieve berichten -> rendert null (geen lege balk/layoutverschuiving).
const POLL_MS = 60_000;
const CYCLE_MS = 6_000;

// Berichten zijn vrije, door de admin ingevoerde tekst in één taal (PRD §10)
// — enkel type-icoon/kleur worden hier vertaald/gestyled, nooit de tekst zelf.
const TYPE_STYLES = {
  hulp: 'bg-orange-100 text-orange-900 border-orange-300',
  evenement: 'bg-blue-100 text-blue-900 border-blue-300',
  mededeling: 'bg-muted text-foreground border-border',
};

const TYPE_ICONS = {
  hulp: '🆘',
  evenement: '📅',
  mededeling: 'ℹ️',
};

export default function KioskMessageBanner() {
  const [messages, setMessages] = useState([]);
  const [index, setIndex] = useState(0);

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

  useEffect(() => { setIndex(0); }, [messages.length]);

  useEffect(() => {
    if (messages.length <= 1) return undefined;
    const cycle = setInterval(() => setIndex((i) => (i + 1) % messages.length), CYCLE_MS);
    return () => clearInterval(cycle);
  }, [messages.length]);

  if (messages.length === 0) return null;
  const current = messages[index % messages.length];

  return (
    <div
      className={`w-full border px-4 py-3 mb-8 flex items-center gap-3 ${TYPE_STYLES[current.type] || TYPE_STYLES.mededeling}`}
      data-testid="kiosk-message-banner"
    >
      <span className="text-xl shrink-0" aria-hidden="true">{TYPE_ICONS[current.type] || TYPE_ICONS.mededeling}</span>
      <p className="text-sm font-medium" data-testid="kiosk-message-banner-text">{current.text}</p>
    </div>
  );
}
