import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/api';
import StatusBadge from '@/components/StatusBadge';
import { cloudinaryThumb } from '@/lib/cloudinary';
import Lightbox from '@/components/Lightbox';

export default function OrganisationPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const [org, setOrg] = useState(null);
  const [listings, setListings] = useState([]);
  const [listingsError, setListingsError] = useState(false);
  const [impact, setImpact] = useState(null);
  const [lightboxIndex, setLightboxIndex] = useState(null);

  useEffect(() => {
    // Reset bij elke org-wissel (bv. via een link van org A naar org B, zonder
    // page reload) — anders blijft de vorige org zichtbaar terwijl de nieuwe
    // nog laadt, of wint een trage respons voor org A alsnog van een snellere
    // voor org B als ze door elkaar toekomen.
    let cancelled = false;
    setOrg(null);
    setListings([]);
    setListingsError(false);
    setImpact(null);
    setLightboxIndex(null);

    api.get(`/organisations/${id}`)
      .then(({ data }) => { if (!cancelled) setOrg(data); })
      .catch(() => { if (!cancelled) setOrg(false); });
    api.get(`/organisations/${id}/listings`)
      .then(({ data }) => { if (!cancelled) setListings(data); })
      .catch(() => { if (!cancelled) setListingsError(true); });
    api.get(`/organisations/${id}/stats/impact`)
      .then(({ data }) => { if (!cancelled) setImpact(data); })
      .catch(() => {}); // niet kritiek — impact-widget toont zich dan gewoon niet

    return () => { cancelled = true; };
  }, [id]);

  if (org === null) return <div className="max-w-5xl mx-auto px-4 py-24 text-muted-foreground">{t('common.loading')}</div>;
  if (!org) return <div className="max-w-5xl mx-auto px-4 py-24" data-testid="org-not-found">{t('organisation.page_title')}: —</div>;

  const herbestemd = listings.filter((l) => l.status === 'herbestemd');
  const active = listings.filter((l) => l.status !== 'herbestemd' && l.status !== 'gearchiveerd');
  // Eerste foto = banner bovenaan, de rest komt als galerij onderaan de info.
  const galleryPhotos = org.photos?.slice(1) || [];

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-10 py-12" data-testid="organisation-page">

      <h1 className="text-5xl font-bold tracking-tight">{org.name}</h1>
      <p className="text-3xl font-bold tracking-tight">-{t(`org_categories.${org.category}`)}-</p>

      {org.photos?.[0] && (
        <button
          type="button"
          onClick={() => setLightboxIndex(0)}
          className="mt-10 block w-full aspect-[21/9] overflow-hidden bg-muted cursor-zoom-in"
          data-testid="org-banner-button"
        >
          <img src={cloudinaryThumb(org.photos[0], 1600, 700)} alt={org.name} className="w-full h-full object-cover hover:scale-[1.02] transition-transform duration-300" />
        </button>
      )}

      <div className="mt-12 grid grid-cols-1 md:grid-cols-12 gap-10">
        <div className="md:col-span-7">
          <p className="overline mb-2">{t('organisation.description')}</p>
          <p className="text-foreground/85 leading-relaxed whitespace-pre-wrap text-lg">{org.description}</p>
        </div>
        <aside className="md:col-span-5 md:border-l md:border-border md:pl-10 space-y-6">
          {org.address && (
            <div>
              <p className="overline mb-1">{t('organisation.address')}</p>
              <p className="text-foreground/85">{org.address}</p>
            </div>
          )}
          {org.website && (
            <div>
              <p className="overline mb-1">{t('organisation.website')}</p>
              <a
                href={/^https?:\/\//i.test(org.website) ? org.website : `https://${org.website}`}
                target="_blank"
                rel="noreferrer"
                className="industrial-link"
                data-testid="org-website-link"
              >
                {org.website.replace(/^https?:\/\//, '')}
              </a>
            </div>
          )}

        </aside>
      </div>

      {galleryPhotos.length > 0 && (
        <div className="mt-10" data-testid="org-gallery">
          <p className="overline mb-3">{t('organisation.more_photos')}</p>
          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
            {galleryPhotos.map((url, i) => (
              <button
                type="button"
                key={url}
                onClick={() => setLightboxIndex(i + 1)}
                className="aspect-square overflow-hidden cursor-zoom-in bg-muted"
                data-testid={`org-gallery-thumb-${i}`}
              >
                <img
                  src={cloudinaryThumb(url, 400, 400)}
                  alt={`${org.name} ${i + 2}`}
                  className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
                />
              </button>
            ))}
          </div>
        </div>
      )}

      {lightboxIndex !== null && (
        <Lightbox
          photos={org.photos}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onNavigate={setLightboxIndex}
        />
      )}

      {impact && (impact.totalWeightKg > 0 || impact.totalCo2Kg > 0) && (
        <section
          className="mt-16 -mx-4 sm:-mx-6 lg:-mx-10 px-4 sm:px-6 lg:px-10 py-12 bg-[#ADEBB3]"
          data-testid="org-impact-widget"
        >
          <p className="overline mb-2">{t('organisation.impact_title')}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 mb-4">
            <div data-testid="org-impact-weight">
              <p className="text-4xl sm:text-5xl font-bold tracking-tight tabular-nums">
                {impact.totalWeightKg.toLocaleString('nl-BE')}
              </p>
              <p className="mt-2 text-xs uppercase tracking-widest text-foreground/70">
                {t('organisation.impact_weight_label')}
              </p>
            </div>
            <div data-testid="org-impact-co2">
              <p className="text-4xl sm:text-5xl font-bold tracking-tight tabular-nums">
                {impact.totalCo2Kg.toLocaleString('nl-BE')}
              </p>
              <p className="mt-2 text-xs uppercase tracking-widest text-foreground/70">
                {t('organisation.impact_co2_label')}
              </p>
            </div>
          </div>
          <Link to="/impact-methodologie" className="industrial-link text-sm" data-testid="org-impact-methodology-link">
            {t('organisation.impact_methodology_link')}
          </Link>
        </section>
      )}

      {listingsError && (
        <p className="mt-20 text-sm text-destructive" data-testid="org-listings-error">
          {t('organisation.listings_load_error')}
        </p>
      )}

      {active.length > 0 && (
        <section className="mt-20 border-t border-border pt-10">
          <p className="overline mb-6">{t('organisation.active_listings')} · {active.length}</p>
          <ListingsGrid items={active} />
        </section>
      )}

      {herbestemd.length > 0 && (
        <section className="mt-20 border-t border-border pt-10">
          <p className="overline mb-6">{t('listing.status_herbestemd')} · {herbestemd.length}</p>
          <ListingsGrid items={herbestemd} muted />
        </section>
      )}
    </div>
  );
}

function ListingsGrid({ items, muted = false }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-10">
      {items.map((item) => (
        <Link
          key={item.id}
          to={`/aanbieding/${item.slug || item.id}`}
          data-testid={`org-listing-${item.id}`}
          className={`group block ${muted ? 'opacity-70' : ''}`}
        >
          <div className="aspect-[4/5] bg-muted overflow-hidden relative">
            {item.photos?.[0] ? (
              <img src={cloudinaryThumb(item.photos[0], 600, 750)} alt={item.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
            ) : <div className="w-full h-full" />}
            <div className="absolute top-2 left-2"><StatusBadge status={item.status} size="xs" /></div>
          </div>
          <h3 className="mt-2 text-sm font-medium line-clamp-2 group-hover:underline">{item.title}</h3>
          <p className="text-xs text-muted-foreground uppercase tracking-wider">{item.material}</p>
        </Link>
      ))}
    </div>
  );
}
