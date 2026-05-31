import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';
import { CATEGORY_LABELS, CATEGORY_COLORS } from './Nieuws';

const HERO_BG =
  'https://static.prod-images.emergentagent.com/jobs/40e00778-584d-41f8-b6ee-4e48e961daf5/images/b211452b858296af0d927f008d058751bc1853be53d87eb88b8cc901809dbac6.png';

function getMagazijnStatus() {
  const now = new Date();
  const day = now.getDay();
  const totalMin = now.getHours() * 60 + now.getMinutes();
  const isOpen = day === 3 && totalMin >= 600 && totalMin < 1020;
  if (isOpen) {
    const closeMin = 1020 - totalMin;
    return { open: true, closeIn: `${Math.floor(closeMin / 60)}u ${closeMin % 60}m` };
  }
  let daysUntil = (3 - day + 7) % 7;
  if (daysUntil === 0 && totalMin >= 1020) daysUntil = 7;
  const next = new Date(now);
  next.setDate(now.getDate() + daysUntil);
  next.setHours(10, 0, 0, 0);
  const totalSec = Math.floor((next - now) / 1000);
  return {
    open: false,
    days: Math.floor(totalSec / 86400),
    hours: Math.floor((totalSec % 86400) / 3600),
    mins: Math.floor((totalSec % 3600) / 60),
  };
}

function MagazijnWidget({ align = 'right' }) {
  const [status, setStatus] = useState(getMagazijnStatus());

  useEffect(() => {
    const interval = setInterval(() => setStatus(getMagazijnStatus()), 60000);
    return () => clearInterval(interval);
  }, []);

  const textAlign = align === 'right' ? 'text-right' : 'text-left';
  const justify = align === 'right' ? 'justify-end' : 'justify-start';

  return (
    <div className={textAlign}>
      {status.open ? (
        <>
          <p className={`text-2xl font-semibold flex items-center gap-2 ${justify}`}>
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />
            We zijn open
          </p>
          <p className="text-foreground/60 mt-1 text-sm">Vandaag open tot 17:00</p>
        </>
      ) : (
        <>
          <p className="text-foreground/60 text-sm mb-3">Volgende opening: woensdag 10:00 – 17:00</p>
          <div className={`flex gap-3 ${justify}`}>
            {[
              { val: status.days, label: 'dagen' },
              { val: status.hours, label: 'uren' },
              { val: status.mins, label: 'min' },
            ].map(({ val, label }) => (
              <div key={label} className="border border-border rounded-lg px-4 py-2 text-center min-w-[56px] bg-background/60 backdrop-blur-sm">
                <span className="block text-2xl font-semibold">{val}</span>
                <span className="block text-xs text-muted-foreground uppercase tracking-wide">{label}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function Landing() {
  const [news, setNews] = useState([]);

  useEffect(() => {
    api.get('/news')
      .then(({ data }) => setNews(data.slice(0, 3)))
      .catch(() => {});
  }, []);

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
              <Link to="/donnateur/registreer" className="btn-secondary" data-testid="hero-donnateur-btn">
                Doe een gift
              </Link>
            </div>

            {/* MOBILE: widget onder knoppen */}
            <div className="mt-10 md:hidden">
              <MagazijnWidget align="left" />
            </div>
          </div>

          {/* DESKTOP: widget rechts in hero */}
          <div className="md:col-span-5 hidden md:flex justify-end items-end">
            <MagazijnWidget align="right" />
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

      {/* NIEUWS */}
      {news.length > 0 && (
        <section
          className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-16 border-t border-border"
          data-testid="landing-news-section"
        >
          <div className="flex flex-wrap items-end justify-between gap-3 mb-10">
            <p className="overline">Nieuws</p>
            <Link
              to="/nieuws"
              className="industrial-link text-sm text-foreground"
              data-testid="landing-news-all-link"
            >
              Alle berichten →
            </Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {news.map((p) => {
              const color = CATEGORY_COLORS[p.category] || CATEGORY_COLORS.ander;
              return (
                <Link
                  key={p.id}
                  to={`/nieuws/${p.id}`}
                  data-testid={`landing-news-card-${p.id}`}
                  className="group block border border-border hover:border-foreground transition-colors bg-surface"
                >
                  <div className="aspect-[4/3] overflow-hidden">
                    {p.photo ? (
                      <img
                        src={p.photo}
                        alt={p.title}
                        className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
                      />
                    ) : (
                      <div
                        className="w-full h-full flex items-center justify-center text-white text-2xl font-bold tracking-tight"
                        style={{ backgroundColor: color }}
                      >
                        {CATEGORY_LABELS[p.category]}
                      </div>
                    )}
                  </div>
                  <div className="p-5">
                    <p className="overline" style={{ color }}>{CATEGORY_LABELS[p.category]}</p>
                    <h3 className="mt-2 text-xl font-semibold tracking-tight leading-tight">
                      {p.title}
                    </h3>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

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
