import React from 'react';
import { Info } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';

// PRD_Schat_of_Schroot.md §4.1: halfdoorzichtig info-icoon linksboven met de
// spelregels. Spelteksten komen uit de "game"-i18n-namespace (herbruik van
// het bestaande i18n-patroon, zie CLAUDE.md) i.p.v. een aparte backend-route —
// dit is statische, per-taal tekst zoals de rest van de UI-copy.
export default function InfoModal() {
  const { t } = useTranslation();
  const rules = t('game.rules.items', { returnObjects: true });

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label={t('game.rules.trigger_label')}
          data-testid="game-info-trigger"
          className="inline-flex items-center justify-center w-8 h-8 text-foreground/50 hover:text-foreground transition-colors"
        >
          <Info className="w-5 h-5" />
        </button>
      </DialogTrigger>
      <DialogContent data-testid="game-info-modal">
        <DialogHeader>
          <DialogTitle>{t('game.rules.heading')}</DialogTitle>
          <DialogDescription>{t('game.rules.intro')}</DialogDescription>
        </DialogHeader>
        <ul className="space-y-2 text-sm text-foreground/85 list-disc pl-5">
          {Array.isArray(rules) && rules.map((rule, i) => <li key={i}>{rule}</li>)}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
