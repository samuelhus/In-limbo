import React from 'react';
import { Info } from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';

/**
 * Klein "ⓘ"-icoontje dat bij hover/focus een toelichting toont.
 * Gebruik: <InfoHint text={t('register.email_hint')} />
 *
 * Bevat zijn eigen TooltipProvider, zodat dit component overal in de app
 * gebruikt kan worden zonder dat er een globale Provider gemonteerd moet zijn.
 */
export default function InfoHint({ text, testId }) {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            // tabIndex=-1: dit info-icoontje mag niet in de Tab-volgorde
            // van het formulier zitten (het onderbreekt anders de logische
            // sprong van het ene invoerveld naar het volgende) — het blijft
            // wel gewoon bereikbaar via hover/klik/tap.
            tabIndex={-1}
            aria-label={text}
            data-testid={testId}
            className="inline-flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors align-middle ml-1"
          >
            <Info className="w-3.5 h-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-[240px] text-center normal-case">
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
