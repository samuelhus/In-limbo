import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';

const FAQ_ITEMS = [
  {
    question: "Wat voor materialen nemen jullie aan?",
    answer: "We aanvaarden materialen in goede staat die geschikt zijn voor hergebruik: hout, metaal, meubels, stoelen, panelen, deuren, TL-balken, verf, regenpijpen, plexiglas, kabels, lampen en andere bouwmaterialen. Bij grotere hoeveelheden bekijken we samen of In Limbo de ophaling kan organiseren.",
  },
  {
    question: "Mag ik op het platform verkopen?",
    answer: "Nee. In Limbo is geen verkoopplatform. Alle materialen worden kosteloos aangeboden en doorgegeven. We vragen enkel een vrije bijdrage voor de materialen die je ophaalt in ons magazijn. Het platform is uitsluitend bedoeld voor schenking en hergebruik, niet voor handel.",
  },
  {
    question: "Is alles gratis?",
    answer: "Materialen op het platform worden gratis aangeboden door partners en donateurs. In het fysieke magazijn vragen we een vrije bijdrage — je betaalt wat je kan en wat je eerlijk lijkt. Lidmaatschap als partnerorganisatie is gratis. Donaties voor de werking zijn welkom via IBAN BE76 7350 3121 5695 (mededeling: IN LIMBO).",
  },
  {
    question: "Wat aanvaarden jullie niet?",
    answer: "We aanvaarden geen voedsel, kledij of materialen in slechte staat. Ook materialen die niet geschikt zijn voor hergebruik of een veiligheidsrisico vormen worden niet aanvaard. Twijfel je of jouw materiaal in aanmerking komt? Neem dan eerst contact op voor je het afzet in het depot.",
  },
];

const CATEGORY_ORDER = [
  'Beeldende kunsten', 'Educatie', 'Jeugdwerk', 'Podiumkunsten',
  'Sociaal werk', 'Sport', 'Squat', 'Ander',
];

