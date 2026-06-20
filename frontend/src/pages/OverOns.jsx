import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/api';

const CATEGORY_ORDER = [
  'beeldende_kunsten', 'educatie', 'jeugdwerk', 'podiumkunsten',
  'sociaal_werk', 'sport', 'noodopvang', 'ander',
];

export default function OverOns() {
  const { t } = useTranslation();
  const FAQ_ITEMS = t('overons.faq_items', { returnObjects: true });
  const [activeIndex, setActiveIndex] = useState(null);
  const [orgs, setOrgs] = useState([]);

  useEffect(() => {
    api.get('/organisations', { params: { validated_only: true } })
      .then(({ data }) =>
        setOrgs(data.filter((o) => o.status === 'validated' || o.status === 'active'))
      )
      .catch(() => {});
  }, []);

  const grouped = orgs.reduce((acc, o) => {
    const c = o.category || 'Ander';
    (acc[c] = acc[c] || []).push(o);
    return acc;
  }, {});

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10" data-testid="over-ons-page">

      {/* 1. HERO */}
      <section className="py-16 border-b border-border" data-testid="over-ons-hero">
        <p className="overline mb-4">{t('landing.hero_tagline')}</p>
        <h1 className="text-5xl sm:text-6xl font-bold tracking-tight leading-[0.95] max-w-3xl">
          {t('pages.overons_title')}
        </h1>
        <p className="mt-6 text-lg text-foreground/80 max-w-2xl leading-relaxed">
          {t('pages.overons_intro')}
        </p>
        <div className="mt-10 aspect-[21/9] overflow-hidden">
          <img
            src="https://res.cloudinary.com/dbjizykvb/image/upload/v1780261970/InLimbo_overons_1_jf6ijc.jpg"
            alt="In Limbo magazijn"
            className="w-full h-full object-cover"
          />
        </div>
      </section>

      {/* 2. WAT IS IN LIMBO */}
      <section className="py-16 border-b border-border">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
          <div>
            <p className="overline mb-4">{t('overons.wie_zijn_we')}</p>
            <h2 className="text-3xl font-bold tracking-tight mb-6">{t('overons.wat_is_title')}</h2>
            <p className="text-foreground/80 leading-relaxed mb-4">
              {t('overons.p1')}
            </p>
            <p className="text-foreground/80 leading-relaxed">
              {t('overons.p2')}
            </p>
          </div>
          <div className="aspect-square overflow-hidden">
            <img
              src="https://res.cloudinary.com/dbjizykvb/image/upload/v1780261972/InLimbo_overons_3_whcnrr.jpg"
              alt="Materialen In Limbo"
              className="w-full h-full object-cover"
            />
          </div>
        </div>
      </section>

      {/* 3. CIJFERBLOK */}
      <section className="py-16 border-b border-border bg-muted/30" data-testid="over-ons-stats">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-10 text-center">
          <div>
            <p className="text-6xl font-bold tracking-tight">500+</p>
            <p className="mt-2 text-sm text-muted-foreground uppercase tracking-widest">
              {t('overons.partnersteller')}
            </p>
          </div>
          <div>
            <p className="text-6xl font-bold tracking-tight">100T+</p>
            <p className="mt-2 text-sm text-muted-foreground uppercase tracking-widest">
              {t('overons.tonmateriaal')}
            </p>
          </div>
          <div>
            <p className="text-6xl font-bold tracking-tight">OPEN</p>
            <p className="mt-2 text-sm text-muted-foreground uppercase tracking-widest">
              {t('overons.opening')}
            </p>
          </div>
        </div>
      </section>

      {/* 4. VOOR WIE */}
      <section className="py-16 border-b border-border">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
          <div>
            <p className="overline mb-4">{t('overons.doelgroep')}</p>
            <h2 className="text-3xl font-bold tracking-tight mb-6">{t('overons.voor_wie_title')}</h2>
            <p className="text-foreground/80 leading-relaxed mb-4">
              {t('overons.p3')}
            </p>
            <p className="text-foreground/80 leading-relaxed">
              {t('overons.p4')}
            </p>
          </div>
          <div className="aspect-square overflow-hidden">
            <img
              src="https://res.cloudinary.com/dbjizykvb/image/upload/v1780261968/InLimbo_overons_2_pyhem2.jpg"
              alt="Voor wie is In Limbo"
              className="w-full h-full object-cover"
            />
          </div>
        </div>
      </section>

      {/* 5. HOE WERKT HET */}
      <section className="py-16 border-b border-border">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
          <div className="aspect-square overflow-hidden">
            <img
              src="https://res.cloudinary.com/dbjizykvb/image/upload/v1780261967/InLimbo_overons_5_iyd4p5.jpg"
              alt="Hoe werkt In Limbo"
              className="w-full h-full object-cover"
            />
          </div>
          <div>
            <p className="overline mb-4">{t('overons.de_werking')}</p>
            <h2 className="text-3xl font-bold tracking-tight mb-8">{t('overons.hoe_werkt_title')}</h2>
            <ol className="space-y-6">
              <li className="flex gap-4">
                <span className="text-2xl font-bold text-muted-foreground/50 leading-none">01</span>
                <div>
                  <p className="font-semibold mb-1">{t('overons.werking1')}</p>
                  <p className="text-sm text-foreground/70">
                    {t('overons.werking2')}
                  </p>
                </div>
              </li>
              <li className="flex gap-4">
                <span className="text-2xl font-bold text-muted-foreground/50 leading-none">02</span>
                <div>
                  <p className="font-semibold mb-1">{t('overons.werking3')}</p>
                  <p className="text-sm text-foreground/70">
                    {t('overons.werking4')}
                  </p>
                </div>
              </li>
              <li className="flex gap-4">
                <span className="text-2xl font-bold text-muted-foreground/50 leading-none">03</span>
                <div>
                  <p className="font-semibold mb-1">{t('overons.werking5')}</p>
                  <p className="text-sm text-foreground/70">
                    {t('overons.werking6')}
                  </p>
                </div>
              </li>
              <li className="flex gap-4">
                <span className="text-2xl font-bold text-muted-foreground/50 leading-none">04</span>
                <div>
                  <p className="font-semibold mb-1">{t('overons.werking7')}</p>
                  <p className="text-sm text-foreground/70">
                    {t('overons.werking8')}
                  </p>
                </div>
              </li>
            </ol>
          </div>
        </div>
      </section>

      {/* 6. MATERIAAL DONEREN */}
      <section className="py-16 border-b border-border">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
          <div className="aspect-square overflow-hidden">
            <img
              src="https://res.cloudinary.com/dbjizykvb/image/upload/v1780261972/InLimbo_overons_4_gvdavc.jpg"
              alt="Materiaal doneren"
              className="w-full h-full object-cover"
            />
          </div>
          <div>
            <p className="overline mb-4">{t('overons.doneren_overline')}</p>
            <h2 className="text-3xl font-bold tracking-tight mb-6">{t('overons.doneren_title')}</h2>
            <p className="text-foreground/80 leading-relaxed mb-4">
              {t('overons.p5')}
            </p>
            <div className="border border-border bg-muted/40 px-4 py-3 text-sm text-foreground/80">
              ⚠️ {t('overons.p6')}
            </div>
            <Link to="/donateur/registreer" className="btn-primary justify-center mt-8" data-testid="over-ons-cta-donateur">
            {t('overons.ctadoneer')}
</Link>
          </div>
        </div>
      </section>

      {/* 7. FAQ */}
      <section className="py-16 border-b border-border" data-testid="over-ons-faq">
        <p className="overline mb-4">{t('overons.faq_overline')}</p>
        <h2 className="text-3xl font-bold tracking-tight mb-10">{t('overons.faq_title')}</h2>
        <div className="divide-y divide-border border-y border-border max-w-3xl">
          {FAQ_ITEMS.map((item, i) => (
            <div key={i} data-testid={`faq-item-${i}`}>
              <button
                onClick={() => setActiveIndex(activeIndex === i ? null : i)}
                data-testid={`faq-toggle-${i}`}
                className="w-full flex justify-between items-center py-5 text-left font-medium hover:text-foreground/70 transition-colors"
              >
                <span>{item.question}</span>
                <span className="ml-4 text-muted-foreground">
                  {activeIndex === i ? '▲' : '▼'}
                </span>
              </button>
              {activeIndex === i && (
                <p className="pb-5 text-sm text-foreground/75 leading-relaxed" data-testid={`faq-answer-${i}`}>
                  {item.answer}
                </p>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* 8. FOTOBALK */}
      <div className="grid grid-cols-2 gap-2 my-4">
        <div className="aspect-[4/3] overflow-hidden">
          <img
            src="https://res.cloudinary.com/dbjizykvb/image/upload/v1780261968/InLimbo_overons_6_pdlxmu.jpg"
            alt="In Limbo materialen"
            className="w-full h-full object-cover"
          />
        </div>
        <div className="aspect-[4/3] overflow-hidden">
          <img
            src="https://res.cloudinary.com/dbjizykvb/image/upload/v1780261966/inlimbo_06_npcqbk.jpg"
            alt="In Limbo magazijn"
            className="w-full h-full object-cover"
          />
        </div>
      </div>

      
      {/* 10. SAMENWERKING + CONTACT */}
      <section className="py-16 border-b border-border">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
          <div>
            <p className="overline mb-4">{t('overons.samenwerking_overline')}</p>
            <h2 className="text-3xl font-bold tracking-tight mb-6">{t('overons.samenwerking_title')}</h2>
            <div className="flex flex-wrap gap-2 mb-6">
              {['Toestand', 'Zinneke', 'De Munt', 'Rotor DC'].map((p) => (
                <span key={p} className="border border-border px-3 py-1.5 text-sm font-medium">
                  {p}
                </span>
              ))}
            </div>
            {/*<p className="text-sm text-foreground/70">Met steun van Leefmilieu Brussel.</p>*/}
          </div>
          <div>
            <p className="overline mb-4">{t('overons.contact_overline')}</p>
            <h2 className="text-3xl font-bold tracking-tight mb-6">{t('overons.contact_title')}</h2>
            <p className="text-foreground/80 text-sm leading-relaxed">
              Fernand Demetskaai 34b<br />
              Anderlecht, Brussel<br /><br />
              Elke woensdag van 10 tot 17u<br /><br />
              IBAN: BE76 7350 3121 5695<br />
              (mededeling: IN LIMBO)<br />
              KBO: 846.221.169
            </p>
            <p className="mt-4 text-sm text-foreground/70">
              Donaties voor de werking zijn altijd welkom.
            </p>
          </div>
        </div>
      </section>

      {/* 11. CTA */}
      <section className="py-16">
        <div className="flex flex-wrap gap-4">
          <Link to="/registreer" className="btn-primary" data-testid="over-ons-cta-partner">{t('overons.cta_partner')}</Link>
          <Link to="/catalogus" className="btn-secondary" data-testid="over-ons-cta-catalogus">{t('overons.cta_catalogus')}</Link>
        </div>
      </section>
    </div>
  );
}
