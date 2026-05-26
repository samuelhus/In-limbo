import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';
import { cloudinaryThumb } from '@/lib/cloudinary';

const STATUS_GROUPS = [
  { key: 'selected', label: 'Geselecteerd', tone: 'border-green-500 bg-green-50' },
  { key: 'open', label: 'In behandeling', tone: 'border-foreground bg-surface' },
  { key: 'not_selected', label: 'Niet geselecteerd', tone: 'border-border bg-muted' },
  { key: 'withdrawn', label: 'Ingetrokken', tone: 'border-border bg-muted/50 opacity-70' },
];

const APP_STATUS_LABELS = {
  open: 'In behandeling',
  selected: 'Geselecteerd',
  not_selected: 'Niet geselecteerd',
  withdrawn: 'Ingetrokken',
};

export default function MijnAanvragen() {
  const [apps, setApps] = useState(null);

  useEffect(() => {
    api.get('/applications/mine').then(({ data }) => setApps(data)).catch(() => setApps([]));
  }, []);

  if (apps === null) {
    return <div className="max-w-5xl mx-auto px-4 py-24 text-muted-foreground" data-testid="aanvragen-loading">Laden…</div>;
  }

  const grouped = STATUS_GROUPS.map((g) => ({
    ...g, items: apps.filter((a) => a.status === g.key),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-10 py-12" data-testid="aanvragen-page">
      <p className="overline">Mijn aanvragen · {apps.length}</p>
      <h1 className="mt-2 text-4xl font-bold tracking-tight mb-10">Wat ik aanvroeg</h1>

      {apps.length === 0 && (
        <p className="text-muted-foreground" data-testid="aanvragen-empty">
          Je hebt nog geen aanvragen ingediend. <Link to="/catalogus" className="industrial-link text-foreground">Bekijk de catalogus →</Link>
        </p>
      )}

      {grouped.map((g) => (
        <section key={g.key} className="mb-12" data-testid={`aanvragen-group-${g.key}`}>
          <p className="overline mb-4">{g.label} · {g.items.length}</p>
          <ul className="space-y-3">
            {g.items.map((a) => (
              <li key={a.id} data-testid={`aanvragen-item-${a.id}`}>
                <Link
                  to={`/aanbieding/${a.listing?.id || ''}`}
                  className={`block border-l-4 ${g.tone} border-border px-4 py-3 flex items-center gap-4 hover:bg-muted/60 transition-colors`}
                >
                  <div className="w-16 h-16 bg-muted overflow-hidden flex-shrink-0">
                    {a.listing?.photo && (
                      <img src={cloudinaryThumb(a.listing.photo, 200, 200)} alt="" className="w-full h-full object-cover" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{a.listing?.title || 'Aanbieding'}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {a.listing?.organisationName} · ingediend op {new Date(a.createdAt).toLocaleDateString('nl-BE')}
                    </p>
                    <p className="text-xs text-foreground/70 italic line-clamp-1 mt-1">"{a.motivation}"</p>
                  </div>
                  <span className="text-xs uppercase tracking-widest text-muted-foreground whitespace-nowrap">
                    {APP_STATUS_LABELS[a.status]}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
