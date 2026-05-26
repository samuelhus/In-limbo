import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '@/lib/api';
import StatusBadge from '@/components/StatusBadge';
import { cloudinaryThumb } from '@/lib/cloudinary';
import { useAuth } from '@/contexts/AuthContext';

export default function ListingDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const [item, setItem] = useState(null);
  const [active, setActive] = useState(0);

  useEffect(() => {
    api.get(`/listings/${id}`).then(({ data }) => setItem(data)).catch(() => setItem(false));
  }, [id]);

  if (item === null) {
    return <div className="max-w-5xl mx-auto px-4 py-24 text-muted-foreground" data-testid="listing-loading">Laden…</div>;
  }
  if (item === false) {
    return <div className="max-w-5xl mx-auto px-4 py-24" data-testid="listing-not-found">Aanbieding niet gevonden.</div>;
  }

  const limited = item.limited;
  const photos = item.photos || [];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-12" data-testid="listing-detail-page">
      <div className="grid grid-cols-1 md:grid-cols-12 gap-10">
        {/* Photos */}
        <div className="md:col-span-7">
          <div className="aspect-square bg-muted overflow-hidden">
            {photos.length > 0 ? (
              <img
                src={cloudinaryThumb(photos[active], 1400, 1400)}
                alt={item.title}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-muted-foreground">geen foto</div>
            )}
          </div>
          {photos.length > 1 && (
            <div className="mt-3 grid grid-cols-5 gap-2" data-testid="listing-thumbnails">
              {photos.map((p, i) => (
                <button
                  key={i}
                  onClick={() => setActive(i)}
                  className={`aspect-square overflow-hidden border ${i === active ? 'border-foreground' : 'border-transparent'}`}
                  data-testid={`listing-thumb-${i}`}
                >
                  <img src={cloudinaryThumb(p, 200, 200)} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Meta */}
        <div className="md:col-span-5">
          <div className="flex items-center gap-3 mb-4">
            <StatusBadge status={item.status} size="lg" />
            {item.isRecurrent && (
              <span className="overline">Recurrent</span>
            )}
          </div>
          <h1 className="text-4xl font-bold tracking-tight mb-6">{item.title}</h1>

          {limited && (
            <div className="border border-foreground p-6 my-8 bg-surface" data-testid="listing-limited-cta">
              <p className="overline mb-3">Beperkte weergave</p>
              <p className="text-foreground/85 leading-relaxed">
                Log in of vraag toegang aan om de volledige aanbieding te bekijken
                (beschrijving, gewicht, contact, organisatie).
              </p>
              <div className="mt-5 flex gap-3">
                <Link to="/login" className="btn-primary !py-2 !px-4 text-xs">Inloggen</Link>
                <Link to="/registreer" className="btn-secondary !py-2 !px-4 text-xs">Registreer</Link>
              </div>
            </div>
          )}

          {!limited && (
            <>
              <p className="text-foreground/85 leading-relaxed whitespace-pre-wrap mb-8">{item.description}</p>

              <dl className="grid grid-cols-2 gap-y-4 gap-x-6 mb-8 text-sm" data-testid="listing-meta">
                <div>
                  <dt className="overline mb-1">Materiaal</dt>
                  <dd>{item.material}</dd>
                </div>
                <div>
                  <dt className="overline mb-1">Gewicht</dt>
                  <dd>{item.weight} kg</dd>
                </div>
                {item.dimensions && (
                  <div className="col-span-2">
                    <dt className="overline mb-1">Afmetingen</dt>
                    <dd>{item.dimensions}</dd>
                  </div>
                )}
                {item.transport && (
                  <div className="col-span-2">
                    <dt className="overline mb-1">Transport</dt>
                    <dd>{item.transport}</dd>
                  </div>
                )}
                {item.deadline && (
                  <div>
                    <dt className="overline mb-1">Deadline</dt>
                    <dd>{new Date(item.deadline).toLocaleDateString('nl-BE')}</dd>
                  </div>
                )}
              </dl>

              {item.organisation && (
                <div className="border-t border-border pt-6">
                  <p className="overline mb-2">Aangeboden door</p>
                  <Link
                    to={`/organisaties/${item.organisation.id}`}
                    className="industrial-link font-medium text-lg"
                    data-testid="listing-org-link"
                  >
                    {item.organisation.name}
                  </Link>
                  <p className="text-xs text-muted-foreground mt-1">{item.organisation.category}</p>
                </div>
              )}

              {item.offererEmail && (
                <div className="mt-6 border border-border p-5 bg-surface" data-testid="listing-recurrent-contact">
                  <p className="overline mb-2">Contact (recurrente aanbieding)</p>
                  <a href={`mailto:${item.offererEmail}`} className="text-base industrial-link">{item.offererEmail}</a>
                </div>
              )}

              {user && user.status === 'validated' && (
                <p className="mt-10 text-xs text-muted-foreground italic">
                  Aanvraagflow komt in een volgende iteratie van in—limbo.
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
