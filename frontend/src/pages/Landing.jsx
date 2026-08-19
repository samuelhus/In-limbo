import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion, useScroll, useTransform } from 'framer-motion';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { CATEGORY_COLORS, formatDateNL, displayDateFor } from './Nieuws';
import { INSPIRATIE_CATEGORY_COLORS } from './Inspiratie';

const HERO_BG =
  'https://res.cloudinary.com/dbjizykvb/image/upload/v1780092187/in-limbo/482df555-c97b-4374-b3b0-ee0302eea5c7/n0elipswg2etu9mmbx4j.jpg';

// Herbruikbare motion-variants — subtiele fade + slide-up, en een stagger-wrapper
// die kind-elementen na elkaar laat verschijnen i.p.v. allemaal tegelijk.
const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } },
};

const fadeScale = {
  hidden: { opacity: 0, scale: 0.94 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] } },
};

const staggerContainer = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.09 } },
};

const MotionLink = motion(Link);

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
  const { t } = useTranslation();
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
            {t('landing.magazijn_open')}
          </p>
          <p className="text-foreground/60 mt-1 text-sm">{t('landing.magazijn_open_until')}</p>
        </>
      ) : (
        <>
          <p className="text-foreground/60 text-sm mb-3">{t('landing.magazijn_next_opening')}</p>
          <div className={`flex gap-3 ${justify}`}>
            {[
              { val: status.days, label: t('landing.magazijn_days') },
              { val: status.hours, label: t('landing.magazijn_hours') },
              { val: status.mins, label: t('landing.magazijn_min') },
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

function MoveNoticeBanner() {
  const { t } = useTranslation();
  return (
    <div className="bg-foreground text-background" data-testid="move-notice-banner">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="inline-block w-3 h-3 rounded-full bg-amber-400 animate-pulse shrink-0" />
        <p className="font-semibold text-base sm:text-lg leading-snug">
          {t('landing.move_notice_title')}
        </p>
        <p className="text-background/80 text-sm sm:text-base leading-snug flex-1 min-w-[200px]">
          {t('landing.move_notice_body')}
        </p>
        <Link
          to="/contact"
          className="shrink-0 text-sm sm:text-base font-semibold underline underline-offset-4 hover:opacity-80"
          data-testid="move-notice-cta"
        >
          {t('landing.move_notice_cta')}
        </Link>
      </div>
    </div>
  );
}

export default function Landing() {
const { t, i18n } = useTranslation();
const { user } = useAuth();
const isLoggedIn = user && typeof user === 'object';
  const [landingPosts, setLandingPosts] = useState([]);
  const [impact, setImpact] = useState(null);
  const heroRef = useRef(null);
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ['start start', 'end start'] });
  const heroBgY = useTransform(scrollYProgress, [0, 1], ['0%', '18%']);

  useEffect(() => {
    Promise.all([
      api.get('/news', { params: { postType: 'nieuws', limit: 1 } }),
      api.get('/news', { params: { postType: 'inspiratie', category: 'partner_project', limit: 1 } }),
      api.get('/news', { params: { postType: 'inspiratie', category: 'artikel', limit: 1 } }),
      api.get('/news', { params: { postType: 'inspiratie', category: 'documentatie', limit: 1 } }),
    ])
      .then(([nieuwsRes, partnerRes, artikelRes, documentatieRes]) => {
        // "Laatste inspiratiepost die geen partnerproject is" = de recentste
        // van artikel/documentatie samen (dat zijn de enige 2 overige categorieën).
        const nonPartnerCandidates = [...artikelRes.data, ...documentatieRes.data];
        const latestNonPartner = nonPartnerCandidates.sort(
          (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
        )[0];
        setLandingPosts([
          ...nieuwsRes.data,
          ...partnerRes.data,
          ...(latestNonPartner ? [latestNonPartner] : []),
        ]);
      })
      .catch(() => {});

    api.get('/impact/platform')
      .then(({ data }) => setImpact(data))
      .catch(() => {});
  }, []);

  return (
    <div className="min-h-[calc(100vh-4rem)]" data-testid="landing-page">
      <MoveNoticeBanner />

      {/* HERO */}
      <section ref={heroRef} className="relative overflow-hidden border-b border-border">
        <motion.div
          className="absolute inset-0 opacity-20 mix-blend-multiply"
          style={{
            backgroundImage: `url(${HERO_BG})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            y: heroBgY,
          }}
        />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 pt-16 sm:pt-24 pb-24 grid grid-cols-1 md:grid-cols-12 gap-12 items-end">
          <motion.div
            className="md:col-span-7"
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
          >
            <motion.h1 variants={fadeUp} className="text-5xl sm:text-6xl lg:text-7xl tracking-tightest font-bold leading-[0.95]">
              {t('landing.hero_title')}
            </motion.h1>
            <motion.p variants={fadeUp} className="mt-8 text-lg text-foreground/80 max-w-xl leading-relaxed">
              {t('landing.hero_subtitle')}
            </motion.p>
            <motion.div variants={fadeUp} className="mt-10 flex flex-wrap gap-4" data-testid="hero-cta">
              <Link to="/catalogus" className="btn-primary" data-testid="hero-catalogus-btn">
                {t('landing.explore_catalogus')}
              </Link>
              {isLoggedIn ? (
                <>
                  <Link to="/aanbieding/nieuw" className="btn-primary" data-testid="hero-new-listing-btn">
                    {t('nav.new_listing')} →
                  </Link>
                  {user.role !== 'donateur' && (
                    <Link to="/zoekertje/nieuw" className="btn-primary" data-testid="hero-new-search-request-btn">
                      {t('nav.new_search_request')} →
                    </Link>
                  )}
                </>
              ) : (
                <>
                  <Link to="/registreer" className="btn-secondary" data-testid="hero-register-btn">
                    {t('nav.join_member')}
                  </Link>
                  <Link to="/donateur/registreer" className="btn-secondary" data-testid="hero-donateur-btn">
                    {t('nav.donate_material')}
                  </Link>
                </>
              )}
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* MANIFESTO */}
      <motion.section
        className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-24 grid grid-cols-1 md:grid-cols-12 gap-8"
        variants={staggerContainer}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: '-100px' }}
      >
        <motion.div variants={fadeUp} className="md:col-span-4">
          <p className="overline">{t('landing.het_idee')}</p>
        </motion.div>
        <motion.div variants={fadeUp} className="md:col-span-8 space-y-6 text-lg leading-relaxed">
          <p>
            {t('landing.p1')}
          </p>
          <p>
            {t('landing.p2')}
          </p>
        </motion.div>
      </motion.section>

      {/* IMPACT WIDGET */}
      {impact && (impact.totalWeightKg > 0 || impact.totalCo2Kg > 0) && (
        <section
          className="border-t border-border bg-[#ADEBB3]"
          data-testid="landing-impact-widget"
        >
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-16">
            <p className="overline mb-2">Sinds de lancering van deze website — augustus 2026</p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-10">
              Onze impact tot nu toe
            </h2>
            <motion.div
              className="grid grid-cols-1 sm:grid-cols-2 gap-8 mb-6"
              variants={staggerContainer}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: '-100px' }}
            >
              <motion.div variants={fadeScale} data-testid="landing-impact-weight">
                <p className="text-5xl sm:text-6xl font-bold tracking-tight tabular-nums">
                  {impact.totalWeightKg.toLocaleString('nl-BE')}
                </p>
                <p className="mt-2 text-sm uppercase tracking-widest text-foreground/70">
                  kg materiaal hergebruikt
                </p>
              </motion.div>
              <motion.div variants={fadeScale} data-testid="landing-impact-co2">
                <p className="text-5xl sm:text-6xl font-bold tracking-tight tabular-nums">
                  {impact.totalCo2Kg.toLocaleString('nl-BE')}
                </p>
                <p className="mt-2 text-sm uppercase tracking-widest text-foreground/70">
                  kg CO2-equivalent bespaard
                </p>
              </motion.div>
            </motion.div>
            <Link
              to="/impact-methodologie"
              className="industrial-link text-sm"
              data-testid="landing-impact-methodology-link"
            >
              Hoe berekenen we dit? →
            </Link>
          </div>
        </section>
      )}
      {/*
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
      */}

      {/* NIEUWS & INSPIRATIE */}
      {landingPosts.length > 0 && (
        <section
          className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-16 border-t border-border"
          data-testid="landing-news-section"
        >
          <div className="flex flex-wrap items-end justify-between gap-3 mb-10">
            <p className="overline">{t('news.title')}</p>
            <div className="flex gap-4">
              <Link
                to="/nieuws"
                className="industrial-link text-sm text-foreground"
                data-testid="landing-news-all-link"
              >
                {t('landing.news_view_all')}
              </Link>
              <Link
                to="/inspiratie"
                className="industrial-link text-sm text-foreground"
                data-testid="landing-inspiratie-all-link"
              >
                {t('landing.inspiratie_view_all')}
              </Link>
            </div>
          </div>
          <motion.div
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6"
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-80px' }}
          >
            {landingPosts.map((p) => {
              const isInspiratie = p.postType === 'inspiratie';
              const lang = i18n.language?.startsWith('fr') ? 'fr' : 'nl';
              const title = lang === 'fr' ? (p.titleFr || p.titleNl) : (p.titleNl || p.titleFr);
              const color = isInspiratie
                ? (INSPIRATIE_CATEGORY_COLORS[p.category] || INSPIRATIE_CATEGORY_COLORS.artikel)
                : (CATEGORY_COLORS[p.category] || CATEGORY_COLORS.nieuws);
              const label = isInspiratie ? t(`inspiratie.category_${p.category}`) : t(`news.category_${p.category}`);
              const cover = p.photo || (p.photos && p.photos[0]);
              const href = isInspiratie ? `/inspiratie/${p.id}` : `/nieuws/${p.id}`;
              // EVENT_DATE_CATEGORIES bevat enkel nieuws-categorieën, dus dit
              // valt voor inspiratie-posts vanzelf terug op createdAt.
              const { date, isEventDate } = displayDateFor(p);
              return (
                <MotionLink
                  key={p.id}
                  to={href}
                  variants={fadeUp}
                  data-testid={`landing-post-${p.id}`}
                  className="group block border border-border hover:border-foreground transition-colors bg-surface"
                >
                  <div className="aspect-[4/3] overflow-hidden">
                    {cover ? (
                      <img
                        src={cover}
                        alt={title}
                        className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
                      />
                    ) : (
                      <div
                        className="w-full h-full flex items-center justify-center text-white text-3xl font-bold tracking-tight"
                        style={{ backgroundColor: color }}
                      >
                        {label}
                      </div>
                    )}
                  </div>
                  <div className="p-5">
                    <p className="overline" style={{ color }}>{label}</p>
                    <h3 className="mt-2 text-xl font-semibold tracking-tight leading-tight">
                      {title}
                    </h3>
                    <p className="mt-3 text-xs text-muted-foreground">
                      {isEventDate && <span className="font-medium text-foreground/70">{t('news.event_date_label')}: </span>}
                      {formatDateNL(date)}
                    </p>
                  </div>
                </MotionLink>
              );
            })}
          </motion.div>
        </section>
      )}

      {/* CTA */}
      {!isLoggedIn && (
        <motion.section
          className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-24 border-t border-border"
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-100px' }}
        >
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-8">
            <h2 className="text-4xl sm:text-5xl font-bold tracking-tight max-w-2xl">
              {t('landing.cta_section_title')}
            </h2>
            <div className="flex flex-wrap gap-3">
              <Link to="/registreer" className="btn-primary" data-testid="cta-register-btn">
                {t('auth.register_link')} →
              </Link>
              <Link to="/donateur/registreer" className="btn-secondary" data-testid="cta-donateur-btn">
                {t('nav.donate_material')} →
              </Link>
            </div>
          </div>
        </motion.section>
      )}
    </div>
  );
}
