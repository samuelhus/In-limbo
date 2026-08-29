import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { api, formatApiError } from '@/lib/api';
import { useModalA11y } from '@/hooks/useModalA11y';

export default function ApplyModal({ listing, onClose, onSubmitted }) {
  const { t } = useTranslation();
  const panelRef = useModalA11y(onClose);
  const [motivation, setMotivation] = useState('');
  // Als string bijgehouden zodat je tijdens het typen (bv. backspacen naar leeg
  // om "1" te vervangen door "5") niet meteen teruggeklampt wordt naar 1 — dat
  // gebeurt pas bij onBlur en bij het effectief indienen.
  const [requestedQuantity, setRequestedQuantity] = useState('1');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const remaining = listing.remainingQuantity ?? listing.quantity ?? 1;
  const showQuantityField = remaining > 1;

  const clamp = (v) => Math.min(Math.max(v, 1), remaining);

  const commitQuantity = () => {
    const parsed = parseInt(requestedQuantity, 10);
    setRequestedQuantity(String(isNaN(parsed) ? 1 : clamp(parsed)));
  };

  const step = (delta) => {
    const parsed = parseInt(requestedQuantity, 10);
    const current = isNaN(parsed) ? 1 : parsed;
    setRequestedQuantity(String(clamp(current + delta)));
  };

  const submit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const parsed = parseInt(requestedQuantity, 10);
      const finalQuantity = showQuantityField ? clamp(isNaN(parsed) ? 1 : parsed) : 1;
      const { data } = await api.post(`/listings/${listing.id}/apply`, {
        motivation: motivation.trim(),
        requestedQuantity: finalQuantity,
      });
      onSubmitted?.(data);
    } catch (er) {
      setError(formatApiError(er));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-6 animate-fade-in"
      onClick={onClose}
      data-testid="apply-modal-overlay"
    >
      <div
        ref={panelRef}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="apply-modal-title"
        tabIndex={-1}
        className="w-full sm:max-w-xl bg-surface p-6 sm:p-10 border-t sm:border border-border max-h-[90vh] overflow-y-auto"
        data-testid="apply-modal"
      >
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <p className="overline mb-2">{t('listing.apply_modal_title')}</p>
            <h2 id="apply-modal-title" className="text-2xl font-bold tracking-tight">{listing.title}</h2>
          </div>
          <button onClick={onClose} className="text-2xl leading-none px-2" data-testid="apply-modal-close">×</button>
        </div>

        <form onSubmit={submit} className="space-y-5">
          {showQuantityField && (
            <div>
              <label className="label-overline" htmlFor="apply-quantity-input">
                {t('listing.apply_quantity_label')}
                <span className="text-muted-foreground normal-case"> ({t('listing.apply_quantity_available', { count: remaining })})</span>
              </label>
              <div className="relative w-32">
                <input
                  id="apply-quantity-input"
                  type="number"
                  min="1"
                  max={remaining}
                  step="1"
                  required
                  value={requestedQuantity}
                  onChange={(e) => {
                    const raw = e.target.value;
                    // Enkel lege string of louter cijfers toelaten — geen clamping
                    // hier, anders kun je "1" nooit wegbackspacen om iets anders
                    // in te typen. Clamping gebeurt in commitQuantity (onBlur).
                    if (raw === '' || /^\d+$/.test(raw)) {
                      setRequestedQuantity(raw);
                    }
                  }}
                  onBlur={commitQuantity}
                  className="input-flat text-lg pr-8 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  data-testid="apply-quantity-input"
                />
                <div className="absolute right-1 top-1/2 -translate-y-1/2 flex flex-col">
                  <button
                    type="button"
                    onClick={() => step(1)}
                    disabled={parseInt(requestedQuantity, 10) >= remaining}
                    className="h-4 w-6 flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:hover:text-muted-foreground"
                    aria-label={t('listing.apply_quantity_up')}
                    data-testid="apply-quantity-up"
                  >
                    <ChevronUp size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => step(-1)}
                    disabled={parseInt(requestedQuantity, 10) <= 1}
                    className="h-4 w-6 flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:hover:text-muted-foreground"
                    aria-label={t('listing.apply_quantity_down')}
                    data-testid="apply-quantity-down"
                  >
                    <ChevronDown size={14} />
                  </button>
                </div>
              </div>
            </div>
          )}

          <div>
            <label className="label-overline" htmlFor="apply-motivation-input">{t('listing.motivation')}</label>
            <textarea
              id="apply-motivation-input"
              rows={6}
              maxLength={500}
              required
              value={motivation}
              onChange={(e) => setMotivation(e.target.value)}
              placeholder={t('listing.apply_modal_placeholder')}
              className="input-flat"
              data-testid="apply-motivation-input"
              autoFocus
            />
            <p className="text-xs text-muted-foreground mt-1">{motivation.length} / 500</p>
          </div>

          {error && (
            <p className="text-sm text-destructive bg-destructive/10 border border-destructive/40 px-3 py-2" data-testid="apply-error">
              {error}
            </p>
          )}

          <div className="flex justify-between items-center pt-2">
            <button type="button" onClick={onClose} className="btn-ghost" data-testid="apply-cancel">
              {t('common.cancel')}
            </button>
            <button type="submit" disabled={submitting || !motivation.trim()} className="btn-primary" data-testid="apply-submit">
              {submitting ? t('common.saving') : t('listing.apply_modal_submit')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
