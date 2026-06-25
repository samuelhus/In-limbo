import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/api';
import { cloudinaryThumb } from '@/lib/cloudinary';
import StatusBadge from '@/components/StatusBadge';

const STATUS_GROUPS = [
  { key: 'beschikbaar', labelKey: 'listing.status_beschikbaar' },
  { key: 'herbestemd', labelKey: 'listing.status_herbestemd' },
  { key: 'in_magazijn', labelKey: 'listing.status_in_magazijn' },
  { key: 'gearchiveerd', labelKey: 'listing.status_gearchiveerd' },
];

const COUNT_VISIBLE_STATUSES = new Set(['beschikbaar']);

const formatDate = (iso) => {
  try {
    return new Date(iso).toLocaleDateString('nl-BE', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    });
  } catch {
    return '';
  }
};

export default function MijnAanbiedingen() {
  const { t } = useTranslation();
  const [items, setItems] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    api.get('/listings/mine').then(({ data }) => setItems(data)).catch(() => setItems([]));
  }, []);

  if (items === null) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-24 text-muted-foreground" data-testid="mijn-aanbiedingen-loading">
        {t('common.loading')}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-24" data-testid="mijn-aanbiedingen-empty">
        <p className="overline mb-3">{t('nav.my_listings')}</p>
        <h1 className="text-4xl font-bold tracking-tight">{t('listing.no_listings')}</h1>
        <p className="mt-4 text-foreground/75 max-w-xl">
          {t('listing.empty_subtitle')}
        </p>
        <Link
          to="/aanbieding/nieuw"
          className="btn-primary mt-8 inline-flex"
          data-testid="mijn-aanbiedingen-create-btn"
        >
          {t('listing.create_first')} →
        </Link>
      </div>
    );
  }

  const grouped = STATUS_GROUPS.map((g) => ({
    ...g, items: items.filter((it) => it.status === g.key),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-10 py-12" data-testid="mijn-aanbiedingen-page">
      <p className="overline">{t('nav.my_listings')} · {items.length}</p>
      <h1 className="mt-2 text-4xl font-bold tracking-tight mb-10">{t('nav.my_listings')}</h1>

      {grouped.map((g) => (
        <section key={g.key} className="mb-12" data-testid={`mijn-aanbiedingen-group-${g.key}`}>
          <p className="overline mb-4">{t(g.labelKey)} · {g.items.length}</p>
          <ul className="space-y-3">
            {g.items.map((it) => {
              const photo = it.photos?.[0];
              const showCount = COUNT_VISIBLE_STATUSES.has(it.status);
              return (
                <li key={it.id} data-testid={`mijn-aanbiedingen-item-${it.id}`}>
                  <div
                    role="link"
                    tabIndex={0}
                    onClick={() => navigate(`/aanbieding/${it.id}`)}
                    onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && navigate(`/aanbieding/${it.id}`)}
                    className="cursor-pointer border-l-4 border-border bg-surface px-4 py-3 flex items-center gap-4 hover:bg-muted/60 transition-colors"
                  >
                    <div className="w-16 h-16 bg-muted overflow-hidden flex-shrink-0">
                      {photo && (
                        <img src={cloudinaryThumb(photo, 200, 200)} alt="" className="w-full h-full object-cover" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{it.title}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {t('listing.posted_on', { date: formatDate(it.createdAt) })}
                      </p>
                    </div>
                    {showCount && it.openApplicationCount > 0 && (
                      <span
                        className="inline-flex items-center gap-1 rounded-full bg-orange-100 text-orange-700 border border-orange-300 px-2.5 py-0.5 text-xs font-medium whitespace-nowrap"
                        data-testid={`mijn-aanbiedingen-badge-${it.id}`}
                      >
                        ● {t('listing.application_count', { count: it.openApplicationCount })}
                      </span>
                    )}
                    {['beschikbaar', 'gearchiveerd'].includes(it.status) && (
                      <Link
                        to={`/aanbieding/${it.id}/bewerken`}
                        onClick={(e) => e.stopPropagation()}
                        className="btn-secondary !py-1 px-3 text-xs"
                        data-testid={`edit-listing-btn-${it.id}`}
                      >
                        {t('common.edit')}
                      </Link>
                    )}
                    <StatusBadge status={it.status} size="xs" />
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
