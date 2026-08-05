import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export default function Privacy() {
  const { t } = useTranslation();
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-10 py-16" data-testid="privacy-page">

      <p className="overline mb-4">{t('privacy.overline')}</p>
      <h1 className="text-4xl font-bold tracking-tight mb-4">
        {t('privacy.title')}
      </h1>
      <p className="text-foreground/80 text-sm leading-relaxed mb-12">
        {t('privacy.intro')}
      </p>

      <section className="mb-10">
        <h2 className="text-xl font-bold tracking-tight mb-4">{t('privacy.data_title')}</h2>
        <ul className="space-y-2 text-foreground/80 text-sm leading-relaxed list-disc pl-5">
          <li>{t('privacy.data_1')}</li>
          <li>{t('privacy.data_2')}</li>
          <li>{t('privacy.data_3')}</li>
        </ul>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-bold tracking-tight mb-4">{t('privacy.why_title')}</h2>
        <ul className="space-y-2 text-foreground/80 text-sm leading-relaxed list-disc pl-5">
          <li>{t('privacy.why_1')}</li>
          <li>{t('privacy.why_2')}</li>
        </ul>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-bold tracking-tight mb-4">{t('privacy.sharing_title')}</h2>
        <p className="text-foreground/80 text-sm leading-relaxed mb-3">{t('privacy.sharing_intro')}</p>
        <ul className="space-y-2 text-foreground/80 text-sm leading-relaxed list-disc pl-5">
          <li>{t('privacy.sharing_1')}</li>
          <li>{t('privacy.sharing_2')}</li>
        </ul>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-bold tracking-tight mb-4">{t('privacy.rights_title')}</h2>
        <ul className="space-y-2 text-foreground/80 text-sm leading-relaxed list-disc pl-5">
          <li>{t('privacy.rights_1')}</li>
          <li>{t('privacy.rights_2')}</li>
          <li>
            {t('privacy.rights_3')}{' '}
            <Link to="/profiel" className="industrial-link">{t('privacy.rights_3_link')}</Link>.
          </li>
        </ul>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-bold tracking-tight mb-4">{t('privacy.retention_title')}</h2>
        <p className="text-foreground/80 text-sm leading-relaxed">{t('privacy.retention_body')}</p>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-bold tracking-tight mb-4">{t('privacy.cookies_title')}</h2>
        <p className="text-foreground/80 text-sm leading-relaxed">{t('privacy.cookies_body')}</p>
      </section>

      <section>
        <h2 className="text-xl font-bold tracking-tight mb-4">{t('privacy.contact_title')}</h2>
        <p className="text-foreground/80 text-sm leading-relaxed">
          {t('privacy.contact_body')}{' '}
          <a href="mailto:info@inlimbo.brussels" className="industrial-link">info@inlimbo.brussels</a>.
        </p>
      </section>

    </div>
  );
}
