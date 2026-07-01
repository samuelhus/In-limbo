import React, { useState } from 'react';
import { Share2, Check, Link as LinkIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/**
 * Deelknop voor listings/organisaties.
 * Gebruikt de native Web Share API waar beschikbaar (vooral mobiel — opent
 * het systeem-deelmenu met WhatsApp, Mail, sms, ...). Op desktop (of als
 * Web Share niet beschikbaar is) valt het terug op "link kopiëren naar
 * klembord" met een korte visuele bevestiging.
 *
 * Gebruik: <ShareButton title={item.title} text={t('listing.share_text')} />
 * (url is optioneel — standaard de huidige pagina, window.location.href)
 */
export default function ShareButton({ title, text, url, testId = 'share-button' }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const shareUrl = url || window.location.href;
  const canNativeShare = typeof navigator !== 'undefined' && !!navigator.share;

  const handleShare = async () => {
    if (canNativeShare) {
      try {
        await navigator.share({ title, text, url: shareUrl });
      } catch (err) {
        // AbortError = gebruiker heeft het deelmenu zelf gesloten — geen actie nodig.
        if (err?.name !== 'AbortError') {
          await copyFallback();
        }
      }
      return;
    }
    await copyFallback();
  };

  const copyFallback = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Klembord-API kan falen (bv. geen HTTPS, oudere browser) — toon de
      // link dan gewoon zodat de gebruiker hem zelf manueel kan kopiëren.
      window.prompt(t('common.share_copy_manual'), shareUrl);
    }
  };

  return (
    <button
      type="button"
      onClick={handleShare}
      className="btn-secondary !py-2 !px-4 text-xs inline-flex items-center gap-2"
      data-testid={testId}
    >
      {copied ? (
        <>
          <Check className="w-3.5 h-3.5" />
          {t('common.share_copied')}
        </>
      ) : canNativeShare ? (
        <>
          <Share2 className="w-3.5 h-3.5" />
          {t('common.share')}
        </>
      ) : (
        <>
          <LinkIcon className="w-3.5 h-3.5" />
          {t('common.share_copy_link')}
        </>
      )}
    </button>
  );
}
