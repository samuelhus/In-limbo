import React, { useEffect, useState } from 'react';
import { useTranslation, Trans } from 'react-i18next';
import { api } from '@/lib/api';

// Deze tabel moet EXACT overeenkomen met backend/impact.py — CO2_FACTORS_KG_PER_KG.
// Wijzig één van de twee, wijzig altijd ook de andere.
// De vertaalde teksten (categorie, range, bron, toelichting) zitten in
// locales/nl.json en fr.json onder "impact_methodologie.factors.<key>".
const FACTOR_KEYS = [
  'hout', 'metaal', 'plastic', 'steen', 'textiel',
  'electro', 'vloeistof', 'papier', 'isolatie', 'ander',
];

const FACTOR_VALUES = {
  hout: 0.4,
  metaal: 2.8,
  plastic: 3.0,
  steen: 0.22,
  textiel: 4.0,
  electro: 24.9,
  vloeistof: 2.5,
  papier: 1.0,
  isolatie: 1.8,
  ander: 2.5,
};

const FACTOR_URLS = {
  hout: {
    source: 'https://greencalculus.com/standards/ice-database-embodied-carbon/',
  },
  metaal: {
    source: 'https://arxiv.org/pdf/2606.15408',
    extraSource: 'https://greencalculus.com/standards/ice-database-embodied-carbon/',
  },
  plastic: {
    source: 'https://kps.fsv.cvut.cz/upload/files/icev2.0summarytables.pdf',
    extraSource: 'https://8billiontrees.com/carbon-offsets-credits/carbon-footprint-of-polyester/',
  },
  steen: {
    source: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC11800390/',
  },
  textiel: {
    source: 'https://www.researchgate.net/figure/ndustrial-carbon-footprint-of-textile-fabrics-in-this-study-kgCO-2-e-kg_tbl1_303634993',
    extraSource: 'https://8billiontrees.com/carbon-offsets-credits/carbon-footprint-of-polyester/',
  },
  electro: {
    source: 'https://www.maxeymoverley.com/environment/carbon-footprint-of-electronics/',
  },
  vloeistof: {
    source: 'https://8billiontrees.com/carbon-offsets-credits/carbon-footprint-of-paint/',
  },
  papier: {
    source: 'https://www.carbonfact.com/blog/knowledge/yawa-recycled-packaging',
  },
  isolatie: {
    source: 'https://historicengland.org.uk/research/heritage-counts/heritage-and-environment/avoiding-embodied-carbon-production/construction-materials-embodied-carbon/',
    extraSource: 'https://www.ecohome.net/en/guides/4026/the-embodied-carbon-of-insulation-materials-which-are-best/',
  },
  ander: {},
};

function FactorRow({ factorKey, t }) {
  const urls = FACTOR_URLS[factorKey] || {};
  const category = t(`impact_methodologie.factors.${factorKey}.category`);
  const sourceLabel = t(`impact_methodologie.factors.${factorKey}.sourceLabel`, { defaultValue: '' });
  const extraSourceLabel = t(`impact_methodologie.factors.${factorKey}.extraSourceLabel`, { defaultValue: '' });

  return (
    <tr className="border-b border-border align-top" data-testid={`impact-factor-${factorKey}`}>
      <td className="py-4 pr-4 font-semibold whitespace-nowrap">{category}</td>
      <td className="py-4 pr-4 whitespace-nowrap font-mono text-sm">{FACTOR_VALUES[factorKey]}</td>
      <td className="py-4 pr-4 text-xs text-muted-foreground">
        {t(`impact_methodologie.factors.${factorKey}.range`)}
      </td>
      <td className="py-4 pr-4 text-sm">
        {urls.source ? (
          <>
            <a href={urls.source} target="_blank" rel="noopener noreferrer" className="industrial-link">
              {sourceLabel}
            </a>
            {urls.extraSource && (
              <>
                {' · '}
                <a href={urls.extraSource} target="_blank" rel="noopener noreferrer" className="industrial-link">
                  {extraSourceLabel}
                </a>
              </>
            )}
          </>
        ) : (
          <span className="text-muted-foreground italic">
            {t('impact_methodologie.internal_calc')}
          </span>
        )}
        <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
          {t(`impact_methodologie.factors.${factorKey}.note`)}
        </p>
      </td>
    </tr>
  );
}

