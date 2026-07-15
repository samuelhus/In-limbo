import React, { useState } from 'react';
import { X } from 'lucide-react';
import { Trans, useTranslation } from 'react-i18next';

const FEEDBACK_EMAIL = 'samuel@inlimbo.brussels';

export default function TestBanner() {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(() => {
    try {
      return sessionStorage.getItem('testBannerDismissed') !== 'true';
    } catch {
      return true;
    }
  });

  if (!visible) return null;

  const dismiss = () => {
    setVisible(false);
    try {
      sessionStorage.setItem('testBannerDismissed', 'true');
    } catch {
      // sessionStorage niet beschikbaar, negeren
    }
  };

  return (
    <div className="bg-[#ADEBB3] border-b border-border" data-testid="test-banner">
      <div className="max-w-6xl mx-auto px-4 py-2.5 flex items-center gap-3 text-sm text-foreground">
        <p className="flex-1 leading-snug">
          <Trans i18nKey="testBanner.message" values={{ email: FEEDBACK_EMAIL }}>
            <strong />
            <strong />
            <a
              href={`mailto:${FEEDBACK_EMAIL}`}
              className="underline underline-offset-2 hover:opacity-80"
            />
          </Trans>
        </p>
        <button
          onClick={dismiss}
          aria-label={t('testBanner.close')}
          className="shrink-0 p-1 rounded hover:bg-black/10 transition-colors"
          data-testid="test-banner-close"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

