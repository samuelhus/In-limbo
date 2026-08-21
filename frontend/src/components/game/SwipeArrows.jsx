import React from 'react';
import { Lightbulb, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

// PRD_Schat_of_Schroot.md §4.1/§8.4: klikbare pijlen als toegankelijkheids-
// alternatief voor de sleep-interactie — linkerpijl (vuilbak) = geen
// inspiratie, rechterpijl (lamp) = inspirerend. Geen verdere ontwikkeling
// nodig voor toegankelijkheid (PRD §8.4).
export default function SwipeArrows({ onSwipe, disabled }) {
  const { t } = useTranslation();
  return (
    <div className="max-w-sm mx-auto px-4 mt-6 flex items-center justify-center gap-10" data-testid="game-swipe-arrows">
      <button
        type="button"
        onClick={() => onSwipe('left')}
        disabled={disabled}
        aria-label={t('game.swipe.reject_label')}
        data-testid="game-swipe-left-btn"
        className="w-14 h-14 rounded-full flex items-center justify-center border border-border text-foreground/70 hover:text-destructive hover:border-destructive transition-colors disabled:opacity-50"
      >
        <Trash2 className="w-6 h-6" />
      </button>
      <button
        type="button"
        onClick={() => onSwipe('right')}
        disabled={disabled}
        aria-label={t('game.swipe.inspire_label')}
        data-testid="game-swipe-right-btn"
        className="w-14 h-14 rounded-full flex items-center justify-center border border-border text-foreground/70 hover:text-secondary hover:border-secondary transition-colors disabled:opacity-50"
      >
        <Lightbulb className="w-6 h-6" />
      </button>
    </div>
  );
}
