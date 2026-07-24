import React, { useEffect, useState } from 'react';
import { api } from '@/lib/api';

// Deze tabel moet EXACT overeenkomen met backend/impact.py — CO2_FACTORS_KG_PER_KG.
// Wijzig één van de twee, wijzig altijd ook de andere.
const FACTORS = [
  {
    category: 'Hout',
    value: 0.4,
    range: '0,3 – 0,5 kg CO2-eq/kg',
    source: {
      label: 'ICE Database v4.1 (University of Bath / Circular Ecology)',
      url: 'https://greencalculus.com/standards/ice-database-embodied-carbon/',
    },
    note: 'Structureel hout. De ICE-database is een van de meest gebruikte, gratis embodied-carbon-databases voor bouwmaterialen wereldwijd.',
  },
  {
    category: 'Metaal',
    value: 2.8,
    range: '1,4 – 4,0 kg CO2-eq/kg (staal); primair aluminium ligt sterk hoger',
    source: {
      label: 'Data Center Life Cycle Co-Design Optimization (ICE-gebaseerde staalfactor)',
      url: 'https://arxiv.org/pdf/2606.15408',
    },
    note: 'We gebruiken een staal-gewogen gemiddelde omdat de meeste metalen listings op het platform staalproducten of gemengd metaal betreffen. Let op: aluminium-items hebben een veel hogere impact (primair aluminium >13 kg CO2-eq/kg, secundair ~4% daarvan) — voor grote aluminium-partijen is dit gemiddelde een onderschatting.',
    extraSource: {
      label: 'ICE Database v4.1 — aluminium-verhouding primair/secundair',
      url: 'https://greencalculus.com/standards/ice-database-embodied-carbon/',
    },
  },
  {
    category: 'Plastic',
    value: 3.0,
    range: '~1,2 – 4,4 kg CO2-eq/kg, sterk afhankelijk van polymeertype',
    source: {
      label: 'ICE Database v2.0 Summary Tables (nylon-referentiewaarde)',
      url: 'https://kps.fsv.cvut.cz/upload/files/icev2.0summarytables.pdf',
    },
    note: 'Gemengde schatting over courante kunststoffen (PE, PP, PVC, PET liggen doorgaans 1,7–3,5; technische kunststoffen zoals nylon hoger, tot 4,4).',
    extraSource: {
      label: '8 Billion Trees — carbon footprint polyester/kunststoffen',
      url: 'https://8billiontrees.com/carbon-offsets-credits/carbon-footprint-of-polyester/',
    },
  },
  {
    category: 'Steen',
    value: 0.22,
    range: '0,18 – 0,24 kg CO2-eq/kg (gebakken baksteen)',
    source: {
      label: 'Greenhouse Gas Emissions and Decarbonization Potential of Global Fired Clay Brick Production (peer-reviewed, PMC)',
      url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC11800390/',
    },
    note: 'Deze studie bevestigt bovendien dat haar berekende waarde overeenkomt met de ICE-databasewaarde (0,22 kg CO2-eq/kg). Natuursteen en beton liggen vaak nog lager — dit is dus eerder een voorzichtige (hogere) schatting voor de categorie "Steen" als geheel.',
  },
  {
    category: 'Textiel',
    value: 4.0,
    range: 'katoen ~5,3 · wol ~14,1 · polyester (virgin) ~1,2 kg CO2-eq/kg',
    source: {
      label: 'ResearchGate — Industrial carbon footprint of textile fabrics',
      url: 'https://www.researchgate.net/figure/ndustrial-carbon-footprint-of-textile-fabrics-in-this-study-kgCO-2-e-kg_tbl1_303634993',
    },
    note: 'Textiel heeft de grootste spreiding van alle categorieën — het vezeltype bepaalt de impact vrijwel volledig. Ons gemiddelde is een gewogen middenwaarde; voor grote wol-partijen is dit een aanzienlijke onderschatting.',
    extraSource: {
      label: '8 Billion Trees — carbon footprint polyester',
      url: 'https://8billiontrees.com/carbon-offsets-credits/carbon-footprint-of-polyester/',
    },
  },
  {
    category: 'Electro',
    value: 24.9,
    range: '24,9 kg CO2-eq/kg (Britse overheid, 2021)',
    source: {
      label: 'Maxey Moverley — Carbon Footprint of Electronics (op basis van UK Government-cijfers 2021)',
      url: 'https://www.maxeymoverley.com/environment/carbon-footprint-of-electronics/',
    },
    note: 'Deze waarde wordt onafhankelijk bevestigd door meerdere andere bronnen die exact hetzelfde cijfer citeren. Electro is verreweg de meest CO2-intensieve categorie — hergebruik van elektronica heeft dus proportioneel de grootste impact per kg.',
  },
  {
    category: 'Vloeistof',
    value: 2.5,
    range: '~2,1 kg CO2-eq/kg (proxy: verf)',
    source: {
      label: '8 Billion Trees — Carbon Footprint of Paint',
      url: 'https://8billiontrees.com/carbon-offsets-credits/carbon-footprint-of-paint/',
    },
    note: 'Berekend uit: een emmer verf van 5 liter (~6,5 kg) draagt ±13,5 kg CO2-eq bij aan de productie. Verf is gekozen als representatief proxy-materiaal voor de categorie "Vloeistof", zoals afgesproken met de opdrachtgever.',
  },
  {
    category: 'Papier',
    value: 1.0,
    range: '0,7 – 1,2 kg CO2-eq/kg (virgin), lager voor gerecycleerd papier',
    source: {
      label: 'Carbonfact — carbon footprint packaging (DEFRA-database, virgin paper)',
      url: 'https://www.carbonfact.com/blog/knowledge/yawa-recycled-packaging',
    },
    note: 'Bevestigd door twee onafhankelijke bronnen binnen dezelfde 0,7–1,2 kg CO2-eq/kg-range.',
  },
  {
    category: 'Isolatie',
    value: 1.8,
    range: 'glaswol 0,6–1,2 · steenwol 1,4–4,2 · EPS 1,9–3,5 kg CO2-eq/kg',
    source: {
      label: 'Historic England — Embodied Carbon Emissions of Construction and Retrofit Materials',
      url: 'https://historicengland.org.uk/research/heritage-counts/heritage-and-environment/avoiding-embodied-carbon-production/construction-materials-embodied-carbon/',
    },
    note: 'Gewogen gemiddelde over de meest voorkomende isolatietypes. Het exacte type isolatie (glaswol vs. steenwol vs. EPS) beïnvloedt de werkelijke impact aanzienlijk.',
    extraSource: {
      label: 'Ecohome — Embodied Carbon in Insulation Materials',
      url: 'https://www.ecohome.net/en/guides/4026/the-embodied-carbon-of-insulation-materials-which-are-best/',
    },
  },
  {
    category: 'Ander',
    value: 2.5,
    range: 'mediaan van de 9 bovenstaande categorieën',
    source: null,
    note: 'Bewust de MEDIAAN gekozen i.p.v. het rekenkundig gemiddelde: het gemiddelde zou sterk vertekend worden door de Electro-uitschieter (24,9 t.o.v. een range van 0,2–4,0 bij de overige categorieën), en zou daardoor voor een gewone "restcategorie" een onrealistisch hoog cijfer opleveren.',
  },
];

