import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

// PRD_Schat_of_Schroot.md §4.2 stap 6: niet-eerste evaluator ziet de top-
// evaluaties (bij ex aequo: ALLE tied evaluaties, niet beperkt tot 2) + de
// eigen zonet ingevulde evaluatie, en kiest de beste. Definitief — geen
// bevestigingsstap, geen wijziging achteraf (vandaar geen "annuleren"-knop).
//
// Breder dan de rest van de spel-UI (max-w-lg i.p.v. max-w-sm) en met groter
// gezette tekst: sinds GamePlay.jsx de foto niet meer toont zodra deze stap
// bereikt is, is er ruimte over en verschuift de aandacht naar de antwoorden
// zelf (op vraag van product: "in het groot de evaluaties om uit te kiezen").
export default function ChooseBestPanel({ evaluations, onChoose }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [chosenId, setChosenId] = useState(null);

  const choose = async (id) => {
    if (busy) return;
    setBusy(true);
    setChosenId(id);
    await onChoose(id);
  };

  return (
    <div className="max-w-lg mx-auto px-4" data-testid="game-choose-best">
      <p className="overline mb-2">{t('game.choose.overline')}</p>
      <h2 className="text-2xl font-bold tracking-tight mb-1">{t('game.choose.heading')}</h2>
      <p className="text-base text-muted-foreground mb-6">{t('game.choose.intro')}</p>
      <ul className="space-y-4">
        {evaluations.map((ev) => (
          <li key={ev.id}>
            <button
              type="button"
              onClick={() => choose(ev.id)}
              disabled={busy}
              data-testid={`game-choose-option-${ev.id}`}
              className={`w-full text-left border border-border p-6 transition-colors hover:bg-[#ADEBB3]/40 disabled:opacity-60 ${
                chosenId === ev.id ? 'bg-[#ADEBB3]/40 border-foreground' : ''
              }`}
              style={{ borderRadius: 2 }}
            >
              {ev.isMine && <p className="overline text-xs mb-2">{t('game.choose.mine_tag')}</p>}
              <p className="text-lg font-medium">{ev.answer1}</p>
              <p className="text-lg text-foreground/75 mt-2">{ev.answer2}</p>
            </button>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground mt-6">{t('game.choose.definitive_note')}</p>
    </div>
  );
}
