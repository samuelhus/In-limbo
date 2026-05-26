import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';
import { cloudinaryThumb } from '@/lib/cloudinary';
import StatusBadge from '@/components/StatusBadge';

const STATUS_GROUPS = [
  { key: 'beschikbaar', label: 'Beschikbaar' },
  { key: 'in_afwachting', label: 'In afwachting' },
  { key: 'herbestemd', label: 'Herbestemd' },
  { key: 'in_magazijn', label: 'In magazijn' },
  { key: 'gearchiveerd', label: 'Gearchiveerd' },
];

const COUNT_VISIBLE_STATUSES = new Set(['beschikbaar', 'in_afwachting']);

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
  const [items, setItems] = useState(null);

  useEffect(() => {
    api.get('/listings/mine').then(({ data }) => setItems(data)).catch(() => setItems([]));
  }, []);

  if (items === null) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-24 text-muted-foreground" data-testid="mijn-aanbiedingen-loading">
        Laden…
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-24" data-testid="mijn-aanbiedingen-empty">
        <p className="overline mb-3">Mijn aanbiedingen</p>
        <h1 className="text-4xl font-bold tracking-tight">Je hebt nog geen aanbiedingen geplaatst</h1>
        <p className="mt-4 text-foreground/75 max-w-xl">
          Heb je materiaal dat je wil doorgeven? Plaats je eerste aanbieding en
          help het in transit te brengen.
        </p>
        <Link
          to="/aanbieding/nieuw"
          className="btn-primary mt-8 inline-flex"
          data-testid="mijn-aanbiedingen-create-btn"
        >
          Plaats een aanbieding →
        </Link>
      </div>
    );
  }

  const grouped = STATUS_GROUPS.map((g) => ({
    ...g, items: items.filter((it) => it.status === g.key),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-10 py-12" data-testid="mijn-aanbiedingen-page">
      <p className="overline">Mijn aanbiedingen · {items.length}</p>
      <h1 className="mt-2 text-4xl font-bold tracking-tight mb-10">Wat ik aanbied</h1>

      {grouped.map((g) => (
        <section key={g.key} className="mb-12" data-testid={`mijn-aanbiedingen-group-${g.key}`}>
          <p className="overline mb-4">{g.label} · {g.items.length}</p>
          <ul className="space-y-3">
            {g.items.map((it) => {
              const photo = it.photos?.[0];
              const showCount = COUNT_VISIBLE_STATUSES.has(it.status);
              return (
                <li key={it.id} data-testid={`mijn-aanbiedingen-item-${it.id}`}>
                  <Link
                    to={`/aanbieding/${it.id}`}
                    className="block border-l-4 border-border bg-surface px-4 py-3 flex items-center gap-4 hover:bg-muted/60 transition-colors"
                  >
                    <div className="w-16 h-16 bg-muted overflow-hidden flex-shrink-0">
                      {photo && (
                        <img src={cloudinaryThumb(photo, 200, 200)} alt="" className="w-full h-full object-cover" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{it.title}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Geplaatst op {formatDate(it.createdAt)}
                        {showCount && (
                          <span data-testid={`mijn-aanbiedingen-count-${it.id}`}>
                            {' · '}
                            <span className="text-foreground/80 font-medium">
                              {it.openApplicationCount} {it.openApplicationCount === 1 ? 'aanvraag' : 'aanvragen'}
                            </span>
                          </span>
                        )}
                      </p>
                    </div>
                    <StatusBadge status={it.status} size="xs" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
