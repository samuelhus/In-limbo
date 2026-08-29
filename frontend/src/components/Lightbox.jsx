import React, { useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useModalA11y } from '@/hooks/useModalA11y';

/**
 * Fullscreen photo lightbox with prev/next navigation.
 *
 * Props:
 * - photos: string[] — array of image URLs
 * - index: number — currently shown photo index
 * - onClose: () => void
 * - onNavigate: (newIndex: number) => void
 */
export default function Lightbox({ photos, index, onClose, onNavigate }) {
  const { t } = useTranslation();

  const goPrev = useCallback(() => {
    onNavigate((index - 1 + photos.length) % photos.length);
  }, [index, photos.length, onNavigate]);

  const goNext = useCallback(() => {
    onNavigate((index + 1) % photos.length);
  }, [index, photos.length, onNavigate]);

  useEffect(() => {
    // Escape sluiten + de focus trap zelf worden door useModalA11y hieronder
    // afgehandeld — hier enkel de pijltjestoetsen, specifiek voor de Lightbox.
    const handleKeyDown = (e) => {
      if (e.key === 'ArrowLeft') goPrev();
      if (e.key === 'ArrowRight') goNext();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goPrev, goNext]);

  const panelRef = useModalA11y(onClose);

  if (index == null || !photos || photos.length === 0) return null;

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-label={t('inspiratie.gallery_photo_alt')}
      tabIndex={-1}
      className="fixed inset-0 z-50 bg-foreground/90 backdrop-blur-sm flex items-center justify-center p-4 sm:p-8 animate-fade-in"
      onClick={onClose}
      data-testid="lightbox-overlay"
    >
      <button
        onClick={onClose}
        className="absolute top-4 right-4 sm:top-6 sm:right-6 text-3xl leading-none text-background px-2 z-10"
        aria-label={t('inspiratie.gallery_close')}
        data-testid="lightbox-close"
      >
        ×
      </button>

      {photos.length > 1 && (
        <p
          className="absolute top-5 left-1/2 -translate-x-1/2 text-sm text-background/80 tracking-wide"
          data-testid="lightbox-counter"
        >
          {t('inspiratie.gallery_counter', { current: index + 1, total: photos.length })}
        </p>
      )}

      {photos.length > 1 && (
        <button
          onClick={(e) => { e.stopPropagation(); goPrev(); }}
          className="absolute left-2 sm:left-6 top-1/2 -translate-y-1/2 text-4xl leading-none text-background px-3 py-2 hover:opacity-70 transition-opacity"
          aria-label={t('inspiratie.gallery_prev')}
          data-testid="lightbox-prev"
        >
          ‹
        </button>
      )}

      <img
        src={photos[index]}
        alt={t('inspiratie.gallery_photo_alt')}
        className="max-w-full max-h-[85vh] object-contain"
        onClick={(e) => e.stopPropagation()}
        data-testid="lightbox-image"
      />

      {photos.length > 1 && (
        <button
          onClick={(e) => { e.stopPropagation(); goNext(); }}
          className="absolute right-2 sm:right-6 top-1/2 -translate-y-1/2 text-4xl leading-none text-background px-3 py-2 hover:opacity-70 transition-opacity"
          aria-label={t('inspiratie.gallery_next')}
          data-testid="lightbox-next"
        >
          ›
        </button>
      )}
    </div>
  );
}