export default function OverOns() {
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
        <p className="overline mb-4">Materiaal in transit · Brussel</p>
        <h1 className="text-5xl sm:text-6xl font-bold tracking-tight leading-[0.95] max-w-3xl">
          Over In Limbo
        </h1>
        <p className="mt-6 text-lg text-foreground/80 max-w-2xl leading-relaxed">
          In Limbo maakt het doneren en hergebruiken van materialen in de
          Brusselse socio-culturele sector eenvoudig en toegankelijk.
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
            <p className="overline mb-4">Wie zijn we</p>
            <h2 className="text-3xl font-bold tracking-tight mb-6">Wat is In Limbo?</h2>
            <p className="text-foreground/80 leading-relaxed mb-4">
              In Limbo is een platform voor gedeeld gebruik en hergebruik van materiaal
              voor socio-culturele organisaties en tijdelijke invullingen in Brussel.
              Via ons online platform en ons magazijn verbinden we donateurs met
              organisaties die materialen nieuw leven willen geven.
            </p>
            <p className="text-foreground/80 leading-relaxed">
              We redden waardevolle materialen van de vuilnisbelt en stimuleren
              wederzijdse hulp binnen de sector. Niet-gebruikte materialen gaan
              naar verenigingen met minder middelen. Het is een samenwerking tussen
              Toestand, Zinneke, De Munt en Rotor DC, met steun van Leefmilieu Brussel.
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
              Partners sinds 2018
            </p>
          </div>
          <div>
            <p className="text-6xl font-bold tracking-tight">100T+</p>
            <p className="mt-2 text-sm text-muted-foreground uppercase tracking-widest">
              Materiaal per jaar gered
            </p>
          </div>
          <div>
            <p className="text-6xl font-bold tracking-tight">kom langs</p>
            <p className="mt-2 text-sm text-muted-foreground uppercase tracking-widest">
              Elke woensdag 10–17u
            </p>
          </div>
        </div>
      </section>

      {/* 4. VOOR WIE */}
      <section className="py-16 border-b border-border">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
          <div>
            <p className="overline mb-4">Doelgroep</p>
            <h2 className="text-3xl font-bold tracking-tight mb-6">Voor wie?</h2>
            <p className="text-foreground/80 leading-relaxed mb-4">
              In Limbo richt zich op informele en formele verenigingen en
              collectieven zonder winstoogmerk: sociale, culturele en artistieke
              organisaties, kunstscholen, noodhuisvesting en tijdelijke projecten
              in Brussel.
            </p>
            <p className="text-foreground/80 leading-relaxed">
              Wie zich aansluit wordt partner van In Limbo en krijgt toegang tot
              ons platform en magazijn. We vragen een vrije bijdrage voor de materialen.
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
            <p className="overline mb-4">De werking</p>
            <h2 className="text-3xl font-bold tracking-tight mb-8">Hoe werkt het?</h2>
            <ol className="space-y-6">
              <li className="flex gap-4">
                <span className="text-2xl font-bold text-muted-foreground/50 leading-none">01</span>
                <div>
                  <p className="font-semibold mb-1">Word partner</p>
                  <p className="text-sm text-foreground/70">
                    Registreer je organisatie en krijg toegang tot het volledige platform.
                  </p>
                </div>
              </li>
              <li className="flex gap-4">
                <span className="text-2xl font-bold text-muted-foreground/50 leading-none">02</span>
                <div>
                  <p className="font-semibold mb-1">Blader door het aanbod</p>
                  <p className="text-sm text-foreground/70">
                    Ontdek beschikbare materialen van andere organisaties en donateurs.
                  </p>
                </div>
              </li>
              <li className="flex gap-4">
                <span className="text-2xl font-bold text-muted-foreground/50 leading-none">03</span>
                <div>
                  <p className="font-semibold mb-1">Doe een aanvraag of bied aan</p>
                  <p className="text-sm text-foreground/70">
                    Vraag materiaal aan of plaats zelf een aanbieding.
                    De aanbieder kiest wie het materiaal krijgt.
                  </p>
                </div>
              </li>
              <li className="flex gap-4">
                <span className="text-2xl font-bold text-muted-foreground/50 leading-none">04</span>
                <div>
                  <p className="font-semibold mb-1">Haal op of geef af</p>
                  <p className="text-sm text-foreground/70">
                    Spreek af en geef het materiaal een tweede leven.
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
            <p className="overline mb-4">Doneren</p>
            <h2 className="text-3xl font-bold tracking-tight mb-6">Materiaal doneren</h2>
            <p className="text-foreground/80 leading-relaxed mb-4">
              Heb je als bedrijf of organisatie structureel materiaal over?
              Neem contact met ons op. Na goedkeuring kan je het materiaal
              rechtstreeks afzetten in het depot.
            </p>
            <div className="border border-border bg-muted/40 px-4 py-3 text-sm text-foreground/80">
              ⚠️ Het materiaal moet in goede staat zijn en geschikt voor hergebruik.
              We aanvaarden geen voedsel of kledij.
            </div>
            <Link to="/donnateur/registreer" className="btn-primary justify-center mt-8" data-testid="over-ons-cta-donnateur">
  Doe een gift
</Link>
          </div>
        </div>
      </section>

      {/* 7. FAQ */}
      <section className="py-16 border-b border-border" data-testid="over-ons-faq">
        <p className="overline mb-4">FAQ</p>
        <h2 className="text-3xl font-bold tracking-tight mb-10">Veelgestelde vragen</h2>
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

      {/* PARTNERS BANNER */}
      <div className="aspect-[3/1] overflow-hidden mb-12">
        <img
          src="https://res.cloudinary.com/dbjizykvb/image/upload/v1780261969/InLimbo_overons_7_aqrzme.jpg"
          alt="In Limbo partners"
          className="w-full h-full object-cover"
        />
      </div>

      {/* 9. PARTNERS */}
      <section className="py-16 border-b border-border" data-testid="over-ons-partners">
        <p className="overline mb-4">Netwerk</p>
        <h2 className="text-3xl font-bold tracking-tight mb-10">Onze partners</h2>
        {CATEGORY_ORDER.map((cat) => {
          const catOrgs = grouped[cat];
          if (!catOrgs?.length) return null;
          return (
            <div key={cat} className="mb-10" data-testid={`partner-category-${cat}`}>
              <p className="overline mb-3">{cat}</p>
              <div className="flex flex-wrap gap-2">
                {catOrgs.map((org) => (
                  <Link
                    key={org.id}
                    to={`/organisaties/${org.id}`}
                    data-testid={`partner-link-${org.id}`}
                    className="border border-border px-3 py-1.5 text-sm hover:bg-muted transition-colors"
                  >
                    {org.name}
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </section>

      {/* 10. SAMENWERKING + CONTACT */}
      <section className="py-16 border-b border-border">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
          <div>
            <p className="overline mb-4">Samenwerking</p>
            <h2 className="text-3xl font-bold tracking-tight mb-6">Een initiatief van</h2>
            <div className="flex flex-wrap gap-2 mb-6">
              {['Toestand', 'Zinneke', 'De Munt', 'Rotor DC'].map((p) => (
                <span key={p} className="border border-border px-3 py-1.5 text-sm font-medium">
                  {p}
                </span>
              ))}
            </div>
            <p className="text-sm text-foreground/70">Met steun van Leefmilieu Brussel.</p>
          </div>
          <div>
            <p className="overline mb-4">Bezoek ons</p>
            <h2 className="text-3xl font-bold tracking-tight mb-6">Contact</h2>
            <p className="text-foreground/80 text-sm leading-relaxed">
              Alphonse Vandenpeereboomstraat 31<br />
              Sint-Jans-Molenbeek, Brussel<br /><br />
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
          <Link to="/registreer" className="btn-primary" data-testid="over-ons-cta-partner">Word partner →</Link>
          <Link to="/catalogus" className="btn-secondary" data-testid="over-ons-cta-catalogus">Bekijk de catalogus</Link>
        </div>
      </section>
    </div>
  );
}
