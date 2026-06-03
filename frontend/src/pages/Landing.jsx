import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';
import { CATEGORY_LABELS, CATEGORY_COLORS, formatDateNL } from './Nieuws';

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
  const [activeSlide, setActiveSlide] = useState(0);
  const timerRef = useRef(null);

  useEffect(() => {
    api.get('/news')
      .then(({ data }) => setNews(data.slice(0, 5)))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (news.length === 0) return;
    timerRef.current = setInterval(() => {
      setActiveSlide((prev) => (prev + 1) % news.length);
    }, 5000);
    return () => clearInterval(timerRef.current);
  }, [news.length]);

  const goTo = (index) => {
    clearInterval(timerRef.current);
    setActiveSlide(index);
    timerRef.current = setInterval(() => {
      setActiveSlide((prev) => (prev + 1) % news.length);
    }, 5000);
  };

  const prevSlide = () => goTo((activeSlide - 1 + news.length) % news.length);
  const nextSlide = () => goTo((activeSlide + 1) % news.length);

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
              <Link to="/donateur/registreer" className="btn-secondary" data-testid="hero-donateur-btn">
                Doneer materiaal
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
          <div className="grid grid-cols-1">
            {news.length > 0 && (() => {
              const p = news[activeSlide];
              const color = CATEGORY_COLORS[p.category] || CATEGORY_COLORS.ander;
              return (
                <div className="relative overflow-hidden" data-testid="landing-news-slider">
                  <Link
                    to={`/nieuws/${p.id}`}
                    className="block relative aspect-[16/7] overflow-hidden group"
                    data-testid={`landing-news-slide-${p.id}`}
                  >
                    {p.photo ? (
                      <img
                        src={p.photo}
                        alt={p.title}
                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.02]"
                      />
                    ) : (
                      <div className="w-full h-full" style={{ backgroundColor: color }} />
                    )}

                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />

                    <div className="absolute bottom-0 left-0 right-0 p-6 sm:p-10">
                      <div className="flex items-center gap-3 mb-3">
                        <span
                          className="text-xs font-medium uppercase tracking-widest px-2 py-0.5"
                          style={{ backgroundColor: color, color: '#fff' }}
                        >
                          {CATEGORY_LABELS[p.category]}
                        </span>
                        <span className="text-xs text-white/60">
                          {formatDateNL(p.createdAt)}
                        </span>
                      </div>
                      <h3 className="text-2xl sm:text-3xl font-bold tracking-tight text-white leading-tight mb-3 max-w-2xl">
                        {p.title}
                      </h3>
                      {p.content && (
                        <p className="text-sm text-white/75 leading-relaxed max-w-xl line-clamp-2">
                          {p.content.replace(/<[^>]+>/g, '').slice(0, 160)}
                          {p.content.length > 160 ? '…' : ''}
                        </p>
                      )}
                    </div>
                  </Link>

                  {news.length > 1 && (
                    <>
                      <button
                        onClick={(e) => { e.preventDefault(); prevSlide(); }}
                        className="absolute left-4 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/70 text-white w-10 h-10 flex items-center justify-center transition-colors"
                        aria-label="Vorige"
                        data-testid="slider-prev"
                      >
                        ←
                      </button>

                      <button
                        onClick={(e) => { e.preventDefault(); nextSlide(); }}
                        className="absolute right-4 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/70 text-white w-10 h-10 flex items-center justify-center transition-colors"
                        aria-label="Volgende"
                        data-testid="slider-next"
                      >
                        →
                      </button>

                      <div className="absolute bottom-4 right-6 flex gap-2">
                        {news.map((_, i) => (
                          <button
                            key={i}
                            onClick={(e) => { e.preventDefault(); goTo(i); }}
                            className={`h-2 transition-all ${
                              i === activeSlide ? 'bg-white w-6' : 'bg-white/40 hover:bg-white/70 w-2'
                            }`}
                            aria-label={`Slide ${i + 1}`}
                            data-testid={`slider-dot-${i}`}
                          />
                        ))}
                      </div>
                    </>
                  )}
                </div>
              );
            })()}
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
            <Link to="/donateur/registreer" className="btn-secondary" data-testid="cta-donateur-btn">
              Doneer materiaal →
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
