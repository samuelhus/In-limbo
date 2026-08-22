import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, formatApiError } from '@/lib/api';

const REASONS = ['voorwaarden', 'misleidend', 'ander'];

export default function ReportListingModal({ listing, onClose, onSubmitted }) {
  const { t } = useTranslation();
  const [reason, setReason] = useState('voorwaarden');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await api.post(`/listings/${listing.id}/report`, {
        reason,
        note: note.trim() || null,
      });
      onSubmitted?.();
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
      data-testid="report-listing-modal-overlay"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md bg-surface p-6 sm:p-8 border-t sm:border border-border"
        data-testid="report-listing-modal"
      >
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <p className="overline mb-2">{t('listing.report_modal_title')}</p>
            <h2 className="text-xl font-bold tracking-tight">{listing.title}</h2>
          </div>
          <button onClick={onClose} className="text-2xl leading-none px-2" data-testid="report-listing-modal-close">×</button>
        </div>

        <form onSubmit={submit} className="space-y-5">
          <div>
            <label className="label-overline">{t('listing.report_reason_label')}</label>
            <select
              className="input-flat"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              data-testid="report-listing-reason-select"
            >
              {REASONS.map((r) => (
                <option key={r} value={r}>{t(`listing.report_reason_${r}`)}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="label-overline">{t('listing.report_note_label')}</label>
            <textarea
              rows={4}
              maxLength={500}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t('listing.report_note_placeholder')}
              className="input-flat"
              data-testid="report-listing-note-input"
            />
            <p className="text-xs text-muted-foreground mt-1">{note.length} / 500</p>
          </div>

          {error && (
            <p className="text-sm text-destructive bg-destructive/10 border border-destructive/40 px-3 py-2" data-testid="report-listing-error">
              {error}
            </p>
          )}

          <div className="flex justify-between items-center pt-2">
            <button type="button" onClick={onClose} className="btn-ghost" data-testid="report-listing-cancel">
              {t('common.cancel')}
            </button>
            <button type="submit" disabled={submitting} className="btn-primary" data-testid="report-listing-submit">
              {submitting ? t('common.saving') : t('listing.report_modal_submit')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
