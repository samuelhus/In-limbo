import React, { useState } from 'react';
import { api, formatApiError } from '@/lib/api';

export default function ApplyModal({ listing, onClose, onSubmitted }) {
  const [motivation, setMotivation] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const { data } = await api.post(`/listings/${listing.id}/apply`, { motivation: motivation.trim() });
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
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-xl bg-surface p-6 sm:p-10 border-t sm:border border-border max-h-[90vh] overflow-y-auto"
        data-testid="apply-modal"
      >
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <p className="overline mb-2">Aanvraag indienen</p>
            <h2 className="text-2xl font-bold tracking-tight">{listing.title}</h2>
          </div>
          <button onClick={onClose} className="text-2xl leading-none px-2" data-testid="apply-modal-close">×</button>
        </div>

        <form onSubmit={submit} className="space-y-5">
          <div>
            <label className="label-overline">Motivatie / korte beschrijving van je project</label>
            <textarea
              rows={6}
              maxLength={500}
              required
              value={motivation}
              onChange={(e) => setMotivation(e.target.value)}
              placeholder="Vertel kort waarvoor je dit materiaal nodig hebt — wat je ermee gaat doen, wanneer, en hoe je het zou ophalen."
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
              Annuleren
            </button>
            <button type="submit" disabled={submitting || !motivation.trim()} className="btn-primary" data-testid="apply-submit">
              {submitting ? 'Verzenden…' : 'Aanvraag versturen →'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
