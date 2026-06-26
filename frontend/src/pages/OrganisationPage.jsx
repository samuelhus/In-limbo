import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/api';
import StatusBadge from '@/components/StatusBadge';
import { cloudinaryThumb } from '@/lib/cloudinary';

export default function OrganisationPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const [org, setOrg] = useState(null);
  const [listings, setListings] = useState([]);

  useEffect(() => {
    api.get(`/organisations/${id}`).then(({ data }) => setOrg(data)).catch(() => setOrg(false));
    api.get(`/organisations/${id}/listings`).then(({ data }) => setListings(data)).catch(() => {});
  }, [id]);

  if (org === null) return <div className="max-w-5xl mx-auto px-4 py-24 text-muted-foreground">{t('common.loading')}</div>;
  if (!org) return <div className="max-w-5xl mx-auto px-4 py-24" data-testid="org-not-found">{t('organisation.page_title')}: —</div>;

  const herbestemd = listings.filter((l) => l.status === 'herbestemd');
  const active = listings.filter((l) => l.status !== 'herbestemd' && l.status !== 'gearchiveerd');

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-10 py-12" data-testid="organisation-page">
      
      <h1 className="text-5xl font-bold tracking-tight">{org.name}</h1>
      <p className="text-3xl font-bold tracking-tight">-{t(`org_categories.${org.category}`)}-</p>

      {org.photos?.[0] && (
        <div className="mt-10 aspect-[21/9] overflow-hidden bg-muted">
          <img src={cloudinaryThumb(org.photos[0], 1600, 700)} alt={org.name} className="w-full h-full object-cover" />
        </div>
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
              <a href={org.website} target="_blank" rel="noreferrer" className="industrial-link" data-testid="org-website-link">
                {org.website.replace(/^https?:\/\//, '')}
              </a>
            </div>
          )}
          
        </aside>
      </div>

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
          to={`/aanbieding/${item.id}`}
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