export default function ImpactMethodologie() {
  const { t } = useTranslation();
  const [live, setLive] = useState(null);

  useEffect(() => {
    api.get('/impact/platform/ytd').then(({ data }) => setLive(data)).catch(() => {});
  }, []);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-10 py-16" data-testid="impact-methodologie-page">
      <p className="overline mb-4">{t('impact_methodologie.overline')}</p>
      <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-6">
        {t('impact_methodologie.title')}
      </h1>
      <p className="text-foreground/80 leading-relaxed max-w-2xl mb-10">
        {t('impact_methodologie.intro')}
      </p>

      {live && (
        <div
          className="bg-[#ADEBB3] border border-border p-6 mb-12"
          data-testid="impact-live-numbers"
        >
          <p className="overline mb-2">{t('impact_methodologie.live_label')}</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-3xl font-bold tracking-tight">{live.totalWeightKg.toLocaleString('nl-BE')} kg</p>
              <p className="text-xs text-muted-foreground mt-1">{t('impact_methodologie.live_weight_label')}</p>
            </div>
            <div>
              <p className="text-3xl font-bold tracking-tight">{live.totalCo2Kg.toLocaleString('nl-BE')} kg</p>
              <p className="text-xs text-muted-foreground mt-1">{t('impact_methodologie.live_co2_label')}</p>
            </div>
          </div>
        </div>
      )}

      <section className="mb-12">
        <h2 className="text-2xl font-bold tracking-tight mb-4">{t('impact_methodologie.counts_title')}</h2>
        <p className="text-sm text-foreground/80 leading-relaxed mb-3">
          <Trans i18nKey="impact_methodologie.counts_text" components={{ bold: <strong /> }} />
        </p>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-bold tracking-tight mb-6">{t('impact_methodologie.factors_title')}</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left" data-testid="impact-factors-table">
            <thead>
              <tr className="border-b-2 border-foreground text-xs uppercase tracking-widest text-muted-foreground">
                <th className="py-3 pr-4 font-medium">{t('impact_methodologie.table_header_category')}</th>
                <th className="py-3 pr-4 font-medium">{t('impact_methodologie.table_header_value')}</th>
                <th className="py-3 pr-4 font-medium">{t('impact_methodologie.table_header_range')}</th>
                <th className="py-3 pr-4 font-medium">{t('impact_methodologie.table_header_source')}</th>
              </tr>
            </thead>
            <tbody>
              {FACTOR_KEYS.map((key) => (
                <FactorRow key={key} factorKey={key} t={t} />
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-bold tracking-tight mb-4">{t('impact_methodologie.limitations_title')}</h2>
        <ul className="space-y-2 text-sm text-foreground/80 leading-relaxed list-disc pl-5">
          <li>
            <Trans i18nKey="impact_methodologie.limitation_1" components={{ bold: <strong /> }} />
          </li>
          <li>
            <Trans i18nKey="impact_methodologie.limitation_2_pre" components={{ bold: <strong /> }} />
            {' '}
            <a
              href="https://www.totem-building.be"
              target="_blank"
              rel="noopener noreferrer"
              className="industrial-link"
            >
              TOTEM
            </a>{' '}
            <Trans i18nKey="impact_methodologie.limitation_2_post" components={{ bold: <strong /> }} />
          </li>
          <li>
            <Trans i18nKey="impact_methodologie.limitation_3" components={{ bold: <strong /> }} />
          </li>
        </ul>
      </section>

      <section>
        <h2 className="text-2xl font-bold tracking-tight mb-4">{t('impact_methodologie.questions_title')}</h2>
        <p className="text-sm text-foreground/80 leading-relaxed">
          {t('impact_methodologie.questions_text')}
        </p>
      </section>
    </div>
  );
}
