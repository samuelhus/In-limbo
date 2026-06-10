import React from 'react';
import { useTranslation } from 'react-i18next';

export default function Voorwaarden() {
  const { t } = useTranslation();
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-10 py-16"
         data-testid="voorwaarden-page">

      <p className="overline mb-4">Juridisch</p>
      <h1 className="text-4xl font-bold tracking-tight mb-12">
        {t('pages.voorwaarden_title')}
      </h1>

      <section className="mb-10">
        <h2 className="text-xl font-bold tracking-tight mb-4">
          De missie van In Limbo
        </h2>
        <ul className="space-y-2 text-foreground/80 text-sm leading-relaxed list-disc pl-5">
          <li>
            Een kader uitwerken waarbinnen alle partners uit de culturele
            sector in Brussel kosteloos herbruikbare materialen kunnen
            doneren of ontvangen.
          </li>
          <li>
            Uitwisselingen faciliteren binnen een vertrouwensrelatie,
            dankzij ondersteuning bij de transactie.
          </li>
        </ul>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-bold tracking-tight mb-4">
          Wij zijn het erover eens dat
        </h2>
        <ul className="space-y-2 text-foreground/80 text-sm leading-relaxed list-disc pl-5">
          <li>
            Een gift inspanning vraagt. Het is vaak makkelijker om iets
            weg te gooien dan er een nieuwe bestemming voor te vinden.
          </li>
          <li>
            We moeten evolueren naar een circulairder beheer van onze middelen.
          </li>
          <li>
            Stiptheid en betrouwbaarheid onmisbaar zijn voor het welslagen
            van transacties. Een gemiste afspraak of een op het laatste
            moment geannuleerde gift kost iedereen tijd en energie, en
            ontmoedigt zowel schenkers als ontvangers.
          </li>
          <li>
            Niet alles bewaard kan worden. Sommige materialen zijn simpelweg
            niet geschikt voor hergebruik. In Limbo is dan ook in de eerste
            plaats bestemd voor materialen die, door hun aard, hoeveelheid
            of specifieke kenmerken, geschikt zijn voor nieuwe toepassingen.
          </li>
        </ul>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-bold tracking-tight mb-4">
          Gebruikers
        </h2>
        <ul className="space-y-2 text-foreground/80 text-sm leading-relaxed list-disc pl-5">
          <li>
            Bieden hun materialen gratis aan of doen hun materiaalverzoeken
            via het platform.
          </li>
          <li>
            Dragen bij aan de ontwikkeling van het platform door het te
            gebruiken en feedback te geven.
          </li>
        </ul>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-bold tracking-tight mb-4">
          Voorwaarden
        </h2>
        <ul className="space-y-4 text-foreground/80 text-sm leading-relaxed">
          <li>
            <span className="font-semibold text-foreground">Verantwoordelijkheid.</span>{' '}
            In Limbo is verantwoordelijk voor het hosten van de inhoud en
            het matchen van vraag en aanbod. De betrokken partners zijn
            volledig verantwoordelijk voor de inhoud en de voorwaarden van
            de transacties.
          </li>
          <li>
            <span className="font-semibold text-foreground">Staat van de goederen.</span>{' '}
            De schenker kan niet verantwoordelijk worden gehouden voor de
            goede werking van de goederen. De ontvanger aanvaardt de
            goederen in de staat waarin ze zich bevinden.
          </li>
          <li>
            <span className="font-semibold text-foreground">Overdracht van verantwoordelijkheid.</span>{' '}
            De ontvangers nemen de verantwoordelijkheid voor de goederen
            op zich zodra deze de opslagplaats van de schenker verlaten.
          </li>
          <li>
            <span className="font-semibold text-foreground">Kosteloosheid.</span>{' '}
            Materiaaltransacties gebeuren uitsluitend gratis. Ze zijn
            bestemd voor gebruik binnen de culturele sector of voor
            socioculturele animatie. De partners verbinden zich ertoe geen
            winst te maken uit de via het platform georganiseerde
            transacties. In Limbo maakt geen winst. Het platform is gratis
            en zonder reclame.
          </li>
          <li>
            <span className="font-semibold text-foreground">Professionalisme.</span>{' '}
            De partners verbinden zich ertoe de grootst mogelijke
            flexibiliteit te tonen bij transacties. Dit houdt in het
            bijzonder in: afspraken nakomen, stipt zijn, vooraf goed
            nadenken over de te ondernemen acties en de informatie zo
            transparant mogelijk ter beschikking stellen.
          </li>
          <li>
            <span className="font-semibold text-foreground">Toegang.</span>{' '}
            Het platform In Limbo is toegankelijk voor erkende
            socio-culturele organisaties en individuen die materiaal
            wensen te doneren.
          </li>
          <li>
            <span className="font-semibold text-foreground">Gebruiksvoorwaarden.</span>{' '}
            Door je te registreren op het platform aanvaard je de hierop
            vermelde algemene voorwaarden.
          </li>
          <li>
            <span className="font-semibold text-foreground">Fair use.</span>{' '}
            We vragen je het spel eerlijk te spelen en het platform niet
            te omzeilen.
          </li>
        </ul>
      </section>

      <div className="border-t border-border pt-8 mt-12">
        <p className="text-xs text-muted-foreground">
          Laatst bijgewerkt: juni 2025 · In Limbo, Brussel
        </p>
      </div>

    </div>
  );
}
