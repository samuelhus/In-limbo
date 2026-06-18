import React from 'react';
import { useTranslation } from 'react-i18next';

export default function Voorwaarden() {
  const { t } = useTranslation();
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-10 py-16"
         data-testid="voorwaarden-page">

      <p className="overline mb-4">{t('voorwaarden.overline')}</p>
      <h1 className="text-4xl font-bold tracking-tight mb-12">
        {t('voorwaarden.title')}
      </h1>

      <section className="mb-10">
        <h2 className="text-xl font-bold tracking-tight mb-4">
          {t('voorwaarden.missie_title')}
        </h2>
        <ul className="space-y-2 text-foreground/80 text-sm leading-relaxed list-disc pl-5">
          <li>{t('voorwaarden.missie_1')}</li>
          <li>{t('voorwaarden.missie_2')}</li>
        </ul>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-bold tracking-tight mb-4">
          {t('voorwaarden.akkoord_title')}
        </h2>
        <ul className="space-y-2 text-foreground/80 text-sm leading-relaxed list-disc pl-5">
          <li>{t('voorwaarden.akkoord_1')}</li>
          <li>{t('voorwaarden.akkoord_2')}</li>
          <li>{t('voorwaarden.akkoord_3')}</li>
          <li>{t('voorwaarden.akkoord_4')}</li>
        </ul>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-bold tracking-tight mb-4">
          {t('voorwaarden.gebruikers_title')}
        </h2>
        <ul className="space-y-2 text-foreground/80 text-sm leading-relaxed list-disc pl-5">
          <li>{t('voorwaarden.gebruikers_1')}</li>
          <li>{t('voorwaarden.gebruikers_2')}</li>
        </ul>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-bold tracking-tight mb-4">
          {t('voorwaarden.voorwaarden_title')}
        </h2>
        <ul className="space-y-4 text-foreground/80 text-sm leading-relaxed">
          <li>
            <span className="font-semibold text-foreground">{t('voorwaarden.v1_label')}</span>{' '}
            {t('voorwaarden.v1_body')}
          </li>
          <li>
            <span className="font-semibold text-foreground">{t('voorwaarden.v2_label')}</span>{' '}
            {t('voorwaarden.v2_body')}
          </li>
          <li>
            <span className="font-semibold text-foreground">{t('voorwaarden.v3_label')}</span>{' '}
            {t('voorwaarden.v3_body')}
          </li>
          <li>
            <span className="font-semibold text-foreground">{t('voorwaarden.v4_label')}</span>{' '}
            {t('voorwaarden.v4_body')}
          </li>
          <li>
            <span className="font-semibold text-foreground">{t('voorwaarden.v5_label')}</span>{' '}
            {t('voorwaarden.v5_body')}
          </li>
          <li>
            <span className="font-semibold text-foreground">{t('voorwaarden.v6_label')}</span>{' '}
            {t('voorwaarden.v6_body')}
          </li>
          <li>
            <span className="font-semibold text-foreground">{t('voorwaarden.v7_label')}</span>{' '}
            {t('voorwaarden.v7_body')}
          </li>
          <li>
            <span className="font-semibold text-foreground">{t('voorwaarden.v8_label')}</span>{' '}
            {t('voorwaarden.v8_body')}
          </li>
        </ul>
      </section>

      <div className="border-t border-border pt-8 mt-12">
        <p className="text-xs text-muted-foreground">
          {t('voorwaarden.footer')}
        </p>
      </div>

    </div>
  );
}