function FactorRow({ row }) {
  return (
    <tr className="border-b border-border align-top" data-testid={`impact-factor-${row.category.toLowerCase()}`}>
      <td className="py-4 pr-4 font-semibold whitespace-nowrap">{row.category}</td>
      <td className="py-4 pr-4 whitespace-nowrap font-mono text-sm">{row.value}</td>
      <td className="py-4 pr-4 text-xs text-muted-foreground">{row.range}</td>
      <td className="py-4 pr-4 text-sm">
        {row.source ? (
          <>
            <a
              href={row.source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="industrial-link"
            >
              {row.source.label}
            </a>
            {row.extraSource && (
              <>
                {' · '}
                <a
                  href={row.extraSource.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="industrial-link"
                >
                  {row.extraSource.label}
                </a>
              </>
            )}
          </>
        ) : (
          <span className="text-muted-foreground italic">Intern berekend — zie toelichting</span>
        )}
        <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">{row.note}</p>
      </td>
    </tr>
  );
}

export default function ImpactMethodologie() {
  const [live, setLive] = useState(null);

  useEffect(() => {
    api.get('/impact/platform').then(({ data }) => setLive(data)).catch(() => {});
  }, []);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-10 py-16" data-testid="impact-methodologie-page">
      <p className="overline mb-4">Verantwoording</p>
      <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-6">
        Hoe berekenen we onze CO2-impact?
      </h1>
      <p className="text-foreground/80 leading-relaxed max-w-2xl mb-10">
        In Limbo berekent de bespaarde CO2-uitstoot per hergebruikt materiaal op basis van een
        gemiddelde CO2-factor per materiaalcategorie — dezelfde categorieën die je bij het
        plaatsen van een aanbieding kiest. We kozen bewust voor deze eenvoudige aanpak in plaats
        van een volledige levenscyclusanalyse (LCA) per object: dat laatste is voor een
        marktplaats als de onze niet haalbaar, en de gebruikte gemiddelden zijn transparant en
        herleidbaar naar erkende bronnen (zie tabel hieronder).
      </p>

      {live && (
        <div
          className="bg-[#ADEBB3] border border-border p-6 mb-12"
          data-testid="impact-live-numbers"
        >
          <p className="overline mb-2">Vandaag, live vanaf het platform</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-3xl font-bold tracking-tight">{live.totalWeightKg.toLocaleString('nl-BE')} kg</p>
              <p className="text-xs text-muted-foreground mt-1">materiaal hergebruikt</p>
            </div>
            <div>
              <p className="text-3xl font-bold tracking-tight">{live.totalCo2Kg.toLocaleString('nl-BE')} kg</p>
              <p className="text-xs text-muted-foreground mt-1">CO2-equivalent bespaard</p>
            </div>
          </div>
        </div>
      )}

      <section className="mb-12">
        <h2 className="text-2xl font-bold tracking-tight mb-4">Wat telt mee?</h2>
        <p className="text-sm text-foreground/80 leading-relaxed mb-3">
          We tellen enkel materiaal dat <strong>daadwerkelijk een nieuwe gebruiker heeft
          bereikt</strong>: rechtstreekse overdrachten tussen organisaties via het platform, en
          materiaal opgehaald uit het gedeelde magazijn. Materiaal dat enkel is binnengebracht
          maar nog in het magazijn ligt, telt bewust nog niet mee — dat is nog geen gerealiseerde
          impact.
        </p>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-bold tracking-tight mb-6">CO2-factoren per categorie</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left" data-testid="impact-factors-table">
            <thead>
              <tr className="border-b-2 border-foreground text-xs uppercase tracking-widest text-muted-foreground">
                <th className="py-3 pr-4 font-medium">Categorie</th>
                <th className="py-3 pr-4 font-medium">kg CO2-eq / kg</th>
                <th className="py-3 pr-4 font-medium">Range in de literatuur</th>
                <th className="py-3 pr-4 font-medium">Bron &amp; toelichting</th>
              </tr>
            </thead>
            <tbody>
              {FACTORS.map((row) => (
                <FactorRow key={row.category} row={row} />
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-bold tracking-tight mb-4">Belangrijke beperkingen</h2>
        <ul className="space-y-2 text-sm text-foreground/80 leading-relaxed list-disc pl-5">
          <li>
            Dit zijn <strong>gemiddelde, generieke</strong> cijfers — geen productspecifieke
            levenscyclusanalyse. Voor sterk afwijkende materialen binnen een categorie (bv. een
            partij aluminium binnen "Metaal", of wol binnen "Textiel") kan de werkelijke impact
            hoger liggen dan hier berekend.
          </li>
          <li>
            De cijfers zijn gebaseerd op <strong>internationale bronnen</strong> (voornamelijk VK
            en algemene literatuur), niet op Belgische/Brusselse LCA-data zoals{' '}
            <a
              href="https://www.totem-building.be"
              target="_blank"
              rel="noopener noreferrer"
              className="industrial-link"
            >
              TOTEM
            </a>{' '}
            (Tool to Optimise the Total Environmental impact of Materials, de officiële tool van
            de 3 Belgische gewesten) of B-EPD. TOTEM is weliswaar gratis en publiek toegankelijk,
            maar is opgebouwd als een <strong>interactieve rekentool voor volledige
            bouwelementen</strong> (bv. "1m² buitenmuur, specifieke opbouw"), niet als een
            eenvoudige tabel met één CO2-factor per generieke materiaalcategorie zoals hierboven.
            Er bestaat geen publieke API of downloadbare dataset om dit rechtstreeks te
            raadplegen of automatisch te vergelijken met onze cijfers. We kunnen dus niet met
            zekerheid bevestigen dat onze categorieën exact overeenkomen met TOTEM-waarden — de
            onderliggende methodes (beide op LCA gebaseerd) liggen wel in dezelfde grootorde. We
            onderzoeken of we deze cijfers op termijn kunnen aanvullen of vervangen met Belgische
            bronnen voor de bouwgerelateerde categorieën.
          </li>
          <li>
            <strong>Financiële impact (euro's bespaard) is nog niet opgenomen</strong> in deze
            berekening. Dit komt in een latere fase, op basis van marktwaarde-schattingen per
            materiaal.
          </li>
        </ul>
      </section>

      <section>
        <h2 className="text-2xl font-bold tracking-tight mb-4">Vragen of suggesties?</h2>
        <p className="text-sm text-foreground/80 leading-relaxed">
          Heb je een betere bron voor een van deze cijfers, of specifieke kennis over
          Belgische/Brusselse LCA-data? Neem contact op via{' '}
          <a href="mailto:info@inlimbo.brussels" className="industrial-link">
            info@inlimbo.brussels
          </a>
          .
        </p>
      </section>
    </div>
  );
}
