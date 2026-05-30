import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import StatusBadge from '@/components/StatusBadge';
import { cloudinaryThumb } from '@/lib/cloudinary';
import { useAuth } from '@/contexts/AuthContext';

const STATUS_OPTIONS = [
  { v: 'beschikbaar', l: 'Beschikbaar' },
  { v: 'in_magazijn', l: 'In magazijn' },
  { v: 'herbestemd', l: 'Herbestemd' },
];

function FilterPanel({ status, setStatus, onClose }) {
  return (
    <div className="space-y-6" data-testid="filter-panel">
      <div>
        <p className="overline mb-3">Status</p>
        <ul className="space-y-2">
          {STATUS_OPTIONS.map((opt) => (
            <li key={opt.v}>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="status-filter"
                  checked={status === opt.v}
                  onChange={() => { setStatus(opt.v); onClose?.(); }}
                  data-testid={`filter-status-${opt.v}`}
                />
                <span className="text-sm">{opt.l}</span>
              </label>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function ListingTile({ item, isValidated }) {
  const navigate = useNavigate();
  const photo = item.photos?.[0];
  const isDonnateurOffer = !item.limited && item.offererIsDonnateur && item.offererUsername;
  const showOfferer = !item.limited && item.offererFirstName && item.organisation;

  const goToListing = () => navigate(`/aanbieding/${item.id}`);
  const goToOrg = (e) => {
    e.stopPropagation();
    e.preventDefault();
    navigate(`/organisaties/${item.organisation.id}`);
  };

  return (
    <div
      onClick={goToListing}
      role="link"
      tabIndex={0}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && goToListing()}
      data-testid={`listing-tile-${item.id}`}
      className="group block animate-fade-in cursor-pointer"
    >
      <div className="aspect-[4/5] bg-muted overflow-hidden relative">
        {photo ? (
          <img
            src={cloudinaryThumb(photo, 800, 1000)}
            alt={item.title}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">geen foto</div>
        )}
        <div className="absolute top-3 left-3"><StatusBadge status={item.status} /></div>
        {item.isRecurrent && (
          <div className="absolute bottom-3 left-3 text-[10px] uppercase tracking-widest bg-background/90 px-2 py-0.5">
            Recurrent
          </div>
        )}
        {item.status === 'in_magazijn' && (
          <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 text-center bg-[#BBF7D0]/80 py-2 font-heading tracking-[0.3em] uppercase text-xs text-[#14532D]">
            Magazijn
          </div>
        )}
      </div>
      <div className="mt-3">
        <h3 className="font-medium text-base leading-snug group-hover:underline underline-offset-4 line-clamp-2">
          {item.title}
        </h3>
        <p className="mt-1 text-xs text-muted-foreground uppercase tracking-wider">{item.material}</p>
        {isDonnateurOffer && (
          <p className="mt-1 text-xs text-muted-foreground" data-testid={`listing-tile-donnateur-${item.id}`}>
            Aangeboden door <span className="font-medium text-foreground/85">{item.offererUsername}</span>{' '}
            <span className="text-muted-foreground italic">(geen In Limbo partner)</span>
          </p>
        )}
        {showOfferer && (
          <p className="mt-1 text-xs text-muted-foreground" data-testid={`listing-tile-offerer-${item.id}`}>
            Aangeboden door {item.offererFirstName} van{' '}
            <span
              role="link"
              tabIndex={0}
              onClick={goToOrg}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && goToOrg(e)}
              className="industrial-link text-foreground/80 hover:text-foreground cursor-pointer"
              data-testid={`listing-tile-org-link-${item.id}`}
            >
              {item.organisation.name}
            </span>
          </p>
        )}
        {!isValidated && (
          <p className="mt-2 text-xs text-muted-foreground italic">Log in voor de volledige aanbieding</p>
        )}
      </div>
    </div>
  );
}

export default function Catalogus() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [skip, setSkip] = useState(0);
  const [status, setStatus] = useState('beschikbaar');
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const limit = 20;
  const isValidated = user && typeof user === 'object' && user.status === 'validated';

  const load = useCallback(async (reset = false) => {
    setLoading(true);
    const startSkip = reset ? 0 : skip;
    try {
      const { data } = await api.get('/listings', {
        params: { filter: status || undefined, skip: startSkip, limit },
      });
      setTotal(data.total);
      setItems((prev) => reset ? data.items : [...prev, ...data.items]);
      setSkip(startSkip + data.items.length);
    } finally {
      setLoading(false);
    }
  }, [status, skip]);

  // Re-load on filter change
  useEffect(() => {
    setSkip(0);
    setItems([]);
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-12" data-testid="catalogus-page">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4 mb-10">
        <div>
          <h1 className="mt-2 text-5xl font-bold tracking-tight">Catalogus</h1>
          <p className="overline"> {total} aanbiedingen</p>
        </div>
        <button
          className="md:hidden btn-secondary !py-2"
          onClick={() => setMobileFilterOpen(true)}
          data-testid="filter-open-mobile"
        >
          Filter
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
        {/* Desktop sidebar */}
        <aside className="hidden md:block md:col-span-3 lg:col-span-2" data-testid="filter-sidebar">
          <div className="sticky top-24">
            <FilterPanel status={status} setStatus={setStatus} />
          </div>
        </aside>

        {/* Mobile drawer */}
        {mobileFilterOpen && (
          <div
            className="fixed inset-0 bg-background z-50 p-6 overflow-y-auto md:hidden"
            data-testid="filter-mobile-drawer"
          >
            <div className="flex items-center justify-between mb-8">
              <p className="overline">Filters</p>
              <button onClick={() => setMobileFilterOpen(false)} data-testid="filter-close-mobile" className="text-2xl">×</button>
            </div>
            <FilterPanel status={status} setStatus={setStatus} onClose={() => setMobileFilterOpen(false)} />
          </div>
        )}

        {/* Grid */}
        <div className="md:col-span-9 lg:col-span-10">
          {items.length === 0 && !loading && (
            <p className="text-muted-foreground" data-testid="catalogus-empty">Geen aanbiedingen gevonden.</p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-6 gap-y-12">
            {items.map((item) => (
              <ListingTile key={item.id} item={item} isValidated={isValidated} />
            ))}
          </div>

          {skip < total && (
            <div className="flex justify-center mt-16">
              <button
                onClick={() => load(false)}
                disabled={loading}
                className="btn-secondary"
                data-testid="catalogus-load-more"
              >
                {loading ? 'Laden…' : 'Meer laden →'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
