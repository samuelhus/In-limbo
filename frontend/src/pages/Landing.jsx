import React from 'react';
import { Link } from 'react-router-dom';
import Logo from '@/components/Logo';

const HERO_BG =
  'https://static.prod-images.emergentagent.com/jobs/40e00778-584d-41f8-b6ee-4e48e961daf5/images/b211452b858296af0d927f008d058751bc1853be53d87eb88b8cc901809dbac6.png';

export default function Landing() {
  return (
    <div className="min-h-[calc(100vh-4rem)]" data-testid="landing-page">
      {/* HERO */}
      <section className="relative overflow-hidden border-b border-border">
        <div
          className="absolute inset-0 opacity-20 mix-blend-multiply"
          style={{
            backgroundImage: `url(${HERO_BG})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 pt-16 sm:pt-24 pb-24 grid grid-cols-1 md:grid-cols-12 gap-12 items-end">
          <div className="md:col-span-7 animate-fade-in">
            {/* <p className="overline mb-6">Materiaal in transit / Bruxelles · Brussel</p>*/}
            <h1 className="text-5xl sm:text-6xl lg:text-7xl tracking-tightest font-bold leading-[0.95]">
              Hergebruik in de brusselse socio-culturele sector.
            </h1>
            <p className="mt-8 text-lg text-foreground/80 max-w-xl leading-relaxed">
              In Limbo is een marktplaats die Brusselse socio-culturele
              organisaties verbindt om overschotmateriaal door te geven —
              decor, bouwhout, textiel, electro — in plaats van weg te gooien.
            </p>
            <div className="mt-10 flex flex-wrap gap-4" data-testid="hero-cta">
              <Link to="/catalogus" className="btn-primary" data-testid="hero-catalogus-btn">
                Bekijk catalogus →
              </Link>
              <Link to="/registreer" className="btn-secondary" data-testid="hero-register-btn">
                Word lid
              </Link>
              <Link to="/donnateur/registreer" className="btn-ghost" data-testid="hero-donnateur-btn">
                Doe een gift
              </Link>
            </div>
          </div>

          <div className="md:col-span-5 hidden md:flex justify-end">
            <Logo size="xl" className="max-w-sm" />
          </div>
        </div>
      </section>

      {/* MANIFESTO */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-24 grid grid-cols-1 md:grid-cols-12 gap-8">
        <div className="md:col-span-4">
          <p className="overline">Het idee</p>
        </div>
        <div className="md:col-span-8 space-y-6 text-lg leading-relaxed">
          <p>
            Theaters bouwen decor. Ateliers maken installaties. Sociaal werk
            verbouwt zalen. Wat overblijft, belandt in containers.
          </p>
          <p>
            We zetten dat materiaal letterlijk <em>in limbo</em> — een wachtkamer
            tussen twee bestemmingen — en geven het tijd om door te stromen
            naar wie het kan gebruiken.
          </p>
        </div>
      </section>

      {/* THREE STEPS */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-12 border-t border-border">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
          {[
            { k: '01', t: 'Aanbieden', d: 'Plaats overschotmateriaal in de catalogus met foto, gewicht en deadline.' },
            { k: '02', t: 'Vinden', d: 'Bezoek de catalogus en ontdek materiaal van andere organisaties.' },
            { k: '03', t: 'Herbestemmen', d: 'Spreek af, neem mee, geef nieuw leven aan wat anders verloren ging.' },
          ].map((s) => (
            <div key={s.k} data-testid={`step-${s.k}`} className="border-t border-foreground pt-6">
              <p className="font-heading text-sm tracking-[0.3em] text-muted-foreground">{s.k}</p>
              <h3 className="mt-2 text-2xl font-semibold">{s.t}</h3>
              <p className="mt-3 text-foreground/75 leading-relaxed">{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-24 border-t border-border">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-8">
          <h2 className="text-4xl sm:text-5xl font-bold tracking-tight max-w-2xl">
            Klaar om materiaal in beweging te zetten?
          </h2>
          <div className="flex flex-wrap gap-3">
            <Link to="/registreer" className="btn-primary" data-testid="cta-register-btn">
              Registreer je organisatie →
            </Link>
            <Link to="/donnateur/registreer" className="btn-secondary" data-testid="cta-donnateur-btn">
              Doe een gift →
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
