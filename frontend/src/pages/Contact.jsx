import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, formatApiError } from '@/lib/api';

export default function Contact() {
  const { t } = useTranslation();

  const [form, setForm] = useState({ name: '', email: '', message: '', website: '' });
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const [newsletterEmail, setNewsletterEmail] = useState('');
  const [nlSubmitting, setNlSubmitting] = useState(false);
  const [nlDone, setNlDone] = useState(false);
  const [nlError, setNlError] = useState('');

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await api.post('/contact', form);
      setSent(true);
      setForm({ name: '', email: '', message: '', website: '' });
    } catch (err) {
      setError(formatApiError(err) || t('contact.error'));
    } finally {
      setSubmitting(false);
    }
  };

  const onNewsletterSubmit = async (e) => {
    e.preventDefault();
    setNlError('');
    setNlSubmitting(true);
    try {
      await api.post('/newsletter/subscribe', { email: newsletterEmail });
      setNlDone(true);
      setNewsletterEmail('');
    } catch (err) {
      setNlError(formatApiError(err) || t('contact.error'));
    } finally {
      setNlSubmitting(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10" data-testid="contact-page">
      {/* HERO */}
      <section className="py-16 border-b border-border">
        <p className="overline mb-2">{t('contact.overline')}</p>
        <h1 className="text-5xl sm:text-6xl font-bold tracking-tight leading-[0.95] max-w-3xl">
          {t('contact.title')}
        </h1>
        <p className="mt-6 text-lg text-foreground/80 max-w-2xl leading-relaxed">
          {t('contact.subtitle')}
        </p>
      </section>

      {/* DETAILS + CONTACT FORM */}
      <section className="py-16 border-b border-border">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
          {/* Details */}
          <div data-testid="contact-details">
            <p className="overline mb-4">{t('contact.details_overline')}</p>
            <h2 className="text-3xl font-bold tracking-tight mb-6">{t('contact.details_title')}</h2>
            <div className="text-foreground/80 text-sm leading-relaxed space-y-4">
              <div>
                <p className="font-medium text-foreground">{t('contact.address_label')}</p>
                <p>Fernand Demetskaai 34b<br />Anderlecht, Brussel</p>
              </div>
              <div>
                <p className="font-medium text-foreground">{t('contact.hours_label')}</p>
                <p>{t('contact.hours_value')}</p>
              </div>
              <div>
                <p className="font-medium text-foreground">{t('contact.iban_label')}</p>
                <p>BE76 7350 3121 5695<br />{t('contact.iban_communication')}</p>
              </div>
              <div>
                <p className="font-medium text-foreground">{t('contact.kbo_label')}</p>
                <p>846.221.169</p>
              </div>
              <p className="text-foreground/70 italic pt-2">{t('contact.donations_welcome')}</p>
            </div>
          </div>

          {/* Contact form */}
          <div data-testid="contact-form-wrap">
            <p className="overline mb-4">{t('contact.form_overline')}</p>
            <h2 className="text-3xl font-bold tracking-tight mb-6">{t('contact.form_title')}</h2>

            {sent ? (
              <div
                className="border border-border bg-muted/40 px-5 py-6 text-sm"
                data-testid="contact-success"
              >
                <p className="font-medium text-foreground mb-1">{t('contact.success_title')}</p>
                <p className="text-foreground/70">{t('contact.success_body')}</p>
              </div>
            ) : (
              <form onSubmit={onSubmit} className="space-y-4" data-testid="contact-form">
                {/* Honeypot: onzichtbaar voor mensen, spambots vullen dit vaak automatisch in. */}
                <div className="absolute left-[-9999px] top-[-9999px] h-0 w-0 overflow-hidden" aria-hidden="true">
                  <label htmlFor="contact-website">Website</label>
                  <input
                    id="contact-website"
                    name="website"
                    type="text"
                    tabIndex={-1}
                    autoComplete="off"
                    value={form.website}
                    onChange={(e) => setForm({ ...form, website: e.target.value })}
                  />
                </div>
                <div>
                  <label className="overline block mb-2" htmlFor="contact-name">
                    {t('contact.field_name')}
                  </label>
                  <input
                    id="contact-name"
                    data-testid="contact-name-input"
                    type="text"
                    required
                    maxLength={100}
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="input-flat w-full"
                  />
                </div>
                <div>
                  <label className="overline block mb-2" htmlFor="contact-email">
                    {t('contact.field_email')}
                  </label>
                  <input
                    id="contact-email"
                    data-testid="contact-email-input"
                    type="email"
                    required
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="input-flat w-full"
                  />
                </div>
                <div>
                  <label className="overline block mb-2" htmlFor="contact-message">
                    {t('contact.field_message')}
                  </label>
                  <textarea
                    id="contact-message"
                    data-testid="contact-message-input"
                    required
                    maxLength={1000}
                    rows={6}
                    value={form.message}
                    onChange={(e) => setForm({ ...form, message: e.target.value })}
                    className="input-flat w-full resize-y"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    {form.message.length}/1000
                  </p>
                </div>

                {error && (
                  <p className="text-sm text-destructive" data-testid="contact-error">
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  data-testid="contact-submit-btn"
                  className="btn-primary disabled:opacity-50"
                >
                  {submitting ? t('contact.submitting') : t('contact.submit_btn')}
                </button>
              </form>
            )}
          </div>
        </div>
      </section>

      {/* NEWSLETTER */}
      <section className="py-16">
        <div className="max-w-2xl">
          <p className="overline mb-4">{t('contact.newsletter_overline')}</p>
          <h2 className="text-3xl font-bold tracking-tight mb-4">{t('contact.newsletter_title')}</h2>
          <p className="text-foreground/80 leading-relaxed mb-6">
            {t('contact.newsletter_subtitle')}
          </p>

          {nlDone ? (
            <div
              className="border border-border bg-muted/40 px-5 py-6 text-sm"
              data-testid="newsletter-success"
            >
              <p className="font-medium text-foreground mb-1">{t('contact.newsletter_success_title')}</p>
              <p className="text-foreground/70">{t('contact.newsletter_success_body')}</p>
            </div>
          ) : (
            <form
              onSubmit={onNewsletterSubmit}
              className="flex flex-col sm:flex-row gap-3"
              data-testid="newsletter-form"
            >
              <input
                type="email"
                required
                value={newsletterEmail}
                onChange={(e) => setNewsletterEmail(e.target.value)}
                placeholder={t('contact.newsletter_email_placeholder')}
                data-testid="newsletter-email-input"
                className="input-flat flex-1"
              />
              <button
                type="submit"
                disabled={nlSubmitting}
                data-testid="newsletter-submit-btn"
                className="btn-primary disabled:opacity-50"
              >
                {nlSubmitting ? t('contact.submitting') : t('contact.newsletter_submit_btn')}
              </button>
            </form>
          )}

          {nlError && (
            <p className="mt-3 text-sm text-destructive" data-testid="newsletter-error">
              {nlError}
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
